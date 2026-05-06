document.addEventListener('DOMContentLoaded', () => {
  requireLogin();
  document.getElementById('btn-logout').addEventListener('click', logout);

  const params = new URLSearchParams(window.location.search);
  const venueId = params.get('id');
  if (!venueId) { window.location.href = 'index.html'; return; }

  let venueData = null;

  loadVenue();

  async function loadVenue() {
    try {
      venueData = await fnFetch('admin-venues?id=' + venueId);
      renderVenueHeader(venueData);
      renderSubscriptionCard(venueData);
      renderArtworks(venueData.artworks || []);
      renderPayments(venueData.payments || []);
      document.dispatchEvent(new CustomEvent('venueLoaded', { detail: venueData }));
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function renderVenueHeader(v) {
    document.title = v.name + ' — UnveilArt Admin';
    document.getElementById('venue-name').textContent = v.name;
    document.getElementById('info-contact').textContent = v.contact_name || '—';
    document.getElementById('info-email').textContent   = v.email;
    document.getElementById('info-phone').textContent   = v.phone || '—';
    document.getElementById('info-type').textContent    = v.venue_type || '—';
    document.getElementById('info-address').textContent = v.address || '—';
    document.getElementById('status-badge').textContent = v.status.replace('_', ' ');
    document.getElementById('status-badge').className   = 'badge badge-' + v.status;
  }

  function renderSubscriptionCard(v) {
    const card = document.getElementById('sub-card');
    if (!v.stripe_subscription_id && v.artwork_count === 0) {
      card.innerHTML = '<p style="color:var(--stone-gray);font-size:14px;margin:0;">No active subscription. Add artworks to begin billing.</p>';
      return;
    }
    card.innerHTML = `
      <div class="item"><div class="label">Artworks</div><div class="value">${v.artwork_count}</div></div>
      <div class="item"><div class="label">Monthly (ex-GST)</div><div class="value">$${(v.monthly_amount||0).toFixed(2)} AUD</div></div>
      <div class="item"><div class="label">Monthly Total</div><div class="value">$${(v.monthly_total||0).toFixed(2)} AUD</div></div>
      <div class="item"><div class="label">Status</div><div class="value"><span class="badge badge-${v.status}">${v.status.replace('_',' ')}</span></div></div>
      ${v.stripe_subscription_id ? `<div class="item"><div class="label">Customer Portal</div><div class="value"><a href="#" id="portal-link" style="color:var(--gold-deep);text-decoration:underline;">Open →</a></div></div>` : ''}
    `;
    document.getElementById('portal-link')?.addEventListener('click', async e => {
      e.preventDefault();
      try {
        const { url } = await fnFetch('admin-subscriptions', { method: 'POST', body: { action: 'portal', venue_id: venueId } });
        window.open(url, '_blank');
      } catch (err) { showToast(err.message, true); }
    });
  }

  function renderArtworks(artworks) {
    const tbody = document.getElementById('artworks-tbody');
    if (artworks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No artworks yet. Add the first one to start billing.</td></tr>`;
      return;
    }
    const installed = artworks.filter(a => a.status === 'installed');
    const others    = artworks.filter(a => a.status !== 'installed');
    tbody.innerHTML = [...installed, ...others].map(a => `
      <tr>
        <td>${esc(a.title || '—')}</td>
        <td>${esc(a.artist_name || '—')}</td>
        <td>${a.installed_at || '—'}</td>
        <td>${esc(a.condition_on_arrival || '—')}</td>
        <td><span class="badge badge-${a.status === 'installed' ? 'active' : 'inactive'}">${a.status}</span></td>
        <td>${a.status === 'installed'
          ? `<button class="action-btn remove" data-id="${a.id}">Remove</button>`
          : `<span style="color:var(--stone-gray);font-size:12px;">${a.removed_at || ''}</span>`}</td>
      </tr>
    `).join('');
    tbody.querySelectorAll('.action-btn.remove').forEach(btn => {
      btn.addEventListener('click', () => openRemoveModal(btn.dataset.id));
    });
  }

  function renderPayments(payments) {
    const tbody = document.getElementById('payments-tbody');
    if (payments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No payment history yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = payments.map(p => `
      <tr>
        <td>${p.created_at ? new Date(p.created_at).toLocaleDateString('en-AU') : '—'}</td>
        <td>${p.artwork_count ?? '—'}</td>
        <td>$${(p.amount || 0).toFixed(2)}</td>
        <td>$${(p.gst_amount || 0).toFixed(2)}</td>
        <td>$${(p.total_amount || 0).toFixed(2)}</td>
        <td><span class="badge badge-${p.status}">${p.status}</span></td>
        <td>${p.invoice_url ? `<a href="${p.invoice_url}" target="_blank" rel="noopener" style="color:var(--gold-deep);text-decoration:underline;">View</a>` : '—'}</td>
      </tr>
    `).join('');
  }

  // Add Artwork Modal
  const addModal = document.getElementById('modal-artwork');
  document.getElementById('btn-add-artwork').addEventListener('click', () => addModal.classList.add('open'));
  document.getElementById('modal-artwork-close').addEventListener('click', () => addModal.classList.remove('open'));
  addModal.addEventListener('click', e => { if (e.target === addModal) addModal.classList.remove('open'); });

  document.getElementById('form-artwork').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await fnFetch('admin-artworks', {
        method: 'POST',
        body: {
          venue_id:             venueId,
          title:                e.target.title.value.trim(),
          artist_name:          e.target.artist_name.value.trim(),
          installed_at:         e.target.installed_at.value,
          condition_on_arrival: e.target.condition_on_arrival.value.trim(),
          notes:                e.target.notes.value.trim(),
        },
      });
      addModal.classList.remove('open');
      e.target.reset();
      showToast('Artwork added — subscription updated');
      await loadVenue();
    } catch (err) {
      showToast(err.message, true);
      btn.disabled = false; btn.textContent = 'Add Artwork';
    }
  });

  // Remove Artwork Modal
  const removeModal = document.getElementById('modal-remove');
  let removeArtworkId = null;

  function openRemoveModal(id) {
    removeArtworkId = id;
    document.getElementById('remove-date').value = new Date().toISOString().split('T')[0];
    removeModal.classList.add('open');
  }

  document.getElementById('modal-remove-close').addEventListener('click', () => removeModal.classList.remove('open'));
  removeModal.addEventListener('click', e => { if (e.target === removeModal) removeModal.classList.remove('open'); });

  document.getElementById('form-remove').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Removing…';
    try {
      await fnFetch(`admin-artworks?id=${removeArtworkId}&venue_id=${venueId}`, {
        method: 'DELETE',
        body: {
          removed_at:          e.target.removed_at.value,
          condition_on_return: e.target.condition_on_return.value.trim(),
        },
      });
      removeModal.classList.remove('open');
      e.target.reset();
      showToast('Artwork removed — subscription updated');
      await loadVenue();
    } catch (err) {
      showToast(err.message, true);
      btn.disabled = false; btn.textContent = 'Confirm Remove';
    }
  });

  // Cancel Subscription Modal
  const cancelModal = document.getElementById('modal-cancel');
  document.getElementById('btn-cancel-sub')?.addEventListener('click', () => cancelModal.classList.add('open'));
  document.getElementById('modal-cancel-close').addEventListener('click', () => cancelModal.classList.remove('open'));
  cancelModal.addEventListener('click', e => { if (e.target === cancelModal) cancelModal.classList.remove('open'); });

  document.getElementById('form-cancel').addEventListener('submit', async e => {
    e.preventDefault();
    const immediately = document.getElementById('cancel-immediately').checked;
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Cancelling…';
    try {
      await fnFetch('admin-subscriptions', { method: 'POST', body: { action: 'cancel', venue_id: venueId, cancel_immediately: immediately } });
      cancelModal.classList.remove('open');
      showToast(immediately ? 'Subscription cancelled immediately' : 'Subscription will cancel at period end');
      await loadVenue();
    } catch (err) {
      showToast(err.message, true);
      btn.disabled = false; btn.textContent = 'Confirm Cancel';
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
