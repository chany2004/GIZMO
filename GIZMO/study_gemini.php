<?php

function gizmo_gemini_models(): array
{
    $fromEnv = trim((string) (getenv('GEMINI_MODEL') ?: ($_ENV['GEMINI_MODEL'] ?? '')));
    if ($fromEnv !== '') {
        return [$fromEnv];
    }

    return [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-flash-latest',
        'gemini-2.0-flash',
    ];
}

function gizmo_gemini_model_missing(string $message, int $status): bool
{
    if ($status === 404) {
        return true;
    }
    return (bool) preg_match('/not found|not supported for generateContent/i', $message);
}

function gizmo_gemini_generate(string $apiKeyString, string $prompt): array
{
    $keys = array_filter(array_map('trim', explode(',', $apiKeyString)));
    if (empty($keys)) {
        $keys = [trim($apiKeyString)];
    }

    $payload = [
        'contents' => [
            ['parts' => [['text' => $prompt]]],
        ],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
        ],
    ];

    $lastErr = '';

    foreach ($keys as $apiKey) {
        foreach (gizmo_gemini_models() as $model) {
            $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
                . rawurlencode($model)
                . ':generateContent?key=' . urlencode($apiKey);

            $curl = curl_init($url);
            curl_setopt_array($curl, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode($payload),
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT => 25,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
                CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
                CURLOPT_ENCODING => '',
            ]);

            $raw = curl_exec($curl);
            $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($curl);
            curl_close($curl);

            $resp = json_decode((string) $raw, true);

            if ($raw !== false && $status >= 200 && $status < 300) {
                $text = $resp['candidates'][0]['content']['parts'][0]['text'] ?? '';
                if ($text !== '') {
                    return ['text' => $text, 'model' => $model];
                }
                $lastErr = 'Gemini returned an empty response.';
                continue;
            }

            $errMsg = $resp['error']['message'] ?? ($curlErr ?: "HTTP {$status}");
            if ($status === 429) {
                $lastErr = 'Rate limit / quota exceeded for this key (HTTP 429). Wait a minute or create a new free key at aistudio.google.com/app/apikey.';
                continue;
            }

            if (gizmo_gemini_model_missing($errMsg, $status)) {
                $lastErr = $errMsg;
                continue;
            }

            $lastErr = $errMsg;
        }
    }

    return ['error' => $lastErr ?: 'Could not reach Gemini API.'];
}
