document.addEventListener('DOMContentLoaded', () => {
  requireLogin();
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Show a one-off toast carried over from another page (e.g. after cancelling a venue)
  const pendingToast = sessionStorage.getItem('ua_toast');
  if (pendingToast) {
    sessionStorage.removeItem('ua_toast');
    try {
      const { message, type } = JSON.parse(pendingToast);
      showToast(message, type !== 'success');
    } catch (_) {}
  }

  let allVenues = [];
  let currentFilter = 'all';

  loadVenues();

  async function loadVenues() {
    try {
      allVenues = await fnFetch('admin-venues');
      renderTable(allVenues);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function renderTable(venues) {
    const filtered = currentFilter === 'all' ? venues : venues.filter(v => v.status === currentFilter);
    const tbody = document.getElementById('venues-tbody');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No venues found.</td></tr>`;
      return;
    }
    tbody.innerHTML = filtered.map(v => `
      <tr>
        <td><a href="venue.html?id=${v.id}" class="venue-name-link">${esc(v.name)}</a></td>
        <td>${esc(v.contact_name || '—')}</td>
        <td>${v.artwork_count}</td>
        <td>${v.artwork_count > 0 ? '$' + v.monthly_total.toFixed(2) + ' (inc. GST)' : '—'}</td>
        <td><span class="badge badge-${v.status}">${v.status.replace('_', ' ')}</span></td>
        <td><a href="venue.html?id=${v.id}" class="action-btn">View →</a></td>
      </tr>
    `).join('');
  }

  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTable(allVenues);
    });
  });

  const modal = document.getElementById('modal-venue');
  document.getElementById('btn-add-venue').addEventListener('click', () => modal.classList.add('open'));
  document.getElementById('modal-close').addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

  document.getElementById('form-venue').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const venue = await fnFetch('admin-venues', {
        method: 'POST',
        body: {
          name:         e.target.name.value.trim(),
          contact_name: e.target.contact_name.value.trim(),
          email:        e.target.email.value.trim(),
          phone:        e.target.phone.value.trim(),
          venue_type:   e.target.venue_type.value,
          address:      e.target.address.value.trim(),
          notes:        e.target.notes.value.trim(),
        },
      });
      modal.classList.remove('open');
      e.target.reset();
      showToast('Venue created');
      window.location.href = 'venue.html?id=' + venue.id;
    } catch (err) {
      showToast(err.message, true);
      btn.disabled = false; btn.textContent = 'Save Venue';
    }
  });
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
