<?php
require_once __DIR__ . '/helpers.php';

$data = read_json();
$message = trim((string) ($data['message'] ?? ''));
$history = $data['history'] ?? [];

if ($message === '') {
    json_reply(['error' => 'Please enter a question or prompt.'], 400);
}

$apiKey = gizmo_ai_key();

if (!$apiKey) {
    json_reply([
        'reply' => "I am Quester AI! 🤖 To activate my ChatGPT brain, please add a Free AI API key (Google Gemini or Groq) at setup_ai.php.",
        'mode'  => 'offline',
    ]);
}

if (!function_exists('curl_init')) {
    json_reply(['error' => 'PHP cURL extension is required for AI chat.'], 500);
}

$systemPrompt = "You are Quester AI, a super smart, friendly, and engaging AI study assistant and tutor for QUESTER. You help students understand complex topics, explain concepts simply, answer trivia questions, give study advice, and solve problems. Use clear formatting, bullet points, and emoji where helpful.";

// 1. Groq API (100% Free - Key starts with gsk_)
if (str_starts_with($apiKey, 'gsk_')) {
    $messages = [
        ['role' => 'system', 'content' => $systemPrompt],
    ];

    if (is_array($history)) {
        foreach (array_slice($history, -8) as $msg) {
            if (isset($msg['role'], $msg['content']) && in_array($msg['role'], ['user', 'assistant'], true)) {
                $messages[] = [
                    'role' => $msg['role'],
                    'content' => (string) $msg['content']
                ];
            }
        }
    }
    $messages[] = ['role' => 'user', 'content' => $message];

    $payload = [
        'model' => 'llama-3.3-70b-versatile',
        'messages' => $messages,
        'temperature' => 0.7,
        'max_tokens' => 1500,
    ];

    $curl = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ],
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
        $msg = $resp['error']['message'] ?? ($curlErr ?: 'Groq AI request failed.');
        json_reply(['error' => 'Groq AI Error: ' . $msg], 502);
    }

    $replyText = $resp['choices'][0]['message']['content'] ?? '';
    json_reply(['reply' => $replyText, 'provider' => 'Groq (Free)']);
}

// 2. Google Gemini API (100% Free - Key starts with AIza or non sk-)
if (strpos($apiKey, 'AIza') === 0 || (!str_starts_with($apiKey, 'sk-') && !str_starts_with($apiKey, 'gsk_'))) {
    require_once __DIR__ . '/study_gemini.php';
    $fullPrompt = $systemPrompt . "\n\nUser Question: " . $message;
    $gemini = gizmo_gemini_generate($apiKey, $fullPrompt);

    if (!empty($gemini['error'])) {
        json_reply(['error' => 'Gemini AI Error: ' . $gemini['error']], 502);
    }

    json_reply(['reply' => $gemini['text'], 'provider' => 'Gemini (Free)']);
}

// 3. OpenAI API (Key starts with sk-)
$messages = [
    ['role' => 'system', 'content' => $systemPrompt],
    ['role' => 'user', 'content' => $message],
];

$curl = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt_array($curl, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode([
        'model' => 'gpt-3.5-turbo',
        'messages' => $messages,
    ]),
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiKey,
    ],
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

$replyText = $resp['choices'][0]['message']['content'] ?? '';
json_reply(['reply' => $replyText, 'provider' => 'OpenAI']);
