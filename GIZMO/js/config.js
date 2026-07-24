/**
 * GIZMO — API Configuration
 * Auto-detects environment (Vercel vs XAMPP) and provides fallback
 * 
 * Vercel = static hosting (no PHP/MySQL) → localStorage fallback
 * XAMPP = full stack (PHP + MySQL) → real API
 */

(function() {
  const GIZMO = window.GIZMO = window.GIZMO || {};

  // Detect if running on Vercel (no PHP backend)
  GIZMO.isVercel = !location.hostname.includes('localhost') && !location.hostname.includes('127.0.0.1') && !location.hostname.includes('192.168');
  
  // Detect if we can reach the backend
  GIZMO.backendAvailable = false;

  // API base URL
  GIZMO.apiBase = GIZMO.isVercel ? '/api.php' : 'api.php';

  // Unified API caller with fallback
  GIZMO.api = async function(endpoint, data = {}) {
    data.endpoint = endpoint;
    try {
      const r = await fetch(GIZMO.apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Request failed');
      GIZMO.backendAvailable = true;
      return d;
    } catch (e) {
      // Backend unavailable — use localStorage fallback
      GIZMO.backendAvailable = false;
      
      // Try direct PHP file as fallback (XAMPP local)
      const phpCandidates = [
        `${endpoint}.php`,
        `${endpoint}/${endpoint}.php`
      ];
      
      for (const phpFile of phpCandidates) {
        try {
          const r = await fetch(phpFile, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          if (r.ok) {
            const d = await r.json();
            if (!d.error) {
              GIZMO.backendAvailable = true;
              return d;
            }
          }
        } catch {}
      }
      
      throw e; // Re-throw if all fallbacks fail
    }
  };

  // Auth API
  GIZMO.authApi = function(action, body = {}) {
    return GIZMO.api('auth', { action, ...body });
  };

  // Profile API
  GIZMO.profileApi = function(action, body = {}) {
    return GIZMO.api('profile', { action, ...body });
  };

  // Quiz API
  GIZMO.quizApi = function(action, body = {}) {
    return GIZMO.api('quiz', { action, ...body });
  };

  // Multiplayer API
  GIZMO.multiplayerApi = function(action, body = {}) {
    return GIZMO.api('multiplayer', { action, ...body });
  };

  // Study API
  GIZMO.studyApi = function(action, body = {}) {
    return GIZMO.api('study', { action, ...body });
  };

  // Chat API
  GIZMO.chatApi = function(body = {}) {
    return GIZMO.api('chat', body);
  };

  // Check backend health
  GIZMO.checkBackend = async function() {
    try {
      const d = await GIZMO.api('auth', { action: 'me', id: 'ping' });
      GIZMO.backendAvailable = true;
      return true;
    } catch {
      GIZMO.backendAvailable = false;
      return false;
    }
  };

  console.log(`🌐 GIZMO running on ${GIZMO.isVercel ? 'Vercel' : 'XAMPP'} (backend: ${GIZMO.backendAvailable ? 'online' : 'offline'})`);
})();

