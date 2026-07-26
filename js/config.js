/**
 * GIZMO — API Configuration
 * Auto-detects environment (Vercel vs XAMPP) and provides fallback
 * 
 * Vercel = static hosting (no PHP/MySQL) -> localStorage fallback
 * XAMPP = full stack (PHP + MySQL) -> real API
 */

(function() {
  var GIZMO = window.GIZMO = window.GIZMO || {};

  // Detect if running on Vercel (no PHP backend)
  GIZMO.isVercel = !location.hostname.includes('localhost') && !location.hostname.includes('127.0.0.1') && !location.hostname.includes('192.168');

  // Google OAuth Web Client IDs are public browser configuration. The server
  // still verifies every returned ID token before creating a session.
  GIZMO.googleClientId = '248098586908-ofvgjd7l2tm6d0svfk8893obii0d02qa.apps.googleusercontent.com';

  GIZMO.backendAvailable = false;
  // Vercel deploys api/index.php at /api; XAMPP uses the root PHP router.
  GIZMO.apiBase = GIZMO.isVercel ? '/api' : 'api.php';

  // Safe parse: read text first, handle empty responses
  function safeJson(r) {
    return r.text().then(function(text) {
      if (!text || !text.trim()) throw new Error('The server returned an empty response. Check the Vercel Function logs.');
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('The Vercel API did not return JSON. Check the Function logs and database environment variables.');
      }
    });
  }

  // Merge helper (avoids spread operator for older browsers)
  function merge(obj1, obj2) {
    var result = {};
    for (var k in obj1) { if (obj1.hasOwnProperty(k)) result[k] = obj1[k]; }
    for (var k in obj2) { if (obj2.hasOwnProperty(k)) result[k] = obj2[k]; }
    return result;
  }

  // Unified API caller with fallback
  GIZMO.api = async function(endpoint, data) {
    if (!data) data = {};
    data.endpoint = endpoint;
    try {
      var r = await fetch(GIZMO.apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      var d = await safeJson(r);
      if (!r.ok || d.error) throw new Error(d.error || 'Request failed');
      GIZMO.backendAvailable = true;
      return d;
    } catch (e) {
      GIZMO.backendAvailable = false;
      
      // Try direct PHP file as fallback (XAMPP local)
      var phpCandidates = [endpoint+'.php', endpoint+'/'+endpoint+'.php'];
      for (var i = 0; i < phpCandidates.length; i++) {
        try {
          var r = await fetch(phpCandidates[i], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          if (r.ok) {
            var d = await safeJson(r);
            if (!d.error) {
              GIZMO.backendAvailable = true;
              return d;
            }
          }
        } catch(err) {}
      }
      throw e;
    }
  };

  GIZMO.authApi = function(action, body) {
    return GIZMO.api('auth', merge({ action: action }, body || {}));
  };

  GIZMO.profileApi = function(action, body) {
    return GIZMO.api('profile', merge({ action: action }, body || {}));
  };

  GIZMO.quizApi = function(action, body) {
    return GIZMO.api('quiz', merge({ action: action }, body || {}));
  };

  GIZMO.multiplayerApi = function(action, body) {
    return GIZMO.api('multiplayer', merge({ action: action }, body || {}));
  };

  GIZMO.studyApi = function(action, body) {
    return GIZMO.api('study', merge({ action: action }, body || {}));
  };

  GIZMO.chatApi = function(body) {
    return GIZMO.api('chat', body || {});
  };

  GIZMO.checkBackend = async function() {
    try {
      await GIZMO.api('auth', { action: 'me', id: 'ping' });
      GIZMO.backendAvailable = true;
      return true;
    } catch(err) {
      GIZMO.backendAvailable = false;
      return false;
    }
  };

  console.log('GIZMO running on ' + (GIZMO.isVercel ? 'Vercel' : 'XAMPP'));
})();
