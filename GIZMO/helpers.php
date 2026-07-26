<?php
/**
 * GIZMO Helpers — Works on XAMPP AND Vercel
 * - XAMPP: requires config.php from same directory
 * - Vercel: requires api/config.php (because helpers.php is at root, config is at root too)
 */
$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) {
    // Fallback for Vercel
    $configPath = __DIR__ . '/api/config.php';
}
require_once $configPath;

// AI key detection for chat.php
$aiKeyPath = __DIR__ . '/data/ai.key';
if (file_exists($aiKeyPath)) {
    define('GIZMO_AI_KEY_FILE', $aiKeyPath);
}

function json_reply(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        exit;
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function read_json(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function user_id_from_email(string $email): string
{
    return sha1(strtolower(trim($email)));
}

function clean_name(string $name): string
{
    $name = trim(preg_replace('/\s+/', ' ', $name));
    return substr($name ?: 'Player', 0, 24);
}

function verify_google_id_token(string $credential): array
{
    $clientId = trim(gizmo_env('GOOGLE_CLIENT_ID'));
    if ($clientId === '') {
        throw new RuntimeException('Google Sign-In is not configured yet.');
    }
    if ($credential === '' || !function_exists('curl_init')) {
        throw new RuntimeException('A valid Google credential is required.');
    }

    $curl = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($credential));
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($raw === false || $status !== 200) {
        throw new RuntimeException($error ?: 'Google could not verify this sign-in.');
    }
    $profile = json_decode((string) $raw, true);
    $issuer = (string) ($profile['iss'] ?? '');
    if (!is_array($profile)
        || !hash_equals($clientId, (string) ($profile['aud'] ?? ''))
        || !in_array($issuer, ['accounts.google.com', 'https://accounts.google.com'], true)
        || (int) ($profile['exp'] ?? 0) <= time()
        || !filter_var($profile['email'] ?? '', FILTER_VALIDATE_EMAIL)
        || !in_array($profile['email_verified'] ?? false, [true, 'true', '1', 1], true)
        || trim((string) ($profile['sub'] ?? '')) === '') {
        throw new RuntimeException('Google returned an invalid or expired identity token.');
    }
    return $profile;
}

function photo_public_url(?string $photo, $version = null): string
{
    if (!$photo) return '';
    if (str_starts_with($photo, 'data:') || str_starts_with($photo, 'http://') || str_starts_with($photo, 'https://')) return $photo;
    $v = $version ? (is_numeric($version) ? (int) $version : strtotime((string) $version)) : time();
    return $photo . '?v=' . $v;
}

function format_person(array $row): array
{
    return [
        'id'    => $row['id'],
        'name'  => $row['name'],
        'photo' => photo_public_url($row['photo'] ?? '', $row['updated_at'] ?? null),
    ];
}

function format_user(array $row): array
{
    return [
        'id'    => $row['id'],
        'name'  => $row['name'],
        'email' => $row['email'],
        'photo' => photo_public_url($row['photo'] ?? '', $row['updated_at'] ?? null),
        'stats' => [
            'totalScore'  => (int) ($row['total_score'] ?? 0),
            'totalGames'  => (int) ($row['total_games'] ?? 0),
            'correct'     => (int) ($row['correct'] ?? 0),
            'answers'     => (int) ($row['answers'] ?? 0),
            'streak'      => (int) ($row['streak'] ?? 0),
            'lastPlayed'  => $row['last_played'] ?? null,
        ],
    ];
}

function fetch_user(PDO $db, string $id): ?array
{
    $stmt = $db->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ? format_user($row) : null;
}

function update_streak(PDO $db, string $userId): void
{
    $stmt = $db->prepare('SELECT streak, last_played FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row) return;

    $today = date('Y-m-d');
    $last = $row['last_played'];
    $streak = (int) $row['streak'];

    if ($last === $today) return;
    $streak = ($last === date('Y-m-d', strtotime('-1 day'))) ? $streak + 1 : 1;

    $db->prepare('UPDATE users SET streak = ?, last_played = ? WHERE id = ?')
        ->execute([$streak, $today, $userId]);
}

function category_id(PDO $db, string $slug): int
{
    static $map = null;
    if ($map === null) {
        $map = [];
        foreach ($db->query('SELECT id, slug FROM quiz_categories') as $row) {
            $map[$row['slug']] = (int) $row['id'];
        }
    }
    return $map[$slug] ?? $map['world'] ?? 1;
}

function answer_keys(PDO $db, int $categoryId): array
{
    $stmt = $db->prepare(
        'SELECT qq.sort_order - 1 AS round_num, qo.option_index
         FROM quiz_questions qq
         JOIN quiz_options qo ON qo.question_id = qq.id AND qo.is_correct = 1
         WHERE qq.category_id = ?
         ORDER BY qq.sort_order'
    );
    $stmt->execute([$categoryId]);
    $keys = [];
    foreach ($stmt->fetchAll() as $row) {
        $keys[(int) $row['round_num']] = (int) $row['option_index'];
    }
    return $keys;
}

function gizmo_load_ai_key(): string
{
    $candidates = [];

    // .env file
    $envPath = __DIR__ . '/.env';
    if (file_exists($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') continue;
            if (strpos($line, '=') === false) continue;
            list($k, $v) = explode('=', $line, 2);
            $k = trim($k);
            $v = trim($v, " \t\n\r\0\x0B\"'");
            if (in_array($k, ['AI_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY'], true)) {
                $candidates[] = $v;
            }
        }
    }

    // Key files
    foreach ([__DIR__ . '/data/ai.key'] as $kf) {
        if (is_readable($kf)) $candidates[] = trim((string) file_get_contents($kf));
    }

    // Environment variables
    foreach (['AI_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY'] as $envK) {
        $val = trim((string) (getenv($envK) ?: ($_ENV[$envK] ?? '')));
        if ($val !== '') $candidates[] = $val;
    }

    foreach ($candidates as $candidate) {
        if ($candidate !== '' && !preg_match('/REPLACE|YOUR|changeme|^sk-your/i', $candidate)) return $candidate;
    }
    return '';
}

