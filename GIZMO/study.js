// GIZMO Study — Vercel-compatible
const $ = s => document.querySelector(s);
let cards = [], cardIndex = 0, flipped = false, known = 0, quizIndex = 0, quizScore = 0, answered = false, setId = null;
const user = JSON.parse(localStorage.getItem('gizmoUser') || 'null');

async function studyApi(action, body = {}) {
  if (window.GIZMO?.studyApi) return window.GIZMO.studyApi(action, body);
  const r = await fetch('study.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || 'Request failed');
  return d;
}

function parseCards() {
  return [...document.querySelectorAll('.card-row')].map(row => ({
    q: row.querySelector('.card-question').value.trim(),
    a: row.querySelector('.card-answer').value.trim()
  })).filter(card => card.q && card.a);
}

function updateCount() {
  const total = document.querySelectorAll('.card-row').length;
  const ready = parseCards().length;
  $('#cardCountBadge').textContent = `${ready} of ${total} ready`;

  // Update card row index labels
  document.querySelectorAll('.card-row').forEach((row, idx) => {
    const numTag = row.querySelector('.card-number-tag');
    if (numTag) numTag.textContent = `Card #${idx + 1}`;
  });
}

function addCard(card = { q: '', a: '' }) {
  const count = document.querySelectorAll('.card-row').length + 1;
  const row = document.createElement('div');
  row.className = 'card-row';
  row.innerHTML = `
    <div class="card-row-header">
      <span class="card-number-tag">Card #${count}</span>
      <div class="card-row-actions">
        <button class="row-action-btn duplicate-btn" type="button" title="Duplicate card">📋 Duplicate</button>
        <button class="row-action-btn delete-btn" type="button" title="Delete card">✕ Delete</button>
      </div>
    </div>
    <div class="card-inputs-grid">
      <div class="card-input-col">
        <label>Question</label>
        <textarea class="card-question" rows="2" maxlength="500" placeholder="e.g. What is photosynthesis?"></textarea>
      </div>
      <div class="card-input-col">
        <label>Answer</label>
        <textarea class="card-answer" rows="2" maxlength="1000" placeholder="e.g. The process plants use to make food from light."></textarea>
      </div>
    </div>
  `;

  const qInput = row.querySelector('.card-question');
  const aInput = row.querySelector('.card-answer');
  qInput.value = card.q || '';
  aInput.value = card.a || '';

  row.querySelectorAll('textarea').forEach(input => input.addEventListener('input', updateCount));

  row.querySelector('.duplicate-btn').addEventListener('click', () => {
    const current = { q: qInput.value.trim(), a: aInput.value.trim() };
    const newRow = addCard(current);
    row.after(newRow);
    updateCount();
  });

  row.querySelector('.delete-btn').addEventListener('click', () => {
    if (document.querySelectorAll('.card-row').length <= 1) {
      qInput.value = '';
      aInput.value = '';
    } else {
      row.remove();
    }
    updateCount();
  });

  $('#cardsEditor').append(row);
  updateCount();
  return row;
}

function setCardRows(newCards) {
  $('#cardsEditor').innerHTML = '';
  if (Array.isArray(newCards) && newCards.length > 0) {
    newCards.forEach(addCard);
  } else {
    addCard();
    addCard();
  }
  updateCount();
}

// Add Card Buttons
$('#addCard').addEventListener('click', () => {
  const row = addCard();
  row.querySelector('.card-question').focus();
});

$('#addCardBottom').addEventListener('click', () => {
  const row = addCard();
  row.querySelector('.card-question').focus();
});

// Swap Q&A
$('#swapCardsBtn').addEventListener('click', () => {
  document.querySelectorAll('.card-row').forEach(row => {
    const q = row.querySelector('.card-question');
    const a = row.querySelector('.card-answer');
    const temp = q.value;
    q.value = a.value;
    a.value = temp;
  });
  updateCount();
});

// Clean Empty Rows
$('#clearEmptyBtn').addEventListener('click', () => {
  document.querySelectorAll('.card-row').forEach(row => {
    const q = row.querySelector('.card-question').value.trim();
    const a = row.querySelector('.card-answer').value.trim();
    if (!q && !a && document.querySelectorAll('.card-row').length > 1) {
      row.remove();
    }
  });
  updateCount();
});

// Initial rows
setCardRows([{ q: '', a: '' }, { q: '', a: '' }]);

// Tab Switcher
function showSource(source) {
  const isAi = source === 'ai';
  $('#manualSource').classList.toggle('hidden', isAi);
  $('#aiSource').classList.toggle('hidden', !isAi);
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.source === source);
  });
  $('#error').textContent = '';
}

document.querySelectorAll('.tab-btn').forEach(b => {
  b.addEventListener('click', () => showSource(b.dataset.source));
});

// Check AI Status
async function initAiStatus() {
  try {
    const d = await studyApi('aiStatus');
    if (d.configured) {
      $('#aiStatusText').textContent = 'AI Ready ⚡';
    } else {
      $('#aiStatusText').textContent = 'Local AI';
    }
  } catch {
    $('#aiStatusText').textContent = 'Offline';
  }
}
initAiStatus();

// File Upload Logic
function loadFile(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    $('#error').textContent = 'Please choose a file smaller than 2 MB.';
    return;
  }
  if (!/\.(txt|md|csv)$/i.test(file.name)) {
    $('#error').textContent = 'Use a TXT, Markdown, or CSV notes file.';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    $('#sourceText').value = String(reader.result || '');
    $('#fileName').textContent = file.name;
    $('#error').textContent = '';
  };
  reader.onerror = () => $('#error').textContent = 'Could not read that file.';
  reader.readAsText(file);
}

$('#fileInput').addEventListener('change', e => loadFile(e.target.files[0]));

const dropZone = $('#dropZone');
['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, e => {
  e.preventDefault();
  dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, e => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
}));
dropZone.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));

// Generate Cards
$('#generateCards').addEventListener('click', async () => {
  const material = $('#sourceText').value.trim();
  if (material.length < 30) {
    $('#error').textContent = 'Please add a little more study material first (at least 30 characters).';
    return;
  }
  const button = $('#generateCards');
  button.disabled = true;
  button.innerHTML = '<span>Generating Cards ✦</span>';
  $('#error').textContent = '';

  try {
    const data = await studyApi('generateCards', {
      material,
      count: Number($('#aiCardCount').value)
    });
    const generated = (data.cards || []).filter(c => c && c.q && c.a);
    if (generated.length < 2) {
      throw new Error('Could not make enough usable cards. Try adding more detailed notes.');
    }
    setCardRows(generated);
    showSource('manual');
    const mode = data.mode === 'local' ? 'Local Draft' : 'AI';
    $('#error').textContent = `✨ ${generated.length} ${mode} flashcards generated! Review them below and click Create Study Set.`;
  } catch (err) {
    $('#error').textContent = err.message;
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>Generate Cards ✦</span>';
  }
});

// Create Set
$('#createSet').addEventListener('click', async () => {
  cards = parseCards();
  if (cards.length < 2) {
    $('#error').textContent = 'Please fill out at least two valid Question & Answer cards.';
    return;
  }
  const title = $('#setTitle').value.trim() || 'My Study Set';
  localStorage.setItem('gizmoStudySet', JSON.stringify({ title, cards }));

  if (user?.id) {
    try {
      const d = await studyApi('saveSet', { userId: user.id, title, cards });
      setId = d.setId;
    } catch {}
  }

  $('#setName').textContent = title.toUpperCase();
  $('#builder').classList.add('hidden');
  $('#learn').classList.remove('hidden');
  cardIndex = 0;
  known = 0;
  renderCard();
});

$('#exitSet').addEventListener('click', () => location.href = 'index.html');

// Render 3D Flashcard
function renderCard() {
  flipped = false;
  const card = cards[cardIndex];
  $('#cardTextFront').textContent = card.q;
  $('#cardTextBack').textContent = card.a;
  $('#flashcard').classList.remove('flipped');
  $('#setProgress').textContent = `${cardIndex + 1} / ${cards.length}`;
  $('#cardProgress').style.width = `${((cardIndex + 1) / cards.length) * 100}%`;
}

function flip() {
  flipped = !flipped;
  $('#flashcard').classList.toggle('flipped', flipped);
}

$('#flashcard').addEventListener('click', flip);

function move(direction) {
  cardIndex = (cardIndex + direction + cards.length) % cards.length;
  renderCard();
}

$('#previousCard').addEventListener('click', () => move(-1));
$('#nextCard').addEventListener('click', () => move(1));
$('#knownCard').addEventListener('click', () => {
  known++;
  move(1);
});

// Quiz Mode
$('#modeButton').addEventListener('click', () => {
  quizIndex = 0;
  quizScore = 0;
  $('#learn').classList.add('hidden');
  $('#quiz').classList.remove('hidden');
  renderQuiz();
});

$('#backToCards').addEventListener('click', () => {
  $('#quiz').classList.add('hidden');
  $('#learn').classList.remove('hidden');
});

function choicesFor(card) {
  const pool = cards.filter(x => x.a !== card.a).map(x => x.a).sort(() => Math.random() - 0.5).slice(0, 3);
  return [card.a, ...pool].sort(() => Math.random() - 0.5);
}

function renderQuiz() {
  answered = false;
  const card = cards[quizIndex];
  const choices = choicesFor(card);
  $('#quizProgress').textContent = `Question ${quizIndex + 1} of ${cards.length}`;
  $('#quizBar').style.width = `${((quizIndex + 1) / cards.length) * 100}%`;
  $('#quizQuestion').textContent = card.q;
  $('#quizFeedback').textContent = '';
  $('#nextQuiz').classList.add('hidden');

  const box = $('#quizOptions');
  box.innerHTML = '';
  choices.forEach(choice => {
    const b = document.createElement('button');
    b.textContent = choice;
    b.addEventListener('click', () => answer(choice, b, card.a));
    box.append(b);
  });
}

function answer(choice, button, correct) {
  if (answered) return;
  answered = true;
  [...document.querySelectorAll('#quizOptions button')].forEach(b => {
    b.disabled = true;
    if (b.textContent === correct) b.classList.add('correct');
  });

  if (choice === correct) {
    quizScore++;
    $('#quizFeedback').textContent = 'Correct! ✨';
  } else {
    button.classList.add('wrong');
    $('#quizFeedback').textContent = `Answer: ${correct}`;
  }
  $('#nextQuiz').classList.remove('hidden');
}

$('#nextQuiz').addEventListener('click', () => {
  if (quizIndex < cards.length - 1) {
    quizIndex++;
    renderQuiz();
  } else {
    finish();
  }
});

async function finish() {
  let saved = false;
  if (user?.id) {
    try {
      const d = await studyApi('saveResult', {
        userId: user.id,
        setId,
        score: quizScore,
        total: cards.length,
        cardsKnown: known
      });
      localStorage.setItem('gizmoUser', JSON.stringify(d.user));
      saved = true;
    } catch {}
  }

  $('#quiz').classList.add('hidden');
  $('#complete').classList.remove('hidden');
  $('#completeTitle').textContent = `${quizScore} / ${cards.length} Correct!`;
  $('#completeText').textContent = `You marked ${known} cards as known. ${saved ? 'Your stats were saved to your dashboard.' : user ? 'Could not save stats.' : 'Sign up to track your scores!'}`;
}

$('#studyAgain').addEventListener('click', () => {
  $('#complete').classList.add('hidden');
  $('#learn').classList.remove('hidden');
  cardIndex = 0;
  known = 0;
  renderCard();
});

$('#makeAnother').addEventListener('click', () => location.reload());

document.addEventListener('keydown', e => {
  if ($('#learn').classList.contains('hidden')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    flip();
  }
  if (e.key === 'ArrowLeft') move(-1);
  if (e.key === 'ArrowRight') move(1);
  if (e.key.toLowerCase() === 'k') {
    known++;
    move(1);
  }
});
