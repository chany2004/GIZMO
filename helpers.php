<?php
require_once __DIR__ . '/config.php';

function json_reply(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
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

function photo_public_url(?string $photo, $version = null): string
{
    if (!$photo) {
        return '';
    }
    if (str_starts_with($photo, 'data:') || str_starts_with($photo, 'http://') || str_starts_with($photo, 'https://')) {
        return $photo;
    }
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
    if (!$row) {
        return;
    }

    $today = date('Y-m-d');
    $last = $row['last_played'];
    $streak = (int) $row['streak'];

    if ($last === $today) {
        return;
    }
    if ($last === date('Y-m-d', strtotime('-1 day'))) {
        $streak++;
    } else {
        $streak = 1;
    }

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
