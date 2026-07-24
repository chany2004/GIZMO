<?php

function gizmo_local_flashcards(string $material, int $count): array
{
    $cards = [];
    $seen = [];

    $add = static function (string $q, string $a) use (&$cards, &$seen, $count): void {
        if (count($cards) >= $count) {
            return;
        }
        $q = trim(preg_replace('/\s+/u', ' ', $q));
        $a = trim(preg_replace('/\s+/u', ' ', $a));
        if (mb_strlen($q) < 5 || mb_strlen($a) < 5) {
            return;
        }
        $key = mb_strtolower($q . '|' . $a);
        if (isset($seen[$key])) {
            return;
        }
        $seen[$key] = true;
        $cards[] = ['q' => $q, 'a' => $a];
    };

    $lines = preg_split('/\r\n|\r|\n/', $material) ?: [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '') {
            continue;
        }
        $line = preg_replace('/^[\-*•\d]+[\.\)]\s*/u', '', $line) ?? $line;

        if (preg_match('/^(.{2,120}?)\s*[:–—\-]\s*(.{5,})$/u', $line, $m)) {
            $term = trim($m[1], " \t\"'*_");
            $answer = trim($m[2], " \t\"'*_");
            if (!preg_match('/^(what|how|why|when|where|define|explain)$/iu', $term)) {
                $add("What is {$term}?", $answer);
                continue;
            }
        }

        if (preg_match('/^(.{2,80}?)\s+is\s+(.{5,})$/iu', $line, $m)) {
            $add('What is ' . trim($m[1]) . '?', trim($m[2]));
            continue;
        }

        if (preg_match('/^Q(?:uestion)?[:.]?\s*(.+?)\s*A(?:nswer)?[:.]?\s*(.+)$/iu', $line, $m)) {
            $add(trim($m[1]), trim($m[2]));
            continue;
        }

        if (preg_match('/^(.{2,80}?)\s*[\(（]\s*(.{5,}?)\s*[\)）]\s*$/u', $line, $m)) {
            $add('What is ' . trim($m[1]) . '?', trim($m[2]));
        }
    }

    if (count($cards) < $count) {
        $blocks = preg_split('/\n\s*\n/u', $material) ?: [];
        foreach ($blocks as $block) {
            $block = trim($block);
            if (mb_strlen($block) < 40) {
                continue;
            }
            $sentences = preg_split('/(?<=[.!?])\s+/u', $block) ?: [];
            $sentences = array_values(array_filter(array_map('trim', $sentences)));
            if (count($sentences) < 2) {
                continue;
            }
            $topic = rtrim($sentences[0], '.!?');
            if (mb_strlen($topic) > 100) {
                $topic = mb_substr($topic, 0, 97) . '...';
            }
            $add('Explain: ' . $topic, implode(' ', array_slice($sentences, 1)));
        }
    }

    if (count($cards) < $count) {
        $chunks = preg_split('/(?<=[.!?])\s+/u', preg_replace('/\s+/u', ' ', $material)) ?: [];
        $chunks = array_values(array_filter(array_map('trim', $chunks)));
        for ($i = 0; $i < count($chunks) - 1 && count($cards) < $count; $i++) {
            $qChunk = $chunks[$i];
            $aChunk = $chunks[$i + 1];
            if (mb_strlen($qChunk) < 15 || mb_strlen($aChunk) < 15) {
                continue;
            }
            $add(
                'What does this mean: ' . rtrim(mb_substr($qChunk, 0, 120), '.!?') . '?',
                mb_substr($aChunk, 0, 400)
            );
        }
    }

    return array_slice($cards, 0, $count);
}
