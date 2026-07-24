<?php
// CLI helper to safely write OPENAI_API_KEY into .env (workspace root).
// Usage (from project root):
// php set_openai_key.php "sk-REALLY_LONG_KEY_HERE"

if (php_sapi_name() !== 'cli') {
    fwrite(STDERR, "This script must be run from the command line.\n");
    exit(1);
}

if ($argc < 2) {
    fwrite(STDERR, "Usage: php set_openai_key.php \"your_key\"\n");
    exit(2);
}

$key = trim($argv[1]);
if ($key === '' || preg_match('/REPLACE|REPLACE_WITH|YOUR[_\-\s]?KEY|REPLACE-?WITH/i', $key)) {
    fwrite(STDERR, "Provided value looks like a placeholder. Provide your real OpenAI API key.\n");
    exit(3);
}

$envFile = __DIR__ . '/.env';
$content = "OPENAI_API_KEY={$key}\n";

if (file_put_contents($envFile, $content, LOCK_EX) === false) {
    fwrite(STDERR, "Failed to write {$envFile}\n");
    exit(4);
}

fwrite(STDOUT, "Wrote {$envFile}. Reload the Study page and try Generate cards again.\n");
exit(0);
