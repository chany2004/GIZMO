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

try {
    $db = gizmo_db();
} catch (Throwable $e) {
    json_reply([
        'error' => gizmo_db_error_for_user($e),
        'offline' => true,
        'message' => 'Database unavailable. Using offline mode (XAMPP MySQL or Vercel PlanetScale required).'
    ], 500);
}

// Route to the correct handler
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
    case 'chat':
        // Chat: send message to AI
        require __DIR__ . '/chat.php';
        break;
    default:
        json_reply(['error' => 'Unknown endpoint: ' . $endpoint], 400);
}

