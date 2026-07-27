<?php
require_once __DIR__ . '/helpers.php';

$data = read_json();
$action = $data['action'] ?? '';

if ($action === 'googleConfig') {
    $clientId = gizmo_google_client_id();
    json_reply(['configured' => $clientId !== '', 'clientId' => $clientId]);
}

try {
    $db = gizmo_db();
} catch (Throwable $e) {
    json_reply(['error' => gizmo_db_error_for_user($e)], 500);
}

if ($action === 'register') {
    $email = strtolower(trim($data['email'] ?? ''));
    $password = $data['password'] ?? '';
    $name = clean_name($data['name'] ?? explode('@', $email)[0] ?? 'Player');

    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_reply(['error' => 'Valid email is required.'], 400);
    }
    if (strlen($password) < 6) {
        json_reply(['error' => 'Password must be at least 6 characters.'], 400);
    }

    $id = user_id_from_email($email);
    $exists = $db->prepare('SELECT id FROM users WHERE email = ?');
    $exists->execute([$email]);
    if ($exists->fetch()) {
        json_reply(['error' => 'An account with this email already exists.'], 409);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $db->prepare(
        'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
    )->execute([$id, $name, $email, $hash]);

    json_reply(['user' => fetch_user($db, $id)]);
}

if ($action === 'login') {
    $email = strtolower(trim($data['email'] ?? ''));
    $password = $data['password'] ?? '';

    $stmt = $db->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $row = $stmt->fetch();

    if (!$row || !$row['password_hash'] || !password_verify($password, $row['password_hash'])) {
        json_reply(['error' => 'Invalid email or password.'], 401);
    }

    json_reply(['user' => format_user($row)]);
}

if ($action === 'google') {
    try {
        $profile = verify_google_id_token(trim((string) ($data['credential'] ?? '')));
    } catch (Throwable $e) {
        json_reply(['error' => $e->getMessage()], 401);
    }
    $email = strtolower(trim((string) $profile['email']));
    $name = clean_name((string) ($profile['name'] ?? explode('@', $email)[0]));
    $googleId = trim((string) $profile['sub']);

    $id = user_id_from_email($email);
    $stmt = $db->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    $isNewUser = !$row;

    if ($row) {
        $db->prepare('UPDATE users SET name = ?, google_id = ? WHERE id = ?')
            ->execute([$name, $googleId, $id]);
    } else {
        $db->prepare(
            'INSERT INTO users (id, name, email, google_id) VALUES (?, ?, ?, ?)'
        )->execute([$id, $name, $email, $googleId]);
    }

    json_reply(['user' => fetch_user($db, $id), 'isNewUser' => $isNewUser]);
}

if ($action === 'completeOnboarding') {
    $id = trim((string) ($data['id'] ?? ''));
    $name = clean_name((string) ($data['name'] ?? ''));

    if ($id === '' || $name === '') {
        json_reply(['error' => 'User id and username are required.'], 400);
    }

    $update = $db->prepare('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    $update->execute([$name, $id]);
    if ($update->rowCount() === 0) {
        $check = $db->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
        $check->execute([$id]);
        if (!$check->fetch()) {
            json_reply(['error' => 'Player account not found. Please sign in again.'], 404);
        }
    }

    json_reply(['user' => fetch_user($db, $id)]);
}

if ($action === 'me') {
    $id = $data['id'] ?? '';
    $user = fetch_user($db, $id);
    if (!$user) {
        json_reply(['error' => 'User not found.'], 404);
    }
    json_reply(['user' => $user]);
}

if ($action === 'updateStats') {
    $id = $data['id'] ?? '';
    $delta = $data['delta'] ?? [];

    if (!$id) {
        json_reply(['error' => 'User id is required.'], 400);
    }

    update_streak($db, $id);

    $db->prepare(
        'UPDATE users SET
            total_score = total_score + ?,
            total_games = total_games + ?,
            correct = correct + ?,
            answers = answers + ?
         WHERE id = ?'
    )->execute([
        (int) ($delta['totalScore'] ?? 0),
        (int) ($delta['totalGames'] ?? 0),
        (int) ($delta['correct'] ?? 0),
        (int) ($delta['answers'] ?? 0),
        $id,
    ]);

    json_reply(['user' => fetch_user($db, $id)]);
}

if ($action === 'updatePhoto') {
    $id = trim((string) ($data['id'] ?? ''));
    $photo = trim((string) ($data['photo'] ?? ''));

    if (!$id || !$photo) {
        json_reply(['error' => 'User id and photo are required.'], 400);
    }
    if (!preg_match('#^data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$#', $photo)) {
        json_reply(['error' => 'Please use a JPG, PNG, or WebP profile photo.'], 400);
    }
    if (strlen($photo) > 2 * 1024 * 1024) {
        json_reply(['error' => 'The processed photo is still too large. Please choose another image.'], 400);
    }

    $exists = $db->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
    $exists->execute([$id]);
    if (!$exists->fetch()) {
        json_reply(['error' => 'Profile not found. Please log in again.'], 404);
    }

    $db->prepare('UPDATE users SET photo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$photo, $id]);
    json_reply(['user' => fetch_user($db, $id)]);
}

if ($action === 'addKnown') {
    $userId = $data['userId'] ?? '';
    $knownUserId = $data['knownUserId'] ?? null;
    $knownName = $knownUserId ? null : clean_name($data['knownName'] ?? '');

    if (!$userId || (!$knownUserId && !$knownName)) {
        json_reply(['error' => 'Invalid known player request.'], 400);
    }

    if ($knownUserId) {
        $db->prepare(
            'INSERT IGNORE INTO user_known_players (user_id, known_user_id) VALUES (?, ?)'
        )->execute([$userId, $knownUserId]);
    } else {
        $db->prepare(
            'INSERT IGNORE INTO user_known_players (user_id, known_name) VALUES (?, ?)'
        )->execute([$userId, $knownName]);
    }

    json_reply(['ok' => true]);
}

if ($action === 'social') {
    $id = $data['id'] ?? '';
    if (!$id) {
        json_reply(['error' => 'User id is required.'], 400);
    }

    $following = $db->prepare(
        'SELECT u.id, u.name, u.photo, u.updated_at FROM user_follows f
         JOIN users u ON u.id = f.following_id
         WHERE f.follower_id = ? ORDER BY u.name'
    );
    $following->execute([$id]);

    $followers = $db->prepare(
        'SELECT u.id, u.name, u.photo, u.updated_at FROM user_follows f
         JOIN users u ON u.id = f.follower_id
         WHERE f.following_id = ? ORDER BY u.name'
    );
    $followers->execute([$id]);

    $known = $db->prepare(
        'SELECT COALESCE(u.name, k.known_name) AS name, k.known_user_id AS userId,
                u.photo, u.updated_at
         FROM user_known_players k
         LEFT JOIN users u ON u.id = k.known_user_id
         WHERE k.user_id = ?
         ORDER BY name LIMIT 20'
    );
    $known->execute([$id]);

    $mapPeople = fn(array $rows) => array_map(function ($row) {
        if (!isset($row['id'])) {
            return [
                'name'   => $row['name'],
                'userId' => $row['userId'] ?? null,
                'photo'  => photo_public_url($row['photo'] ?? '', $row['updated_at'] ?? null),
            ];
        }
        return format_person($row);
    }, $rows);

    json_reply([
        'following' => $mapPeople($following->fetchAll()),
        'followers' => $mapPeople($followers->fetchAll()),
        'known'     => array_map(fn($row) => [
            'name'   => $row['name'],
            'userId' => $row['userId'],
            'photo'  => photo_public_url($row['photo'] ?? '', $row['updated_at'] ?? null),
        ], $known->fetchAll()),
    ]);
}

json_reply(['error' => 'Invalid auth request.'], 400);
