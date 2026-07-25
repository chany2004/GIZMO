<?php
/**
 * GIZMO — Database Configuration
 * AUTO-DETECTS: XAMPP (local) vs Vercel (serverless)
 * 
 * ✅ Works on XAMPP with MySQL (default)
 * ✅ Works on Vercel with PlanetScale MySQL (env vars)
 * 
 * For Vercel: Set DB_HOST, DB_NAME, DB_USER, DB_PASS in Project Settings
 */

function gizmo_env(string $key, string $default = ''): string
{
    static $loaded = false;
    if (!$loaded) {
        $loaded = true;
        $envFile = __DIR__ . '/.env';
        if (is_readable($envFile)) {
            foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
                [$name, $value] = explode('=', $line, 2);
                $name = trim($name);
                $value = trim($value, " \t\n\r\0\x0B\"'");
                if ($name !== '') { $_ENV[$name] = $value; putenv($name . '=' . $value); }
            }
        }
    }
    $value = getenv($key);
    return $value !== false && $value !== '' ? $value : ($_ENV[$key] ?? $default);
}

// cPanel reads values from a root .env file; Vercel reads Project Settings variables.
$isVercel = !empty($_SERVER['VERCEL']) || !empty(getenv('VERCEL'));
$hasHostedDatabase = gizmo_env('DB_HOST') !== '';

if ($isVercel || $hasHostedDatabase) {
    define('DB_HOST', gizmo_env('DB_HOST'));
    define('DB_PORT', gizmo_env('DB_PORT', '3306'));
    define('DB_NAME', gizmo_env('DB_NAME'));
    define('DB_USER', gizmo_env('DB_USER'));
    define('DB_PASS', gizmo_env('DB_PASS'));
    define('DB_SSL_CA_BASE64', gizmo_env('DB_SSL_CA_BASE64'));
} else {
    // XAMPP local defaults
    define('DB_HOST', 'localhost');
    define('DB_PORT', '3306');
    define('DB_NAME', 'GIZMO');
    define('DB_USER', 'root');
    define('DB_PASS', '');
    define('DB_SSL_CA_BASE64', '');
}

define('DB_CHARSET', 'utf8mb4');

function gizmo_is_placeholder_key(string $key): bool
{
    if ($key === '') return true;
    if (preg_match('/REPLACE|REPLACE_WITH|YOUR[_\-\s]?KEY|REPLACE-?WITH|example|changeme|xxxxxxxx/i', $key)) return true;
    if (preg_match('/^sk-(your|test|fake|sample|xxx|proj-your)/i', $key)) return true;
    return false;
}

function gizmo_is_supported_ai_key(string $key): bool
{
    // Provider keys used by this app have a dependable public prefix. Ignoring
    // other values prevents an OAuth token or placeholder from being sent to
    // the Gemini endpoint as an API key.
    return str_starts_with($key, 'gsk_')
        || str_starts_with($key, 'AIza')
        || str_starts_with($key, 'sk-');
}

function gizmo_load_ai_key_from_sources(): string
{
    $candidates = [];

    // Explicit provider settings take precedence on hosted deployments.
    foreach (['GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY'] as $envKey) {
        $value = gizmo_env($envKey);
        if ($value !== '') $candidates[] = $value;
    }

    // Local setup_ai.php stores the chosen key here. Check it before a generic
    // AI_API_KEY so an old invalid local value cannot override a Groq key.
    foreach ([__DIR__ . '/data/ai.key', __DIR__ . '/data/openai.key'] as $kf) {
        if (is_readable($kf)) $candidates[] = trim((string) file_get_contents($kf));
    }

    // Generic compatibility setting, used only when no explicit key exists.
    foreach (['AI_API_KEY'] as $envK) {
        $val = trim((string) (getenv($envK) ?: ($_ENV[$envK] ?? '')));
        if ($val !== '') $candidates[] = $val;
    }

    foreach ($candidates as $candidate) {
        if (!gizmo_is_placeholder_key($candidate) && gizmo_is_supported_ai_key($candidate)) return $candidate;
    }
    return '';
}

$__gizmo_ai_raw = gizmo_load_ai_key_from_sources();
define('AI_API_KEY', $__gizmo_ai_raw);
define('OPENAI_API_KEY', $__gizmo_ai_raw);

function gizmo_ai_key(): string { return AI_API_KEY; }
function gizmo_openai_key(): string { return OPENAI_API_KEY; }

function gizmo_db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $hosts = array_unique([DB_HOST, DB_HOST === 'localhost' ? '127.0.0.1' : DB_HOST]);
        $last = null;
        foreach ($hosts as $host) {
            try {
                $dsn = 'mysql:host=' . $host . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
                $options = [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ];
                // TiDB Cloud requires TLS. Store the CA certificate as Base64 in
                // Vercel, then create a temporary certificate file per runtime.
                if (DB_SSL_CA_BASE64 !== '' && defined('PDO::MYSQL_ATTR_SSL_CA')) {
                    $caPath = sys_get_temp_dir() . '/gizmo-tidb-ca.pem';
                    if (!is_file($caPath)) {
                        $ca = base64_decode(DB_SSL_CA_BASE64, true);
                        if ($ca === false) throw new PDOException('DB_SSL_CA_BASE64 is not valid Base64.');
                        file_put_contents($caPath, $ca, LOCK_EX);
                    }
                    $options[PDO::MYSQL_ATTR_SSL_CA] = $caPath;
                    if (defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')) {
                        $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
                    }
                }
                $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
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
    if (preg_match('/2002|10061|refused|actively refused/i', $msg))
        return 'Database connection failed. Check that MySQL is running locally or verify DB_HOST, DB_NAME, DB_USER, and DB_PASS in .env.';
    if (preg_match('/1049|Unknown database/i', $msg))
        return 'Database not found. Create it in cPanel and import database/gizmo.sql through phpMyAdmin.';
    if (preg_match('/1045|Access denied/i', $msg))
        return 'Database login failed. Check DB_USER and DB_PASS in .env and confirm the user has database privileges.';
    return 'Database connection failed: ' . $e->getMessage();
}

