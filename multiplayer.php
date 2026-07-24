<?php
require_once __DIR__ . '/helpers.php';

$data = read_json();
$action = $data['action'] ?? '';

try {
    $db = gizmo_db();
} catch (Throwable $e) {
    json_reply(['error' => gizmo_db_error_for_user($e)], 500);
}

$db->exec('DELETE FROM rooms WHERE created_at < ' . (time() - 86400));

function load_room(PDO $db, string $code): ?array
{
    $stmt = $db->prepare(
        'SELECT r.*, c.slug AS category_slug
         FROM rooms r
         JOIN quiz_categories c ON c.id = r.category_id
         WHERE r.room_code = ? LIMIT 1'
    );
    $stmt->execute([$code]);
    return $stmt->fetch() ?: null;
}

function load_players(PDO $db, int $roomId): array
{
    $stmt = $db->prepare(
        'SELECT rp.id, rp.user_id, rp.name, rp.score, rp.correct, rp.streak,
                rp.best_streak AS bestStreak, rp.answered_round AS answeredRound, rp.round,
                u.photo, u.updated_at
         FROM room_players rp
         LEFT JOIN users u ON u.id = rp.user_id
         WHERE rp.room_id = ? ORDER BY rp.score DESC, rp.correct DESC'
    );
    $stmt->execute([$roomId]);
    $players = [];
    foreach ($stmt->fetchAll() as $p) {
        $players[] = [
            'id'             => $p['id'],
            'userId'         => $p['user_id'],
            'name'           => $p['name'],
            'photo'          => photo_public_url($p['photo'] ?? '', $p['updated_at'] ?? null),
            'score'          => (int) $p['score'],
            'correct'        => (int) $p['correct'],
            'streak'         => (int) $p['streak'],
            'bestStreak'     => (int) $p['bestStreak'],
            'answeredRound'  => (int) $p['answeredRound'],
            'round'          => (int) $p['round'],
        ];
    }
    return $players;
}

function room_state(PDO $db, array $roomRow): array
{
    $now = time();
    $status = $roomRow['status'];
    $startedAt = $roomRow['started_at'] ? (int) $roomRow['started_at'] : null;
    $round = 0;
    $finished = $status === 'finished';

    if ($status === 'started' && $startedAt) {
        $round = min(14, max(0, intdiv($now - $startedAt, 20)));
        if ($now - $startedAt >= 300) {
            $db = gizmo_db();
            $db->prepare('UPDATE rooms SET status = ? WHERE id = ?')->execute(['finished', $roomRow['id']]);
            $status = 'finished';
            $finished = true;
            $round = 14;
        }
    }

    $players = load_players($db, (int) $roomRow['id']);

    return [
        'room' => [
            'code'       => $roomRow['room_code'],
            'category'   => $roomRow['category_slug'],
            'hostId'     => $roomRow['host_id'],
            'status'     => $status,
            'createdAt'  => (int) $roomRow['created_at'],
            'startedAt'  => $startedAt,
            'players'    => $players,
        ],
        'round'      => $round,
        'finished'   => $finished,
        'serverTime' => $now,
    ];
}

function sync_user_stats(PDO $db, string $userId, int $score, int $correct, int $total): void
{
    if (!$userId) {
        return;
    }
    update_streak($db, $userId);
    $db->prepare(
        'UPDATE users SET total_score = total_score + ?, total_games = total_games + 1,
         correct = correct + ?, answers = answers + ? WHERE id = ?'
    )->execute([$score, $correct, $total, $userId]);
}

if ($action === 'create') {
    $slug = preg_replace('/[^a-z0-9_]/', '', strtolower($data['category'] ?? 'world'));
    $check = $db->prepare('SELECT id FROM quiz_categories WHERE slug = ? LIMIT 1');
    $check->execute([$slug ?: 'world']);
    $row = $check->fetch();
    if (!$row) {
        json_reply(['error' => 'Invalid category.'], 400);
    }
    $catId = (int) $row['id'];
    $name = clean_name($data['name'] ?? '');
    $userId = $data['userId'] ?? null;

    do {
        $code = strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        $check = $db->prepare('SELECT id FROM rooms WHERE room_code = ?');
        $check->execute([$code]);
    } while ($check->fetch());

    $playerId = bin2hex(random_bytes(12));
    $now = time();

    $db->beginTransaction();
    $db->prepare(
        'INSERT INTO rooms (room_code, category_id, host_id, status, created_at, started_at)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$code, $catId, $playerId, 'lobby', $now, null]);

    $roomId = (int) $db->lastInsertId();
    $db->prepare(
        'INSERT INTO room_players (id, room_id, user_id, name) VALUES (?, ?, ?, ?)'
    )->execute([$playerId, $roomId, $userId ?: null, $name]);
    $db->commit();

    $roomRow = load_room($db, $code);
    json_reply([
        'roomCode'  => $code,
        'playerId'  => $playerId,
        'state'     => room_state($db, $roomRow),
    ]);
}

if ($action === 'join') {
    $code = strtoupper(preg_replace('/[^A-Z0-9]/i', '', $data['roomCode'] ?? ''));
    $roomRow = load_room($db, $code);

    if (!$roomRow) {
        json_reply(['error' => 'Room not found.'], 404);
    }

    $count = $db->prepare('SELECT COUNT(*) FROM room_players WHERE room_id = ?');
    $count->execute([(int) $roomRow['id']]);
    if ((int) $count->fetchColumn() >= 10) {
        json_reply(['error' => 'This room is full (10 players max).'], 409);
    }

    $playerId = bin2hex(random_bytes(12));
    $name = clean_name($data['name'] ?? '');
    $userId = $data['userId'] ?? null;

    $db->prepare(
        'INSERT INTO room_players (id, room_id, user_id, name) VALUES (?, ?, ?, ?)'
    )->execute([$playerId, (int) $roomRow['id'], $userId ?: null, $name]);

    json_reply([
        'roomCode' => $code,
        'playerId' => $playerId,
        'state'    => room_state($db, load_room($db, $code)),
    ]);
}

$code = strtoupper(preg_replace('/[^A-Z0-9]/i', '', $data['roomCode'] ?? ''));
$roomRow = load_room($db, $code);

if (!$roomRow) {
    json_reply(['error' => 'Room expired or not found.'], 404);
}

$roomId = (int) $roomRow['id'];
$playerId = $data['playerId'] ?? '';

$stmt = $db->prepare('SELECT * FROM room_players WHERE id = ? AND room_id = ? LIMIT 1');
$stmt->execute([$playerId, $roomId]);
$player = $stmt->fetch();

if (!$player) {
    json_reply(['error' => 'Player session not found.'], 403);
}

$response = [];

if ($action === 'start') {
    if ($roomRow['host_id'] !== $playerId) {
        json_reply(['error' => 'Only the host can start the game.'], 403);
    }
    $now = time();
    $db->prepare('UPDATE rooms SET status = ?, started_at = ? WHERE id = ?')
        ->execute(['started', $now, $roomId]);
    $roomRow = load_room($db, $code);
}

if ($action === 'answer') {
    $round = (int) ($data['round'] ?? -1);
    $answer = (int) ($data['answer'] ?? -1);

    if ($round < 0 || $round >= 15 || $round !== (int) $player['round']) {
        json_reply(['error' => 'That question is already finished.'], 409);
    }

    $keys = answer_keys($db, (int) $roomRow['category_id']);
    $correct = isset($keys[$round]) && $answer === $keys[$round];

    $score = (int) $player['score'];
    $streak = (int) $player['streak'];
    $bestStreak = (int) $player['best_streak'];
    $correctCount = (int) $player['correct'];

    if ($correct) {
        $streak++;
        $bestStreak = max($bestStreak, $streak);
        $correctCount++;
        $score += 100 + (($streak - 1) * 25);
    } else {
        $streak = 0;
    }

    $db->beginTransaction();
    $db->prepare(
        'UPDATE room_players SET score = ?, correct = ?, streak = ?, best_streak = ?,
         answered_round = ?, round = ? WHERE id = ?'
    )->execute([$score, $correctCount, $streak, $bestStreak, $round, $round + 1, $playerId]);

    $db->prepare(
        'INSERT INTO room_answers (room_player_id, round_number, answer_index, is_correct)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE answer_index = VALUES(answer_index), is_correct = VALUES(is_correct)'
    )->execute([$playerId, $round, $answer, $correct ? 1 : 0]);
    $db->commit();

    $response['correct'] = $correct;
}

$roomRow = load_room($db, $code);
$state = room_state($db, $roomRow);

if ($state['finished']) {
    foreach ($state['room']['players'] as $p) {
        if ($p['userId'] && $p['round'] >= 15) {
            $done = $db->prepare(
                'SELECT id FROM game_sessions WHERE user_id = ? AND played_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE) LIMIT 1'
            );
            $done->execute([$p['userId']]);
            if (!$done->fetch()) {
                sync_user_stats($db, $p['userId'], $p['score'], $p['correct'], 15);
                $catId = category_id($db, $state['room']['category']);
                $db->prepare(
                    'INSERT INTO game_sessions (user_id, category_id, score, correct, total) VALUES (?, ?, ?, ?, 15)'
                )->execute([$p['userId'], $catId, $p['score'], $p['correct']]);
            }
        }
    }
}

$response['state'] = $state;
json_reply($response);
