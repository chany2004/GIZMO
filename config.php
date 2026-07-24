<?php
/**
 * GIZMO — MySQL database connection (XAMPP default)
 */
define('DB_HOST', 'localhost');
define('DB_NAME', 'GIZMO');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHARSET', 'utf8mb4');

function gizmo_is_placeholder_key(string $key): bool
{
    if ($key === '') {
        return true;
    }
    if (preg_match('/REPLACE|REPLACE_WITH|YOUR[_\-\s]?KEY|REPLACE-?WITH|example|changeme|xxxxxxxx/i', $key)) {
        return true;
    }
    if (preg_match('/^sk-(your|test|fake|sample|xxx|proj-your)/i', $key)) {
        return true;
    }
    return false;
}

function gizmo_load_ai_key_from_sources(): string
{
    $candidates = [];

    if (file_exists(__DIR__ . '/.env')) {
        $dotenv = file(__DIR__ . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($dotenv as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            if (strpos($line, '=') === false) {
                continue;
            }
            list($k, $v) = explode('=', $line, 2);
            $k = trim($k);
            $v = trim($v, " \t\n\r\0\x0B\"'");
            putenv("$k=$v");
            $_ENV[$k] = $v;
            if (in_array($k, ['AI_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY'], true)) {
                $candidates[] = $v;
            }
        }
    }

    $keyFiles = [__DIR__ . '/data/ai.key', __DIR__ . '/data/openai.key'];
    foreach ($keyFiles as $kf) {
        if (is_readable($kf)) {
            $candidates[] = trim((string) file_get_contents($kf));
        }
    }

    $envKeys = ['AI_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY'];
    foreach ($envKeys as $envK) {
        $val = trim((string) (getenv($envK) ?: ($_ENV[$envK] ?? '')));
        if ($val !== '') {
            $candidates[] = $val;
        }
    }

    foreach ($candidates as $candidate) {
        if (!gizmo_is_placeholder_key($candidate)) {
            return $candidate;
        }
    }

    return '';
}

// AI API key (.env, data/ai.key, data/openai.key, or server environment)
$__gizmo_ai_raw = gizmo_load_ai_key_from_sources();
define('AI_API_KEY', $__gizmo_ai_raw);
define('OPENAI_API_KEY', $__gizmo_ai_raw);

function gizmo_ai_key(): string
{
    return AI_API_KEY;
}

function gizmo_openai_key(): string
{
    return OPENAI_API_KEY;
}

function gizmo_db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $hosts = array_values(array_unique([DB_HOST, DB_HOST === 'localhost' ? '127.0.0.1' : DB_HOST]));
        $last = null;
        foreach ($hosts as $host) {
            try {
                $dsn = 'mysql:host=' . $host . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
                $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]);
                break;
            } catch (PDOException $e) {
                $last = $e;
                $pdo = null;
            }
        }
        if ($pdo === null) {
            throw $last ?? new PDOException('Database connection failed.');
        }
    }
    return $pdo;
}

function gizmo_db_error_for_user(Throwable $e): string
{
    $msg = $e->getMessage();
    if (preg_match('/2002|10061|refused|actively refused/i', $msg)) {
        return 'Database connection failed. Open XAMPP Control Panel and click Start on MySQL, then refresh this page.';
    }
    if (preg_match('/1049|Unknown database/i', $msg)) {
        return 'Database GIZMO not found. In phpMyAdmin, import database/gizmo.sql.';
    }
    if (preg_match('/1045|Access denied/i', $msg)) {
        return 'Database login failed. Check DB_USER and DB_PASS in config.php.';
    }
    return 'Database connection failed.';
}
