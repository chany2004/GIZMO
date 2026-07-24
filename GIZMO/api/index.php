<?php
/**
 * GIZMO API Router — works on BOTH XAMPP and Vercel
 * 
 * All JS files call this single endpoint with:
 *   POST /api/  with { "endpoint": "auth", "action": "login", ... }
 * 
 * This dispatches to the correct handler.
 */

require_once __DIR__ . '/helpers.php';

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    http_response_code(204);
    exit;
}

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

try {
    $db = gizmo_db();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => gizmo_db_error_for_user($e)]);
    exit;
}

// Clean old rooms
$db->exec('DELETE FROM rooms WHERE created_at < ' . (time() - 86400));

$data = read_json();
$endpoint = $data['endpoint'] ?? '';
$action = $data['action'] ?? '';

try {
    switch ($endpoint) {
        case 'auth':
            require __DIR__ . '/auth_handler.php';
            handle_auth($db, $action, $data);
            break;
        case 'quiz':
            require __DIR__ . '/quiz_handler.php';
            handle_quiz($db, $action, $data);
            break;
        case 'multiplayer':
            require __DIR__ . '/multiplayer_handler.php';
            handle_multiplayer($db, $action, $data);
            break;
        case 'profile':
            require __DIR__ . '/profile_handler.php';
            handle_profile($db, $action, $data);
            break;
        case 'study':
            require __DIR__ . '/study_handler.php';
            handle_study($db, $action, $data);
            break;
        case 'chat':
            require __DIR__ . '/chat_handler.php';
            handle_chat($action, $data);
            break;
        default:
            json_reply(['error' => 'Unknown endpoint.'], 400);
    }
} catch (Throwable $e) {
    json_reply(['error' => $e->getMessage()], 500);
}

