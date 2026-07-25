// GIZMO Study — Vercel-compatible with safe JSON parsing
var $ = function(s){return document.querySelector(s)};
var cards = [], cardIndex = 0, flipped = false, known = 0, quizIndex = 0, quizScore = 0, answered = false, setId = null;
var user = JSON.parse(localStorage.getItem('gizmoUser') || 'null');

function merge(o1, o2) {
  var r = {};
  for (var k in o1) { if (o1.hasOwnProperty(k)) r[k] = o1[k]; }
  for (var k in o2) { if (o2.hasOwnProperty(k)) r[k] = o2[k]; }
  return r;
}

async function studyApi(action, body) {
  if (!body) body = {};
  if (window.GIZMO && window.GIZMO.studyApi) return window.GIZMO.studyApi(action, body);
  try {
    var r = await fetch('study.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merge({ action: action }, body))
    });
    var text = await r.text();
    if (!text || !text.trim()) throw new Error('Empty response');
    var d = JSON.parse(text);
    if (!r.ok || d.error) throw new Error(d.error || 'Request failed');
    return d;
  } catch(e) {
    throw e;
  }
}

function parseCards() {
  var rows = document.querySelectorAll('.card-row');
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    var q = rows[i].querySelector('.card-question').value.trim();
    var a = rows[i].querySelector('.card-answer').value.trim();
    if (q && a) result.push({ q: q, a: a });
  }
  return result;
}

function updateCount() {
  var total = document.querySelectorAll('.card-row').length;
  var ready = parseCards().length;
  $('#cardCountBadge').textContent = ready + ' of ' + total + ' ready';
  var rows = document.querySelectorAll('.card-row');
  for (var i = 0; i < rows.length; i++) {
    var numTag = rows[i].querySelector('.card-number-tag');
    if (numTag) numTag.textContent = 'Card #' + (i + 1);
  }
}

function addCard(card) {
  if (!card) card = { q: '', a: '' };
  var count = document.querySelectorAll('.card-row').length + 1;
  var row = document.createElement('div');
  row.className = 'card-row';
  row.innerHTML = '<div class="card-row-header"><span class="card-number-tag">Card #' + count + '</span><div class="card-row-actions"><button class="row-action-btn duplicate-btn" type="button" title="Duplicate card">📋 Duplicate</button><button class="row-action-btn delete-btn" type="button" title="Delete card">✕ Delete</button></div></div><div class="card-inputs-grid"><div class="card-input-col"><label>Question</label><textarea class="card-question" rows="2" maxlength="500" placeholder="e.g. What is photosynthesis?"></textarea></div><div class="card-input-col"><label>Answer</label><textarea class="card-answer" rows="2" maxlength="1000" placeholder="e.g. The process plants use to make food from light."></textarea></div></div>';

  var qInput = row.querySelector('.card-question');
  var aInput = row.querySelector('.card-answer');
  qInput.value = card.q || '';
  aInput.value = card.a || '';

  var textareas = row.querySelectorAll('textarea');
  for (var i = 0; i < textareas.length; i++) {
    textareas[i].addEventListener('input', updateCount);
  }

  row.querySelector('.duplicate-btn').addEventListener('click', function() {
    var current = { q: qInput.value.trim(), a: aInput.value.trim() };
    var newRow = addCard(current);
    row.parentNode.insertBefore(newRow, row.nextSibling);
    updateCount();
  });

  row.querySelector('.delete-btn').addEventListener('click', function() {
    if (document.querySelectorAll('.card-row').length <= 1) {
      qInput.value = '';
      aInput.value = '';
    } else {
      row.parentNode.removeChild(row);
    }
    updateCount();
  });

  $('#cardsEditor').appendChild(row);
  updateCount();
  return row;
}

function setCardRows(newCards) {
  $('#cardsEditor').innerHTML = '';
  if (newCards && newCards.length > 0) {
    for (var i = 0; i < newCards.length; i++) {
      addCard(newCards[i]);
    }
  } else {
    addCard();
    addCard();
  }
  updateCount();
}

// Add Card Buttons
$('#addCard').addEventListener('click', function() {
  var row = addCard();
  row.querySelector('.card-question').focus();
});

$('#addCardBottom').addEventListener('click', function() {
  var row = addCard();
  row.querySelector('.card-question').focus();
});

// Swap Q&A
$('#swapCardsBtn').addEventListener('click', function() {
  var rows = document.querySelectorAll('.card-row');
  for (var i = 0; i < rows.length; i++) {
    var q = rows[i].querySelector('.card-question');
    var a = rows[i].querySelector('.card-answer');
    var temp = q.value;
    q.value = a.value;
    a.value = temp;
  }
  updateCount();
});

// Clean Empty Rows
$('#clearEmptyBtn').addEventListener('click', function() {
  var rows = document.querySelectorAll('.card-row');
  for (var i = rows.length - 1; i >= 0; i--) {
    var q = rows[i].querySelector('.card-question').value.trim();
    var a = rows[i].querySelector('.card-answer').value.trim();
    if (!q && !a && document.querySelectorAll('.card-row').length > 1) {
      rows[i].parentNode.removeChild(rows[i]);
    }
  }
  updateCount();
});

// Initial rows
setCardRows([{ q: '', a: '' }, { q: '', a: '' }]);

// Tab Switcher
function showSource(source) {
  var isAi = source === 'ai';
  $('#manualSource').classList.toggle('hidden', isAi);
  $('#aiSource').classList.toggle('hidden', !isAi);
  var btns = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].dataset.source === source);
  }
  $('#error').textContent = '';
}

var tabBtns = document.querySelectorAll('.tab-btn');
for (var i = 0; i < tabBtns.length; i++) {
  tabBtns[i].addEventListener('click', function() { showSource(this.dataset.source); });
}

// Check AI Status
async function initAiStatus() {
  try {
    var d = await studyApi('aiStatus');
    if (d.configured) {
      $('#aiStatusText').textContent = 'AI Ready ⚡';
    } else {
      $('#aiStatusText').textContent = 'Local AI';
    }
  } catch(e) {
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
  var reader = new FileReader();
  reader.onload = function() {
    $('#sourceText').value = String(reader.result || '');
    $('#fileName').textContent = file.name;
    $('#error').textContent = '';
  };
  reader.onerror = function() { $('#error').textContent = 'Could not read that file.'; };
  reader.readAsText(file);
}

$('#fileInput').addEventListener('change', function(e) { loadFile(e.target.files[0]); });

var dropZone = $('#dropZone');
dropZone.addEventListener('dragenter', function(e) { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', function(e) { e.preventDefault(); dropZone.classList.remove('dragging'); });
dropZone.addEventListener('drop', function(e) { e.preventDefault(); dropZone.classList.remove('dragging'); loadFile(e.dataTransfer.files[0]); });

// Generate Cards
$('#generateCards').addEventListener('click', async function() {
  var material = $('#sourceText').value.trim();
  if (material.length < 30) {
    $('#error').textContent = 'Please add more study material first (at least 30 characters).';
    return;
  }
  var button = $('#generateCards');
  button.disabled = true;
  button.innerHTML = '<span>Generating Cards ✦</span>';
  $('#error').textContent = '';

  try {
    var data = await studyApi('generateCards', { material: material, count: Number($('#aiCardCount').value) });
    var generated = [];
    if (data.cards) {
      for (var i = 0; i < data.cards.length; i++) {
        if (data.cards[i] && data.cards[i].q && data.cards[i].a) generated.push(data.cards[i]);
      }
    }
    if (generated.length < 2) throw new Error('Could not make enough usable cards.');
    setCardRows(generated);
    showSource('manual');
    $('#error').textContent = '✨ ' + generated.length + ' flashcards generated! Review them below.';
  } catch (err) {
    $('#error').textContent = err.message;
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>Generate Cards ✦</span>';
  }
});

// Create Set
$('#createSet').addEventListener('click', async function() {
  cards = parseCards();
  if (cards.length < 2) {
    $('#error').textContent = 'Please fill out at least two valid Question & Answer cards.';
    return;
  }
  var title = $('#setTitle').value.trim() || 'My Study Set';
  localStorage.setItem('gizmoStudySet', JSON.stringify({ title: title, cards: cards }));

  if (user && user.id) {
    try {
      var d = await studyApi('saveSet', { userId: user.id, title: title, cards: cards });
      setId = d.setId;
    } catch(e) {}
  }

  $('#setName').textContent = title.toUpperCase();
  $('#builder').classList.add('hidden');
  $('#learn').classList.remove('hidden');
  cardIndex = 0;
  known = 0;
  renderCard();
});

$('#exitSet').addEventListener('click', function() { location.href = 'index.html'; });

// Render 3D Flashcard
function renderCard() {
  flipped = false;
  var card = cards[cardIndex];
  $('#cardTextFront').textContent = card.q;
  $('#cardTextBack').textContent = card.a;
  $('#flashcard').classList.remove('flipped');
  $('#setProgress').textContent = (cardIndex + 1) + ' / ' + cards.length;
  $('#cardProgress').style.width = ((cardIndex + 1) / cards.length * 100) + '%';
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

$('#previousCard').addEventListener('click', function() { move(-1); });
$('#nextCard').addEventListener('click', function() { move(1); });
$('#knownCard').addEventListener('click', function() { known++; move(1); });

// Quiz Mode
$('#modeButton').addEventListener('click', function() {
  quizIndex = 0;
  quizScore = 0;
  $('#learn').classList.add('hidden');
  $('#quiz').classList.remove('hidden');
  renderQuiz();
});

$('#backToCards').addEventListener('click', function() {
  $('#quiz').classList.add('hidden');
  $('#learn').classList.remove('hidden');
});

function choicesFor(card) {
  var pool = [];
  for (var i = 0; i < cards.length; i++) {
    if (cards[i].a !== card.a) pool.push(cards[i].a);
  }
  pool.sort(function() { return Math.random() - 0.5; });
  pool = pool.slice(0, 3);
  var result = [card.a].concat(pool);
  result.sort(function() { return Math.random() - 0.5; });
  return result;
}

function renderQuiz() {
  answered = false;
  var card = cards[quizIndex];
  var choices = choicesFor(card);
  $('#quizProgress').textContent = 'Question ' + (quizIndex + 1) + ' of ' + cards.length;
  $('#quizBar').style.width = ((quizIndex + 1) / cards.length * 100) + '%';
  $('#quizQuestion').textContent = card.q;
  $('#quizFeedback').textContent = '';
  $('#nextQuiz').classList.add('hidden');

  var box = $('#quizOptions');
  box.innerHTML = '';
  for (var i = 0; i < choices.length; i++) {
    (function(choice) {
      var b = document.createElement('button');
      b.textContent = choice;
      b.addEventListener('click', function() { answer(choice, b, card.a); });
      box.appendChild(b);
    })(choices[i]);
  }
}

function answer(choice, button, correct) {
  if (answered) return;
  answered = true;
  var btns = document.querySelectorAll('#quizOptions button');
  for (var i = 0; i < btns.length; i++) {
    btns[i].disabled = true;
    if (btns[i].textContent === correct) btns[i].classList.add('correct');
  }

  if (choice === correct) {
    quizScore++;
    $('#quizFeedback').textContent = 'Correct! ✨';
  } else {
    button.classList.add('wrong');
    $('#quizFeedback').textContent = 'Answer: ' + correct;
  }
  $('#nextQuiz').classList.remove('hidden');
}

$('#nextQuiz').addEventListener('click', function() {
  if (quizIndex < cards.length - 1) {
    quizIndex++;
    renderQuiz();
  } else {
    finish();
  }
});

async function finish() {
  var saved = false;
  if (user && user.id) {
    try {
      var d = await studyApi('saveResult', { userId: user.id, setId: setId, score: quizScore, total: cards.length, cardsKnown: known });
      localStorage.setItem('gizmoUser', JSON.stringify(d.user));
      saved = true;
    } catch(e) {}
  }

  $('#quiz').classList.add('hidden');
  $('#complete').classList.remove('hidden');
  $('#completeTitle').textContent = quizScore + ' / ' + cards.length + ' Correct!';
  $('#completeText').textContent = 'You marked ' + known + ' cards as known. ' + (saved ? 'Your stats were saved.' : user ? 'Could not save stats.' : 'Sign up to track your scores!');
}

$('#studyAgain').addEventListener('click', function() {
  $('#complete').classList.add('hidden');
  $('#learn').classList.remove('hidden');
  cardIndex = 0;
  known = 0;
  renderCard();
});

$('#makeAnother').addEventListener('click', function() { location.reload(); });

document.addEventListener('keydown', function(e) {
  if ($('#learn').classList.contains('hidden')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    flip();
  }
  if (e.key === 'ArrowLeft') move(-1);
  if (e.key === 'ArrowRight') move(1);
  if (e.key.toLowerCase() === 'k') { known++; move(1); }
});
