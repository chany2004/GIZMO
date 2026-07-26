<?php
/**
 * GIZMO Unified API Endpoint
 * Works on BOTH XAMPP (root) and Vercel (/api.php)
 * 
 * All JS files call this single endpoint:
 *   fetch('api.php', { body: JSON.stringify({ endpoint: 'auth', action: 'login', ... }) })
 * 
 * On Vercel, PHP files at root are served via @vercel/php runtime.
 */

// Handle CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Detect environment
$isVercel = !empty($_SERVER['VERCEL']) || !empty(getenv('VERCEL'));

require_once __DIR__ . '/helpers.php';

$data = read_json();
$endpoint = $data['endpoint'] ?? '';
$action = $data['action'] ?? '';

// Public Google browser configuration never needs a database connection.
// Return it before the hosted DB check so login can initialize independently.
if ($endpoint === 'auth' && $action === 'googleConfig') {
    $clientId = gizmo_google_client_id();
    json_reply(['configured' => $clientId !== '', 'clientId' => $clientId]);
}

// AI chat does not read or write the database. Let it run even while a hosted
// database is being configured (for example, while TiDB TLS settings are
// still being added on Vercel).
if ($endpoint === 'chat') {
    require __DIR__ . '/chat.php';
}

try {
    $db = gizmo_db();
} catch (Throwable $e) {
    json_reply([
        'error' => gizmo_db_error_for_user($e),
        'offline' => true,
        'message' => 'Database unavailable. Using offline mode (XAMPP MySQL or Vercel PlanetScale required).'
    ], 500);
}

// Keep every API failure JSON-shaped. Without this guard, a PDO exception or
// PHP error becomes an HTML Function response and the browser cannot explain
// what went wrong.
try {
    switch ($endpoint) {
        case 'auth':
            // Auth actions: register, login, google, me, updateStats, updatePhoto, addKnown, social
            require __DIR__ . '/auth.php';
            break;
        case 'profile':
            // Profile actions: register, list, get, follow, isFollowing
            require __DIR__ . '/profiles.php';
            break;
        case 'quiz':
            // Quiz actions: categories, questions
            require __DIR__ . '/quiz.php';
            break;
        case 'multiplayer':
            // Multiplayer actions: create, join, start, answer, state
            require __DIR__ . '/multiplayer.php';
            break;
        case 'study':
            // Study actions: aiStatus, generateCards, saveSet, saveResult, list
            require __DIR__ . '/study.php';
            break;
        default:
            json_reply(['error' => 'Unknown endpoint: ' . $endpoint], 400);
    }
} catch (Throwable $e) {
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) {
        $db->rollBack();
    }

    try {
        $requestId = bin2hex(random_bytes(4));
    } catch (Throwable $ignored) {
        $requestId = substr(sha1(uniqid('', true)), 0, 8);
    }
    error_log(sprintf(
        '[GIZMO %s] %s/%s failed: %s: %s at %s:%d',
        $requestId,
        $endpoint ?: 'unknown',
        $action ?: 'unknown',
        get_class($e),
        $e->getMessage(),
        $e->getFile(),
        $e->getLine()
    ));

    $message = $endpoint === 'multiplayer'
        ? 'The multiplayer room server could not complete that request. Please try again.'
        : 'The server could not complete that request. Please try again.';
    if ($endpoint === 'multiplayer'
        && preg_match('/room_custom_quizzes|base table|table.+doesn.t exist|SQLSTATE\\[42S02\\]|1146/i', $e->getMessage())) {
        $message = 'Multiplayer storage is not ready. Import the latest database schema, then try again.';
    }

    json_reply([
        'error' => $message,
        'requestId' => $requestId,
    ], 500);
}

