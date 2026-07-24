<?php
require_once __DIR__ . '/helpers.php';

$data = read_json();
$action = $data['action'] ?? '';

try {
    $db = gizmo_db();
} catch (Throwable $e) {
    json_reply(['error' => gizmo_db_error_for_user($e)], 500);
}

if ($action === 'register') {
    $email = strtolower(trim($data['email'] ?? ''));
    $name = clean_name($data['name'] ?? 'Player');
    $photo = $data['photo'] ?? '';

    if (!$email) {
        json_reply(['error' => 'Email is required.'], 400);
    }

    $id = user_id_from_email($email);
    $stmt = $db->prepare('SELECT id FROM users WHERE id = ?');
    $stmt->execute([$id]);

    if ($stmt->fetch()) {
        $db->prepare('UPDATE users SET name = ?, photo = COALESCE(NULLIF(?, \'\'), photo) WHERE id = ?')
            ->execute([$name, $photo, $id]);
    } else {
        $db->prepare('INSERT INTO users (id, name, email, photo) VALUES (?, ?, ?, ?)')
            ->execute([$id, $name, $email, $photo ?: null]);
    }

    $user = fetch_user($db, $id);
    $followers = $db->prepare('SELECT COUNT(*) FROM user_follows WHERE following_id = ?');
    $followers->execute([$id]);
    $following = $db->prepare('SELECT COUNT(*) FROM user_follows WHERE follower_id = ?');
    $following->execute([$id]);

    json_reply(['profile' => [
        'id'        => $user['id'],
        'name'      => $user['name'],
        'email'     => $user['email'],
        'photo'     => $user['photo'],
        'followers' => (int) $followers->fetchColumn(),
        'following' => (int) $following->fetchColumn(),
    ]]);
}

if ($action === 'list') {
    $stmt = $db->query(
        'SELECT u.id, u.name, u.photo, u.updated_at,
                (SELECT COUNT(*) FROM user_follows f WHERE f.following_id = u.id) AS followers
         FROM users u ORDER BY u.total_score DESC, u.name LIMIT 50'
    );
    $profiles = [];
    foreach ($stmt->fetchAll() as $row) {
        $profiles[] = [
            'id'        => $row['id'],
            'name'      => $row['name'],
            'photo'     => photo_public_url($row['photo'] ?? '', $row['updated_at'] ?? null),
            'followers' => (int) $row['followers'],
        ];
    }
    json_reply(['profiles' => $profiles]);
}

if ($action === 'get') {
    $id = $data['id'] ?? '';
    $user = fetch_user($db, $id);
    if (!$user) {
        json_reply(['error' => 'Profile not found.'], 404);
    }

    $followers = $db->prepare('SELECT COUNT(*) FROM user_follows WHERE following_id = ?');
    $followers->execute([$id]);
    $following = $db->prepare('SELECT COUNT(*) FROM user_follows WHERE follower_id = ?');
    $following->execute([$id]);

    json_reply(['profile' => [
        'id'        => $user['id'],
        'name'      => $user['name'],
        'photo'     => $user['photo'],
        'followers' => (int) $followers->fetchColumn(),
        'following' => (int) $following->fetchColumn(),
    ]]);
}

if ($action === 'follow') {
    $followerId = $data['id'] ?? '';
    $targetId = $data['target'] ?? '';

    if (!$followerId || !$targetId || $followerId === $targetId) {
        json_reply(['error' => 'Invalid follow request.'], 400);
    }

    $check = $db->prepare('SELECT id FROM users WHERE id IN (?, ?)');
    $check->execute([$followerId, $targetId]);
    if ($check->rowCount() < 2) {
        json_reply(['error' => 'User not found.'], 404);
    }

    $exists = $db->prepare(
        'SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?'
    );
    $exists->execute([$followerId, $targetId]);
    $on = !$exists->fetch();

    if ($on) {
        $db->prepare('INSERT INTO user_follows (follower_id, following_id) VALUES (?, ?)')
            ->execute([$followerId, $targetId]);
    } else {
        $db->prepare('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?')
            ->execute([$followerId, $targetId]);
    }

    json_reply(['following' => $on]);
}

if ($action === 'isFollowing') {
    $followerId = $data['id'] ?? '';
    $targetId = $data['target'] ?? '';
    $stmt = $db->prepare(
        'SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?'
    );
    $stmt->execute([$followerId, $targetId]);
    json_reply(['following' => (bool) $stmt->fetch()]);
}

json_reply(['error' => 'Invalid profile request.'], 400);
