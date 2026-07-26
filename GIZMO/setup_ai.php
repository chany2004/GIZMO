<?php
require_once __DIR__ . '/config.php';

function gizmo_is_local_request(): bool
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    return in_array($ip, ['127.0.0.1', '::1'], true);
}

function gizmo_save_ai_key(string $key): bool
{
    $key = trim($key);
    if (gizmo_is_placeholder_key($key) || strlen($key) < 10) {
        return false;
    }

    $envFile = __DIR__ . '/.env';
    $envLines = [];
    if (is_readable($envFile)) {
        foreach (file($envFile, FILE_IGNORE_NEW_LINES) as $line) {
            if (preg_match('/^\s*(OPENAI_API_KEY|AI_API_KEY|GEMINI_API_KEY)\s*=/', $line)) {
                continue;
            }
            $envLines[] = rtrim($line, "\r\n");
        }
    }
    $envLines[] = 'AI_API_KEY=' . $key;
    $envLines[] = 'OPENAI_API_KEY=' . $key;
    $envContent = implode(PHP_EOL, array_filter($envLines, static fn($line) => $line !== '')) . PHP_EOL;

    if (file_put_contents($envFile, $envContent, LOCK_EX) === false) {
        return false;
    }

    putenv('AI_API_KEY=' . $key);
    putenv('OPENAI_API_KEY=' . $key);
    $_ENV['AI_API_KEY'] = $key;
    $_ENV['OPENAI_API_KEY'] = $key;

    $dataDir = __DIR__ . '/data';
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }
    file_put_contents($dataDir . '/ai.key', $key, LOCK_EX);
    file_put_contents($dataDir . '/openai.key', $key, LOCK_EX);

    return true;
}

$message = '';
$error = '';
$saved = false;
$savedKey = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!gizmo_is_local_request()) {
        http_response_code(403);
        $error = 'Setup is only allowed from this computer (localhost).';
    } else {
        $key = trim((string) ($_POST['api_key'] ?? ''));
        if (gizmo_save_ai_key($key)) {
            $saved = true;
            $savedKey = $key;
            $message = 'API key saved! AI flashcard generation is ready — go back to Study and try generating cards.';
        } else {
            $error = 'Invalid key. Please paste a valid API key (Google Gemini, Groq, or OpenAI).';
        }
    }
}

$activeKey = $savedKey !== '' ? $savedKey : gizmo_load_ai_key_from_sources();
$configured = !gizmo_is_placeholder_key($activeKey);
$providerType = 'Unknown';
if (str_starts_with($activeKey, 'AIza')) {
    $providerType = 'Google Gemini (Free)';
} elseif (str_starts_with($activeKey, 'gsk_')) {
    $providerType = 'Groq (Free)';
} elseif (str_starts_with($activeKey, 'sk-')) {
    $providerType = 'OpenAI';
} elseif ($configured) {
    $providerType = 'Custom/Gemini';
}
$masked = $configured ? ($providerType . ': ...' . substr($activeKey, -4)) : '';
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AI setup — QUESTER</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<style>
.setup-wrap{max-width:600px;margin:48px auto;padding:0 20px 48px}
.setup-card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:24px;padding:28px;box-shadow:0 18px 40px rgba(15,23,42,.08)}
.setup-card h1{font-family:"Baloo 2",sans-serif;font-size:2rem;margin:8px 0 12px}
.setup-card p{color:#475569;line-height:1.6}
.status{display:inline-block;padding:6px 12px;border-radius:999px;font-size:.85rem;font-weight:600;margin-bottom:12px}
.status.ok{background:#dcfce7;color:#166534}
.status.bad{background:#fee2e2;color:#991b1b}
.setup-card label{display:block;margin-top:18px;font-weight:600}
.setup-card input{width:100%;margin-top:8px;padding:14px 16px;border:1px solid #cbd5e1;border-radius:14px;font:inherit}
.setup-card .button{margin-top:20px;width:100%}
.notice{margin-top:14px;padding:12px 14px;border-radius:14px;font-size:.95rem}
.notice.ok{background:#ecfdf5;color:#065f46}
.notice.err{background:#fef2f2;color:#991b1b}
.free-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:16px;padding:16px;margin-top:16px;font-size:.92rem;color:#166534}
.free-box strong{color:#14532d;display:block;margin-bottom:4px}
.free-box a{color:#15803d;font-weight:700;text-decoration:underline}
.links{margin-top:20px;display:flex;gap:12px;flex-wrap:wrap}
.links a{color:#2563eb;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="index.html"><span class="brand-mark">Q</span>QUESTER</a>
  <a class="back-link" href="study.html">&larr; Study</a>
</header>
<main class="setup-wrap">
  <section class="setup-card">
    <p class="eyebrow"><span></span> AI SETUP</p>
    <h1>Connect Free AI (Google Gemini / Groq / OpenAI)</h1>
    <p>QUESTER supports <strong>100% Free AI Keys</strong> from Google Gemini! No credit card or payment required.</p>

    <?php if ($configured): ?>
      <span class="status ok">Configured: <?= htmlspecialchars($masked, ENT_QUOTES, 'UTF-8') ?></span>
    <?php else: ?>
      <span class="status bad">Not configured yet</span>
    <?php endif; ?>

    <?php if ($message): ?><p class="notice ok"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>
    <?php if ($error): ?><p class="notice err"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>

    <div class="free-box">
      <strong>✨ Unsaon pagkuha og FREE AI Key (Way Bayad)?</strong>
      1. Adto sa <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio (aistudio.google.com)</a>.<br>
      2. Log in gamit ang imong Google / Gmail account.<br>
      3. I-click ang <strong>"Create API key"</strong>.<br>
      4. I-copy ang key (nagsugod sa <code>AIzaSy...</code>) ug i-paste kini sa ubos!
    </div>

    <form method="post" autocomplete="off">
      <label for="api_key">AI API key (Google Gemini, Groq, or OpenAI)</label>
      <input id="api_key" name="api_key" type="password" placeholder="AIzaSy... o gsk_... o sk-..." required>
      <button class="button" type="submit"><?= $configured ? 'Update Key' : 'Save Key' ?> <span>&rarr;</span></button>
    </form>

    <div class="links">
      <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">🎁 Get Free Google Gemini Key</a>
      <a href="https://console.groq.com/keys" target="_blank" rel="noopener">⚡ Get Free Groq Key</a>
      <a href="test_openai.php">Test configuration</a>
      <a href="study.html">Back to Study</a>
    </div>
  </section>
</main>
</body>
</html>
