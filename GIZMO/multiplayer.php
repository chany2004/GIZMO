<?php
require_once __DIR__ . '/helpers.php';

$data = read_json();
$action = $data['action'] ?? '';

try {
    $db = gizmo_db();
} catch (Throwable $e) {
    json_reply(['error' => gizmo_db_error_for_user($e)], 500);
}

function multiplayer_ensure_schema(PDO $db): void
{
    try {
        // Avoid running DDL during every serverless request. A zero-row query
        // is enough to verify that the custom-room storage already exists.
        $db->query('SELECT room_id, title, questions_json FROM room_custom_quizzes LIMIT 0');
        return;
    } catch (PDOException $e) {
        if (!preg_match('/42S02|1146|doesn.t exist|unknown table/i', $e->getMessage())) {
            throw $e;
        }
    }

    // Older deployments may predate custom study rooms. Keep the runtime
    // migration deliberately portable: the application performs cleanup, so
    // it does not require REFERENCES privileges or foreign-key support here.
    $db->exec(
        'CREATE TABLE IF NOT EXISTS room_custom_quizzes (
            room_id INT UNSIGNED NOT NULL,
            title VARCHAR(120) NOT NULL,
            questions_json LONGTEXT NOT NULL,
            PRIMARY KEY (room_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function multiplayer_existing_user_id(PDO $db, $candidate): ?string
{
    $userId = strtolower(trim((string) $candidate));
    if (!preg_match('/^[a-f0-9]{40}$/', $userId)) {
        return null;
    }
    $stmt = $db->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    return $stmt->fetchColumn() ? $userId : null;
}

function multiplayer_clip(string $value, int $length): string
{
    return function_exists('mb_substr')
        ? mb_substr($value, 0, $length, 'UTF-8')
        : substr($value, 0, $length);
}

multiplayer_ensure_schema($db);

// Expired-room cleanup is maintenance and must never stop a player from
// creating a new room. Delete custom payloads explicitly for databases where
// foreign-key cascades are disabled.
try {
    $cutoff = time() - 86400;
    $cleanup = $db->prepare(
        'DELETE FROM room_custom_quizzes
         WHERE room_id IN (SELECT id FROM rooms WHERE created_at < ?)'
    );
    $cleanup->execute([$cutoff]);
    $cleanup = $db->prepare('DELETE FROM rooms WHERE created_at < ?');
    $cleanup->execute([$cutoff]);
} catch (Throwable $e) {
    error_log('[GIZMO multiplayer cleanup] ' . $e->getMessage());
}

function load_room(PDO $db, string $code): ?array
{
    $stmt = $db->prepare(
        'SELECT r.*, c.slug AS category_slug, cq.title AS custom_title,
                cq.questions_json AS custom_questions
         FROM rooms r
         JOIN quiz_categories c ON c.id = r.category_id
         LEFT JOIN room_custom_quizzes cq ON cq.room_id = r.id
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

    $customQuestions = json_decode($roomRow['custom_questions'] ?? '', true);
    $questionCount = is_array($customQuestions) && $customQuestions ? count($customQuestions) : 15;

    if ($status === 'started' && $startedAt) {
        $round = min($questionCount - 1, max(0, intdiv($now - $startedAt, 20)));
        if ($now - $startedAt >= $questionCount * 20) {
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
            'customQuiz' => !empty($customQuestions),
            'title'      => $roomRow['custom_title'] ?: null,
            'questionCount' => $questionCount,
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

if ($action === 'checkRoom') {
    $code = preg_replace('/\D/', '', (string) ($data['roomCode'] ?? ''));
    if (!preg_match('/^\d{6}$/', $code)) {
        json_reply(['error' => 'Enter a valid 6-digit Room ID.'], 400);
    }
    $roomRow = load_room($db, $code);
    if (!$roomRow) {
        json_reply(['error' => 'Room not found. Check the ID and try again.'], 404);
    }
    if (($roomRow['status'] ?? '') !== 'lobby') {
        json_reply(['error' => ($roomRow['status'] ?? '') === 'finished'
            ? 'This game has already finished.'
            : 'This game has already started.'], 409);
    }
    $count = $db->prepare('SELECT COUNT(*) FROM room_players WHERE room_id = ?');
    $count->execute([(int) $roomRow['id']]);
    $playerCount = (int) $count->fetchColumn();
    if ($playerCount >= 10) {
        json_reply(['error' => 'This room is already full.'], 409);
    }
    json_reply(['available' => true, 'roomCode' => $code, 'playerCount' => $playerCount]);
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
    $userId = multiplayer_existing_user_id($db, $data['userId'] ?? null);

    do {
        // Six digits are fast to type on a phone and avoid letter/number
        // confusion when a host shares a Room ID aloud.
        $code = (string) random_int(100000, 999999);
        $check = $db->prepare('SELECT id FROM rooms WHERE room_code = ?');
        $check->execute([$code]);
    } while ($check->fetch());

    $playerId = bin2hex(random_bytes(12));
    $now = time();

    try {
        $db->beginTransaction();
        $db->prepare(
            'INSERT INTO rooms (room_code, category_id, host_id, status, created_at, started_at)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$code, $catId, $playerId, 'lobby', $now, null]);

        $roomId = (int) $db->lastInsertId();
        $customQuestions = $data['customQuestions'] ?? [];
        if (is_array($customQuestions) && $customQuestions) {
            $cleanQuestions = [];
            foreach (array_slice($customQuestions, 0, 60) as $question) {
                $text = trim((string) ($question['text'] ?? ''));
                $options = array_values(array_filter(array_map(
                    static fn($value) => trim((string) $value),
                    is_array($question['options'] ?? null) ? $question['options'] : []
                ), static fn($value) => $value !== ''));
                $correct = (int) ($question['correct'] ?? -1);
                if ($text !== '' && count($options) >= 2 && count($options) <= 4 && isset($options[$correct])) {
                    $cleanQuestions[] = [
                        'text' => multiplayer_clip($text, 500),
                        'options' => array_map(
                            static fn($value) => multiplayer_clip($value, 1000),
                            $options
                        ),
                        'correct' => $correct,
                    ];
                }
            }
            if (count($cleanQuestions) < 2) {
                $db->rollBack();
                json_reply(['error' => 'Add at least two complete study cards.'], 400);
            }
            $title = multiplayer_clip(trim((string) ($data['studyTitle'] ?? 'Study Challenge')), 120);
            $db->prepare(
                'INSERT INTO room_custom_quizzes (room_id, title, questions_json) VALUES (?, ?, ?)'
            )->execute([
                $roomId,
                $title ?: 'Study Challenge',
                json_encode($cleanQuestions, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ]);
        }
        $db->prepare(
            'INSERT INTO room_players (id, room_id, user_id, name) VALUES (?, ?, ?, ?)'
        )->execute([$playerId, $roomId, $userId, $name]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

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
    $userId = multiplayer_existing_user_id($db, $data['userId'] ?? null);

    $db->prepare(
        'INSERT INTO room_players (id, room_id, user_id, name) VALUES (?, ?, ?, ?)'
    )->execute([$playerId, (int) $roomRow['id'], $userId, $name]);

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

if ($action === 'questions') {
    $customQuestions = json_decode($roomRow['custom_questions'] ?? '', true);
    if (!is_array($customQuestions) || !$customQuestions) {
        json_reply(['error' => 'This room does not have custom study questions.'], 404);
    }
    $publicQuestions = array_map(static function ($question) {
        return ['text' => $question['text'], 'options' => $question['options']];
    }, $customQuestions);
    json_reply(['title' => $roomRow['custom_title'], 'questions' => $publicQuestions]);
}

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

    $customQuestions = json_decode($roomRow['custom_questions'] ?? '', true);
    $questionTotal = is_array($customQuestions) && $customQuestions ? count($customQuestions) : 15;
    if ($round < 0 || $round >= $questionTotal || $round !== (int) $player['round']) {
        json_reply(['error' => 'That question is already finished.'], 409);
    }

    $keys = is_array($customQuestions) && $customQuestions
        ? array_map(static fn($question) => (int) $question['correct'], $customQuestions)
        : answer_keys($db, (int) $roomRow['category_id']);
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
    // Reveal the correct option only after this player has submitted an answer.
    $response['correctAnswer'] = $keys[$round] ?? null;
}

$roomRow = load_room($db, $code);
$state = room_state($db, $roomRow);

if ($state['finished']) {
    $totalQuestions = (int) ($state['room']['questionCount'] ?? 15);
    foreach ($state['room']['players'] as $p) {
        if ($p['userId'] && $p['round'] >= $totalQuestions) {
            $done = $db->prepare(
                'SELECT id FROM game_sessions WHERE user_id = ? AND played_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE) LIMIT 1'
            );
            $done->execute([$p['userId']]);
            if (!$done->fetch()) {
                sync_user_stats($db, $p['userId'], $p['score'], $p['correct'], $totalQuestions);
                $catId = category_id($db, $state['room']['category']);
                $db->prepare(
                    'INSERT INTO game_sessions (user_id, category_id, score, correct, total) VALUES (?, ?, ?, ?, ?)'
                )->execute([$p['userId'], $catId, $p['score'], $p['correct'], $totalQuestions]);
            }
        }
    }
}

$response['state'] = $state;
json_reply($response);
