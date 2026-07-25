<?php
require_once __DIR__ . '/helpers.php';

$data = read_json();
$action = $data['action'] ?? '';

try {
    $db = gizmo_db();
} catch (Throwable $e) {
    json_reply(['error' => gizmo_db_error_for_user($e)], 500);
}

if ($action === 'aiStatus') {
    json_reply([
        'configured' => gizmo_ai_key() !== '',
        'localFallback' => true,
        'setupUrl' => 'setup_ai.php',
    ]);
}

if ($action === 'generateCards') {
    require_once __DIR__ . '/study_local.php';

    $material = trim((string) ($data['material'] ?? ''));
    $count = max(2, min(20, (int) ($data['count'] ?? 10)));
    $apiKey = gizmo_ai_key();

    if (mb_strlen($material) < 30) {
        json_reply(['error' => 'Please provide more study material.'], 400);
    }

    if (!$apiKey) {
        $cards = gizmo_local_flashcards($material, $count);
        if (count($cards) < 2) {
            json_reply([
                'error' => 'Could not draft enough cards from your notes. Add clearer lines like "Term: definition", or connect Free AI at setup_ai.php.',
            ], 422);
        }
        json_reply([
            'cards' => $cards,
            'mode' => 'local',
            'message' => 'Draft cards created locally. Add a Free Google Gemini key at setup_ai.php for smarter AI cards.',
        ]);
    }

    if (!function_exists('curl_init')) {
        json_reply(['error' => 'The PHP cURL extension is required for AI generation.'], 500);
    }

    $rawText = '';
    $providerName = 'AI';

    // 1. Google Gemini API (100% Free)
    if (strpos($apiKey, 'AIza') === 0 || (!str_starts_with($apiKey, 'sk-') && !str_starts_with($apiKey, 'gsk_'))) {
        require_once __DIR__ . '/study_gemini.php';
        $providerName = 'Gemini (Free)';
        $promptText = "Create up to {$count} concise, accurate study flashcards from the supplied material. Questions should test one key idea and answers should be short. Return ONLY a valid JSON object with key \"cards\" containing an array of {\"q\": \"question\", \"a\": \"answer\"}.\n\nMaterial:\n" . mb_substr($material, 0, 30000);

        $gemini = gizmo_gemini_generate($apiKey, $promptText);
        if (!empty($gemini['error'])) {
            json_reply(['error' => 'Gemini AI Error: ' . $gemini['error']], 502);
        }

        $rawText = $gemini['text'];
    }
    // 2. Groq API (100% Free - Key starts with gsk_...)
    elseif (str_starts_with($apiKey, 'gsk_')) {
        $providerName = 'Groq (Free)';
        $payload = [
            'model' => 'llama-3.3-70b-versatile',
            'messages' => [
                ['role' => 'system', 'content' => 'Create concise, accurate study flashcards only from the supplied material. Return ONLY a JSON object in this format: {"cards": [{"q": "question", "a": "answer"}]}.'],
                ['role' => 'user', 'content' => "Create up to {$count} flashcards from this material:\n\n" . mb_substr($material, 0, 30000)],
            ],
            'response_format' => ['type' => 'json_object'],
        ];

        $curl = curl_init('https://api.groq.com/openai/v1/chat/completions');
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
        ]);
        $raw = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($curl);
        curl_close($curl);

        $resp = json_decode((string) $raw, true);
        if ($raw === false || $status < 200 || $status >= 300) {
            $msg = $resp['error']['message'] ?? ($curlErr ?: 'Groq AI API request failed.');
            // DNS or connectivity can be unavailable on local XAMPP installations.
            // Keep the study flow usable by drafting cards from the supplied notes.
            if (stripos($msg, 'resolve host') !== false || stripos($msg, 'could not connect') !== false || stripos($msg, 'timed out') !== false) {
                $cards = gizmo_local_flashcards($material, $count);
                if (count($cards) >= 2) {
                    json_reply([
                        'cards' => $cards,
                        'mode' => 'local-fallback',
                        'message' => 'Groq is unreachable on this network, so Gizmo drafted cards locally from your notes.',
                    ]);
                }
            }
            json_reply(['error' => 'Groq AI Error: ' . $msg], 502);
        }

        $rawText = $resp['choices'][0]['message']['content'] ?? '';
    }
    // 3. OpenAI API (Key starts with sk-...)
    else {
        $providerName = 'OpenAI';
        $payload = [
            'model' => getenv('OPENAI_MODEL') ?: 'gpt-4o-mini',
            'messages' => [
                ['role' => 'system', 'content' => 'Create concise, accurate study flashcards only from the supplied material. Return ONLY a JSON object in format: {"cards": [{"q": "question", "a": "answer"}]}.'],
                ['role' => 'user', 'content' => "Create up to {$count} flashcards from this material:\n\n" . mb_substr($material, 0, 30000)],
            ],
            'response_format' => ['type' => 'json_object'],
        ];

        $curl = curl_init('https://api.openai.com/v1/chat/completions');
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
        ]);
        $raw = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($curl);
        curl_close($curl);

        $resp = json_decode((string) $raw, true);
        if ($raw === false || $status < 200 || $status >= 300) {
            $msg = $resp['error']['message'] ?? ($curlErr ?: 'OpenAI API request failed.');
            json_reply(['error' => 'OpenAI Error: ' . $msg], 502);
        }

        $rawText = $resp['choices'][0]['message']['content'] ?? '';
    }

    $generated = json_decode($rawText, true);
    $cards = array_values(array_filter($generated['cards'] ?? [], static function ($card) {
        return is_array($card) && trim((string) ($card['q'] ?? '')) !== '' && trim((string) ($card['a'] ?? '')) !== '';
    }));

    if (count($cards) < 2) {
        json_reply(['error' => 'AI returned an unusable card set. Please try again.'], 502);
    }

    json_reply([
        'cards' => array_map(static fn($card) => ['q' => trim($card['q']), 'a' => trim($card['a'])], $cards),
        'mode' => strtolower($providerName),
        'message' => "Generated using {$providerName}.",
    ]);
}

if ($action === 'saveSet') {
    $userId = $data['userId'] ?? '';
    $title = substr(trim($data['title'] ?? 'My study set'), 0, 120);
    $cards = $data['cards'] ?? [];

    if (!$userId || count($cards) < 2) {
        json_reply(['error' => 'User and at least 2 cards are required.'], 400);
    }

    $db->beginTransaction();
    $db->prepare('INSERT INTO study_sets (user_id, title) VALUES (?, ?)')->execute([$userId, $title]);
    $setId = (int) $db->lastInsertId();

    $insert = $db->prepare(
        'INSERT INTO study_cards (study_set_id, question, answer, sort_order) VALUES (?, ?, ?, ?)'
    );
    foreach ($cards as $i => $card) {
        $q = trim($card['q'] ?? '');
        $a = trim($card['a'] ?? '');
        if ($q && $a) {
            $insert->execute([$setId, $q, $a, $i + 1]);
        }
    }
    $db->commit();

    json_reply(['setId' => $setId, 'title' => $title]);
}

if ($action === 'saveResult') {
    $userId = $data['userId'] ?? '';
    $setId = (int) ($data['setId'] ?? 0);
    $score = (int) ($data['score'] ?? 0);
    $total = (int) ($data['total'] ?? 0);
    $known = (int) ($data['cardsKnown'] ?? 0);

    if (!$userId || !$total) {
        json_reply(['error' => 'Invalid quiz result.'], 400);
    }

    if ($setId) {
        $db->prepare(
            'INSERT INTO study_quiz_results (user_id, study_set_id, score, total_questions, cards_known)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$userId, $setId, $score, $total, $known]);
    }

    update_streak($db, $userId);
    $db->prepare(
        'UPDATE users SET
            total_score = total_score + ?,
            total_games = total_games + 1,
            correct = correct + ?,
            answers = answers + ?
         WHERE id = ?'
    )->execute([$score * 100, $score, $total, $userId]);

    json_reply(['user' => fetch_user($db, $userId)]);
}

if ($action === 'list') {
    $userId = $data['userId'] ?? '';
    if (!$userId) {
        json_reply(['error' => 'User id is required.'], 400);
    }

    $stmt = $db->prepare(
        'SELECT s.id, s.title, s.created_at,
                (SELECT COUNT(*) FROM study_cards c WHERE c.study_set_id = s.id) AS card_count
         FROM study_sets s WHERE s.user_id = ? ORDER BY s.updated_at DESC'
    );
    $stmt->execute([$userId]);
    json_reply(['sets' => $stmt->fetchAll()]);
}

json_reply(['error' => 'Invalid study request.'], 400);
