<?php
require_once __DIR__ . '/quiz_lib.php';

$data = read_json();
$action = $data['action'] ?? $_GET['action'] ?? '';

try {
    $db = gizmo_db();
    ensure_quiz_catalog($db);
} catch (Throwable $e) {
    json_reply(['error' => gizmo_db_error_for_user($e)], 500);
}

if ($action === 'categories') {
    json_reply(['categories' => fetch_categories($db)]);
}

if ($action === 'questions') {
    $slug = preg_replace('/[^a-z0-9_]/', '', strtolower($data['slug'] ?? $_GET['slug'] ?? ''));
    if (!$slug) {
        json_reply(['error' => 'Category slug is required.'], 400);
    }
    $questions = fetch_questions($db, $slug);
    if (!$questions) {
        json_reply(['error' => 'Category not found.'], 404);
    }
    json_reply(['slug' => $slug, 'questions' => $questions]);
}

json_reply(['error' => 'Invalid quiz request.'], 400);
