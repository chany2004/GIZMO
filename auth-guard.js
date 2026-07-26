(function () {
  var user = null;
  try { user = JSON.parse(localStorage.getItem('gizmoUser') || 'null'); } catch (e) {}
  if (user && (user.id || user.guest === true)) return;
  var requested = location.pathname.split('/').pop() || 'index.html';
  requested += location.search + location.hash;
  try { sessionStorage.setItem('questerAuthReturn', requested); } catch (e) {}
  location.replace('index.html?auth=required');
})();
