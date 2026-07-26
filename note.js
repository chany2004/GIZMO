var notes = [];
try { notes = JSON.parse(localStorage.getItem('questerNotes') || '[]'); } catch(e) {}
if (!Array.isArray(notes)) notes = [];

var params = new URLSearchParams(location.search);
var activeId = params.get('id');
var activeNote = notes.find(function(note) { return note.id === activeId; }) || null;
var titleInput = document.getElementById('noteTitle');
var textInput = document.getElementById('noteText');
var status = document.getElementById('saveStatus');
var dirty = false;
var autoSaveTimer = null;
var pinned = !!(activeNote && activeNote.pinned);
var favorite = !!(activeNote && activeNote.favorite);
var generatedCards = [];
var inlineCardIndex = 0;
var inlineCardFlipped = false;

if (activeNote) {
  titleInput.value = activeNote.title || '';
  if (activeNote.html) textInput.innerHTML = activeNote.html;
  else textInput.textContent = activeNote.text || '';
  status.textContent = 'Saved note';
  document.getElementById('deleteNote').classList.remove('hidden');
}

function persistNotes() {
  localStorage.setItem('questerNotes', JSON.stringify(notes));
}
function updateTools() {
  document.getElementById('pinNote').classList.toggle('active', pinned);
  document.getElementById('favoriteNote').classList.toggle('active', favorite);
  document.querySelector('#favoriteNote span').textContent = favorite ? '★' : '☆';
}
function updateMeta() {
  var value = textInput.innerText || '';
  var words = value.trim() ? value.trim().split(/\s+/).length : 0;
  document.getElementById('noteMeta').textContent = words + ' word' + (words === 1 ? '' : 's') + ' · ' + value.length + ' character' + (value.length === 1 ? '' : 's');
}
function saveNote(isAutomatic) {
  clearTimeout(autoSaveTimer);
  var now = Date.now();
  var note = {
    id: activeId || String(now) + Math.random().toString(16).slice(2),
    title: titleInput.value.trim() || 'Untitled note',
    text: textInput.innerText || '',
    html: textInput.innerHTML,
    savedAt: now,
    pinned: pinned,
    favorite: favorite
  };
  var index = notes.findIndex(function(item) { return item.id === activeId; });
  if (index >= 0) notes[index] = note; else notes.push(note);
  activeId = note.id;
  activeNote = note;
  persistNotes();
  history.replaceState(null, '', 'note.html?id=' + encodeURIComponent(activeId));
  dirty = false;
  status.textContent = isAutomatic ? 'Auto-saved' : 'Saved just now';
  document.getElementById('updatedMeta').textContent = 'Updated ' + new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  document.getElementById('deleteNote').classList.remove('hidden');
}
function scheduleAutoSave() {
  dirty = true;
  status.textContent = 'Saving…';
  updateMeta();
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(function() { saveNote(true); }, 800);
}
function downloadNote() {
  var title = titleInput.value.trim() || 'Untitled note';
  var blob = new Blob([title + '\r\n\r\n' + (textInput.innerText || '')], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) + '.txt';
  link.click();
  URL.revokeObjectURL(url);
}

titleInput.addEventListener('input', scheduleAutoSave);
textInput.addEventListener('input', scheduleAutoSave);
document.getElementById('saveNote').addEventListener('click', function() { saveNote(false); });
document.getElementById('pinNote').addEventListener('click', function() { pinned = !pinned; updateTools(); saveNote(true); });
document.getElementById('favoriteNote').addEventListener('click', function() { favorite = !favorite; updateTools(); saveNote(true); });
document.getElementById('duplicateNote').addEventListener('click', function() {
  var now = Date.now();
  var copy = { id: String(now) + 'copy', title: (titleInput.value.trim() || 'Untitled note') + ' — Copy', text: textInput.innerText || '', html: textInput.innerHTML, savedAt: now, pinned: false, favorite: false };
  notes.push(copy);
  persistNotes();
  location.href = 'note.html?id=' + encodeURIComponent(copy.id);
});
document.getElementById('downloadNote').addEventListener('click', downloadNote);
document.querySelectorAll('[data-prompt]').forEach(function(button) {
  button.addEventListener('click', function() {
    textInput.focus();
    var current = textInput.innerText.trim();
    document.execCommand('insertText', false, (current ? '\n\n' : '') + button.dataset.prompt + ' ');
    scheduleAutoSave();
  });
});
document.querySelectorAll('[data-command]').forEach(function(button) {
  button.addEventListener('mousedown', function(event) { event.preventDefault(); });
  button.addEventListener('click', function() {
    textInput.focus();
    document.execCommand(button.dataset.command, false, null);
    scheduleAutoSave();
  });
});
textInput.addEventListener('paste', function(event) {
  event.preventDefault();
  document.execCommand('insertText', false, (event.clipboardData || window.clipboardData).getData('text/plain'));
});
document.getElementById('deleteNote').addEventListener('click', function() {
  if (!activeId || !window.confirm('Delete this note?')) return;
  notes = notes.filter(function(note) { return note.id !== activeId; });
  persistNotes();
  dirty = false;
  location.href = 'study.html#notes';
});

async function generateCardsFromNote() {
  var material = (titleInput.value.trim() + '\n\n' + (textInput.innerText || '').trim()).trim();
  if (material.length < 30) {
    window.alert('Write a little more first (at least 30 characters) so we can make useful flashcards.');
    textInput.focus();
    return;
  }
  saveNote(true);
  var buttons = document.querySelectorAll('#generateFlashcards, #generateFlashcardsMobile');
  buttons.forEach(function(button) { button.disabled = true; });
  document.getElementById('generateToast').classList.remove('hidden');
  try {
    var data;
    if (window.GIZMO && window.GIZMO.studyApi) {
      data = await window.GIZMO.studyApi('generateCards', { material: material, count: 'auto' });
    } else {
      var response = await fetch('study.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generateCards', material: material, count: 'auto' })
      });
      data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Could not generate flashcards.');
    }
    generatedCards = (data.cards || []).filter(function(card) { return card && card.q && card.a; });
    if (generatedCards.length < 2) throw new Error('Could not make enough flashcards from this note.');
    var preview = document.getElementById('generatedPreview');
    preview.innerHTML = '';
    generatedCards.slice(0, 3).forEach(function(card) {
      var item = document.createElement('span');
      item.className = 'preview-card';
      item.textContent = card.q;
      preview.appendChild(item);
    });
    document.getElementById('flashcardModalText').textContent = generatedCards.length + ' flashcards created. Choose how you want to use them.';
    document.getElementById('inlineStudy').classList.add('hidden');
    document.getElementById('generatedCardChoices').classList.remove('hidden');
    document.getElementById('flashcardModal').classList.remove('hidden');
  } catch (error) {
    window.alert(error && error.message ? error.message : 'Could not generate flashcards. Please try again.');
  } finally {
    buttons.forEach(function(button) { button.disabled = false; });
    document.getElementById('generateToast').classList.add('hidden');
  }
}

document.getElementById('generateFlashcards').addEventListener('click', generateCardsFromNote);
document.getElementById('generateFlashcardsMobile').addEventListener('click', generateCardsFromNote);
document.querySelectorAll('[data-close-modal]').forEach(function(button) {
  button.addEventListener('click', function() { document.getElementById('flashcardModal').classList.add('hidden'); });
});
document.getElementById('studyGeneratedCards').addEventListener('click', function() {
  if (generatedCards.length < 2) return;
  inlineCardIndex = 0;
  inlineCardFlipped = false;
  document.getElementById('generatedCardChoices').classList.add('hidden');
  document.getElementById('inlineStudy').classList.remove('hidden');
  renderInlineCard();
});
document.getElementById('playGeneratedCards').addEventListener('click', function() {
  if (generatedCards.length < 2) return;
  var set = { title: titleInput.value.trim() || 'My Note Challenge', cards: generatedCards };
  localStorage.setItem('gizmoMultiplayerStudy', JSON.stringify(set));
  location.href = 'game.html?study=1';
});

function renderInlineCard() {
  var card = generatedCards[inlineCardIndex];
  var flashcard = document.getElementById('inlineFlashcard');
  flashcard.classList.toggle('answer', inlineCardFlipped);
  document.getElementById('inlineCardSide').textContent = inlineCardFlipped ? 'ANSWER' : 'QUESTION';
  document.getElementById('inlineCardText').textContent = inlineCardFlipped ? card.a : card.q;
  document.getElementById('inlineCardProgress').textContent = (inlineCardIndex + 1) + ' / ' + generatedCards.length;
  flashcard.querySelector('small').textContent = inlineCardFlipped ? 'Click to see the question' : 'Click to reveal the answer';
}
document.getElementById('inlineFlashcard').addEventListener('click', function() {
  inlineCardFlipped = !inlineCardFlipped;
  renderInlineCard();
});
document.getElementById('previousInlineCard').addEventListener('click', function() {
  inlineCardIndex = (inlineCardIndex - 1 + generatedCards.length) % generatedCards.length;
  inlineCardFlipped = false;
  renderInlineCard();
});
document.getElementById('nextInlineCard').addEventListener('click', function() {
  inlineCardIndex = (inlineCardIndex + 1) % generatedCards.length;
  inlineCardFlipped = false;
  renderInlineCard();
});
document.getElementById('backToGeneratedChoices').addEventListener('click', function() {
  document.getElementById('inlineStudy').classList.add('hidden');
  document.getElementById('generatedCardChoices').classList.remove('hidden');
});
document.addEventListener('keydown', function(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveNote(false);
  }
});
window.addEventListener('beforeunload', function() {
  if (dirty) saveNote(true);
});

updateTools();
updateMeta();
