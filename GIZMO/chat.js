/* GIZMO — ChatGPT AI Assistant JavaScript */

(function () {
  let chatHistory = [];
  let isSending = false;

  // Insert Chat Widget HTML into DOM
  function injectChatWidget() {
    if (document.getElementById('gizmoAiWindow')) return;

    const widgetHTML = `
      <button class="gizmo-ai-launcher" id="gizmoAiLauncher" type="button" aria-label="Open Gizmo AI Chat">
        <span class="bot-icon">🤖</span>
        <span>Ask Gizmo AI</span>
        <span class="live-pulse"></span>
      </button>

      <div class="gizmo-ai-window hidden" id="gizmoAiWindow" role="dialog" aria-label="Gizmo AI Assistant">
        <div class="ai-chat-header">
          <div class="ai-header-info">
            <div class="ai-avatar">🤖</div>
            <div class="ai-title-wrap">
              <strong>Gizmo ChatGPT AI</strong>
              <small id="aiProviderBadge">Active & Ready ⚡</small>
            </div>
          </div>
          <button class="ai-close-btn" id="gizmoAiClose" type="button" aria-label="Close AI Chat">✕</button>
        </div>

        <div class="ai-chat-body" id="aiChatBody">
          <div class="chat-bubble ai">
            Hello! I am <strong>Gizmo AI</strong> 🤖. Ask me anything! I can explain complex topics, answer trivia, give study tips, or help you learn.
            <div class="chat-suggestions">
              <button class="chip-btn" data-prompt="Explain Quantum Physics simply">💡 Quantum Physics</button>
              <button class="chip-btn" data-prompt="Give me 5 best study tips for exams">📝 Study Tips</button>
              <button class="chip-btn" data-prompt="What is the difference between DNA and RNA?">🧪 DNA vs RNA</button>
            </div>
          </div>
        </div>

        <div class="ai-chat-footer">
          <form class="chat-form" id="aiChatForm">
            <input id="aiChatInput" type="text" placeholder="Ask Gizmo AI a question..." maxlength="2000" autocomplete="off" required>
            <button class="chat-send-btn" id="aiChatSend" type="submit">Send ➔</button>
          </form>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = widgetHTML;
    document.body.appendChild(div);

    bindEvents();
  }

  function bindEvents() {
    const launcher = document.getElementById('gizmoAiLauncher');
    const windowEl = document.getElementById('gizmoAiWindow');
    const closeBtn = document.getElementById('gizmoAiClose');
    const form = document.getElementById('aiChatForm');
    const input = document.getElementById('aiChatInput');
    const body = document.getElementById('aiChatBody');

    launcher.addEventListener('click', () => {
      windowEl.classList.toggle('hidden');
      if (!windowEl.classList.contains('hidden')) {
        input.focus();
      }
    });

    closeBtn.addEventListener('click', () => {
      windowEl.classList.add('hidden');
    });

    // Chip suggestions click
    body.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-btn');
      if (chip && chip.dataset.prompt) {
        input.value = chip.dataset.prompt;
        form.dispatchEvent(new Event('submit'));
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = input.value.trim();
      if (!message || isSending) return;

      appendBubble(message, 'user');
      input.value = '';
      isSending = true;

      const sendBtn = document.getElementById('aiChatSend');
      sendBtn.disabled = true;
      sendBtn.textContent = 'Thinking…';

      const typingBubble = appendBubble('Thinking… 🤖', 'ai typing');

      try {
        const apiUrl = window.GIZMO?.apiBase ? `${window.GIZMO.apiBase}` : 'chat.php';
        const body = window.GIZMO?.api ? { endpoint: 'chat', message, history: chatHistory } : { message, history: chatHistory };
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const data = await response.json().catch(() => ({}));
        typingBubble.remove();

        if (!response.ok || data.error) {
          appendBubble(data.error || 'Sorry, I could not connect to AI. Please try again.', 'ai');
        } else {
          appendBubble(data.reply, 'ai');
          if (data.provider) {
            document.getElementById('aiProviderBadge').textContent = `${data.provider} ⚡`;
          }
          chatHistory.push({ role: 'user', content: message });
          chatHistory.push({ role: 'assistant', content: data.reply });
        }
      } catch (err) {
        typingBubble.remove();
        appendBubble('Connection error. Please check your connection.', 'ai');
      } finally {
        isSending = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send ➔';
      }
    });
  }

  function appendBubble(text, type) {
    const body = document.getElementById('aiChatBody');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${type}`;

    if (type.includes('ai') && !type.includes('typing')) {
      // Basic formatting for line breaks & bold
      let formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
      bubble.innerHTML = formatted;
    } else {
      bubble.textContent = text;
    }

    body.appendChild(bubble);
    body.scrollTop = body.scrollHeight;
    return bubble;
  }

  // Auto initialize on DOMReady
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectChatWidget);
  } else {
    injectChatWidget();
  }
})();
