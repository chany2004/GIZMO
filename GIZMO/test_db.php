<?php
require_once __DIR__ . '/config.php';

header('Content-Type: text/plain; charset=utf-8');

try {
    $db = gizmo_db();
    $tables = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    echo "Database connection OK\n";
    echo 'Database: ' . DB_NAME . "\n";
    echo 'Tables: ' . count($tables) . "\n";
    exit(0);
} catch (Throwable $e) {
    http_response_code(500);
    echo gizmo_db_error_for_user($e) . "\n";
    echo "\nDetails: " . $e->getMessage() . "\n";
    exit(1);
}
