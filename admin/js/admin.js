document.addEventListener('DOMContentLoaded', () => {
  requireLogin();
  document.getElementById('btn-logout').addEventListener('click', logout);

  loadStats();

  async function loadStats() {
    try {
      const venues = await fnFetch('admin-venues');
      const active   = venues.filter(v => v.status === 'active');
      const past_due = venues.filter(v => v.status === 'past_due');
      const revenue  = active.reduce((s, v) => s + (v.monthly_amount || 0), 0);
      const artworks = venues.reduce((s, v) => s + (v.artwork_count || 0), 0);

      document.getElementById('stat-venues').textContent   = active.length;
      document.getElementById('stat-revenue').textContent  = '$' + revenue.toLocaleString('en-AU');
      document.getElementById('stat-artworks').textContent = artworks;
      document.getElementById('stat-pastdue').textContent  = past_due.length;
      if (past_due.length > 0) document.getElementById('stat-pastdue').classList.add('red');
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, isError = false) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  requestAnimationFrame(() => { requestAnimationFrame(() => { t.classList.add('show'); }); });
  setTimeout(() => { t.classList.remove('show'); }, 3500);
}
