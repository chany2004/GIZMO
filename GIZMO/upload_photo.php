<?php
require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json; charset=utf-8');

$id = trim($_POST['id'] ?? '');
if (!$id || !isset($_FILES['photo'])) {
    json_reply(['error' => 'User id and photo file are required.'], 400);
}

$file = $_FILES['photo'];
if ($file['error'] !== UPLOAD_ERR_OK) {
    $messages = [
        UPLOAD_ERR_INI_SIZE   => 'Image is too large. Try a smaller photo.',
        UPLOAD_ERR_FORM_SIZE  => 'Image is too large. Try a smaller photo.',
        UPLOAD_ERR_PARTIAL    => 'Upload was interrupted. Please try again.',
        UPLOAD_ERR_NO_FILE    => 'No file was selected.',
    ];
    json_reply(['error' => $messages[$file['error']] ?? 'Upload failed.'], 400);
}

if ($file['size'] > 2 * 1024 * 1024) {
    json_reply(['error' => 'Image must be 2 MB or smaller.'], 400);
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

$allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
if (!isset($allowed[$mime])) {
    json_reply(['error' => 'Please upload a JPG, PNG, WebP, or GIF image.'], 400);
}

try {
    $db = gizmo_db();
} catch (Throwable $e) {
    json_reply(['error' => gizmo_db_error_for_user($e)], 500);
}

$check = $db->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
$check->execute([$id]);
if (!$check->fetch()) {
    json_reply(['error' => 'User not found.'], 404);
}

$dir = __DIR__ . '/uploads/avatars';
if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
    json_reply(['error' => 'Upload folder unavailable.'], 500);
}

$safeId = preg_replace('/[^a-f0-9]/', '', $id);
foreach (array_merge(glob($dir . '/' . $safeId . '.*') ?: [], glob($dir . '/' . $safeId . '-*') ?: []) as $old) {
    @unlink($old);
}

$ext = $allowed[$mime];
$relative = 'uploads/avatars/' . $safeId . '-' . time() . '.' . $ext;
$dest = __DIR__ . '/' . $relative;

if (!move_uploaded_file($file['tmp_name'], $dest)) {
    json_reply(['error' => 'Could not save photo. Check folder permissions.'], 500);
}

$db->prepare('UPDATE users SET photo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$relative, $id]);
json_reply(['user' => fetch_user($db, $id)]);
