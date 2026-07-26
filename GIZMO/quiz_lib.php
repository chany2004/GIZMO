<?php
require_once __DIR__ . '/helpers.php';

function ensure_quiz_catalog(PDO $db): void
{
    $catalogPath = __DIR__ . '/data/quiz_catalog.php';
    if (!file_exists($catalogPath)) {
        return;
    }
    $catalog = require $catalogPath;

    // One remote TiDB query is far faster than checking every category one at
    // a time whenever a serverless quiz request starts.
    $existing = [];
    foreach ($db->query('SELECT slug FROM quiz_categories') as $row) {
        $existing[$row['slug']] = true;
    }

    foreach ($catalog as $slug => $cat) {
        if (isset($existing[$slug])) {
            continue;
        }

        $db->prepare('INSERT INTO quiz_categories (slug, title, icon) VALUES (?, ?, ?)')
            ->execute([$slug, $cat['title'], $cat['icon']]);
        $catId = (int) $db->lastInsertId();

        $insertQ = $db->prepare(
            'INSERT INTO quiz_questions (category_id, question, sort_order) VALUES (?, ?, ?)'
        );
        $insertO = $db->prepare(
            'INSERT INTO quiz_options (question_id, option_text, option_index, is_correct) VALUES (?, ?, ?, ?)'
        );

        foreach ($cat['questions'] as $i => $q) {
            $insertQ->execute([$catId, $q['q'], $i + 1]);
            $qId = (int) $db->lastInsertId();
            foreach ($q['options'] as $j => $opt) {
                $insertO->execute([$qId, $opt, $j, $j === (int) $q['correct'] ? 1 : 0]);
            }
        }
        $existing[$slug] = true;
    }
}

function fetch_categories(PDO $db): array
{
    // custom_study is an internal foreign-key target for AI-generated rooms,
    // not a standalone catalog category with reusable trivia questions.
    $rows = $db->query(
        "SELECT slug, title, icon FROM quiz_categories
         WHERE slug <> 'custom_study' ORDER BY id"
    )->fetchAll();
    $list = [];
    foreach ($rows as $row) {
        $list[] = [
            'slug'  => $row['slug'],
            'title' => $row['title'],
            'icon'  => $row['icon'],
        ];
    }
    return $list;
}

function fetch_questions(PDO $db, string $slug): array
{
    $stmt = $db->prepare(
        'SELECT qq.id, qq.question, qq.sort_order
         FROM quiz_questions qq
         JOIN quiz_categories c ON c.id = qq.category_id
         WHERE c.slug = ?
         ORDER BY qq.sort_order'
    );
    $stmt->execute([$slug]);
    $questions = [];

    $optStmt = $db->prepare(
        'SELECT option_text, option_index FROM quiz_options
         WHERE question_id = ? ORDER BY option_index'
    );

    foreach ($stmt->fetchAll() as $row) {
        $optStmt->execute([(int) $row['id']]);
        $options = [];
        foreach ($optStmt->fetchAll() as $opt) {
            $options[] = $opt['option_text'];
        }
        $questions[] = [
            'text'    => $row['question'],
            'options' => $options,
        ];
    }
    return $questions;
}
