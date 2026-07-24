<?php
require_once __DIR__ . '/config.php';

header('Content-Type: text/plain; charset=utf-8');

$key = gizmo_ai_key();
if ($key !== '') {
    http_response_code(200);
    $provider = 'Google Gemini (Free)';
    if (str_starts_with($key, 'gsk_')) {
        $provider = 'Groq (Free)';
    } elseif (str_starts_with($key, 'sk-')) {
        $provider = 'OpenAI';
    }
    echo "AI API Key is set!\n";
    echo "Provider detected: {$provider}\n";
    echo "Last 4 chars: ..." . substr($key, -4) . "\n";
    echo "Study AI card generation is ready to use.\n";
    exit(0);
}

http_response_code(200);
echo "AI API Key is NOT configured yet (optional).\n";
echo "Study feature works using local draft flashcards.\n";
echo "For 100% Free AI cards (Google Gemini), configure your key at:\n";
echo "http://localhost/GIZMO/setup_ai.php\n";
exit(0);
