/* GIZMO — AI Chat Assistant Widget */

(function () {
  var chatHistory = [];
  var isSending = false;

  function injectChatWidget() {
    if (document.getElementById('gizmoAiWindow')) return;

    var d = document.createElement('div');
    d.innerHTML =
      '<button class="gizmo-ai-launcher" id="gizmoAiLauncher" type="button" aria-label="Open Gizmo AI Chat">' +
        '<span class="bot-icon">🤖</span>' +
        '<span>Ask Gizmo AI</span>' +
        '<span class="live-pulse"></span>' +
      '</button>' +
      '<div class="gizmo-ai-window hidden" id="gizmoAiWindow" role="dialog" aria-label="Gizmo AI Assistant">' +
        '<div class="ai-chat-header">' +
          '<div class="ai-header-info">' +
            '<div class="ai-avatar">🤖</div>' +
            '<div class="ai-title-wrap">' +
              '<strong>Gizmo ChatGPT AI</strong>' +
              '<small id="aiProviderBadge">Active &amp; Ready ⚡</small>' +
            '</div>' +
          '</div>' +
          '<button class="ai-close-btn" id="gizmoAiClose" type="button" aria-label="Close AI Chat">&#10005;</button>' +
        '</div>' +
        '<div class="ai-chat-body" id="aiChatBody">' +
          '<div class="chat-bubble ai">' +
            'Hello! I am <strong>Gizmo AI</strong> 🤖. Ask me anything! I can explain complex topics, answer trivia, give study tips, or help you learn.' +
            '<div class="chat-suggestions">' +
              '<button class="chip-btn" data-prompt="Explain Quantum Physics simply">💡 Quantum Physics</button>' +
              '<button class="chip-btn" data-prompt="Give me 5 best study tips for exams">📝 Study Tips</button>' +
              '<button class="chip-btn" data-prompt="What is the difference between DNA and RNA?">🧪 DNA vs RNA</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ai-chat-footer">' +
          '<form class="chat-form" id="aiChatForm">' +
            '<input id="aiChatInput" type="text" placeholder="Ask Gizmo AI a question..." maxlength="2000" autocomplete="off" required>' +
            '<button class="chat-send-btn" id="aiChatSend" type="submit">Send ➔</button>' +
          '</form>' +
        '</div>' +
      '</div>';

    document.body.appendChild(d);
    bindEvents();
  }

  function bindEvents() {
    var launcher = document.getElementById('gizmoAiLauncher');
    var windowEl = document.getElementById('gizmoAiWindow');
    var closeBtn = document.getElementById('gizmoAiClose');
    var form = document.getElementById('aiChatForm');
    var input = document.getElementById('aiChatInput');
    var body = document.getElementById('aiChatBody');

    if (!launcher || !windowEl || !closeBtn || !form || !input || !body) return;

    launcher.addEventListener('click', function () {
      windowEl.classList.toggle('hidden');
      if (!windowEl.classList.contains('hidden')) input.focus();
    });

    closeBtn.addEventListener('click', function () {
      windowEl.classList.add('hidden');
    });

    body.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip-btn');
      if (chip && chip.dataset.prompt) {
        input.value = chip.dataset.prompt;
        form.dispatchEvent(new Event('submit'));
      }
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var message = input.value.trim();
      if (!message || isSending) return;

      appendBubble(message, 'user');
      input.value = '';
      isSending = true;

      var sendBtn = document.getElementById('aiChatSend');
      if (!sendBtn) return;
      sendBtn.disabled = true;
      sendBtn.textContent = 'Thinking…';

      var typingBubble = appendBubble('Thinking… 🤖', 'ai typing');

      try {
        var resp, data, txt;

        // Use the unified API. On Vercel this is /api; on XAMPP it is api.php.
        // Direct chat.php requests bypassed the Vercel Function and caused the
        // misleading old "AI is offline" fallback.
        if (window.GIZMO && window.GIZMO.chatApi) {
          data = await window.GIZMO.chatApi({ message: message, history: chatHistory });
          resp = { ok: true };
        } else {
          resp = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: 'chat', message: message, history: chatHistory })
          });
          txt = await resp.text();
          data = txt ? JSON.parse(txt) : {};
        }

        if (typingBubble && typingBubble.parentNode) typingBubble.remove();

        if (!resp.ok || data.error) {
          appendBubble(data && data.error ? data.error : 'AI is offline. Set up an API key in setup_ai.php.', 'ai');
        } else {
          appendBubble(data.reply, 'ai');
          if (data.provider) {
            var badge = document.getElementById('aiProviderBadge');
            if (badge) badge.textContent = data.provider + ' ⚡';
          }
          chatHistory.push({ role: 'user', content: message });
          chatHistory.push({ role: 'assistant', content: data.reply });
        }
      } catch (err) {
        if (typingBubble && typingBubble.parentNode) typingBubble.remove();
        appendBubble('AI needs a backend connection. The chat button still shows!', 'ai');
      } finally {
        isSending = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send ➔';
      }
    });
  }

  function appendBubble(text, type) {
    var body = document.getElementById('aiChatBody');
    if (!body) return null;
    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + type;

    if (type.indexOf('ai') !== -1 && type.indexOf('typing') === -1) {
      var formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
      bubble.innerHTML = formatted;
    } else {
      bubble.textContent = text;
    }

    body.appendChild(bubble);
    body.scrollTop = body.scrollHeight;
    return bubble;
  }

  // Auto initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectChatWidget);
  } else {
    injectChatWidget();
  }
})();
