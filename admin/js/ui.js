/**
 * ui.js — UnveilArt Admin shared UI components
 * Requires auth.js (requireLogin, logout) and api.js (API) to be loaded first.
 */

/* ══════════════════════════════════════════════════════════
   PAGE INIT
══════════════════════════════════════════════════════════ */

/**
 * Call at the top of each admin page to wire up auth, sidebar, and breadcrumb.
 *
 * @param {{ page: string, breadcrumb?: Array<{label: string, href?: string}> }} options
 */
function initPage(options = {}) {
  requireLogin();

  const { page = '', breadcrumb = [] } = options;

  renderSidebar(page);

  if (breadcrumb.length) {
    const headerEl = document.querySelector('.page-header');
    if (headerEl) {
      const nav = document.createElement('div');
      nav.innerHTML = renderBreadcrumb(breadcrumb);
      headerEl.insertBefore(nav.firstElementChild, headerEl.firstChild);
    }
  }

  // Non-blocking badge load
  loadSidebarBadges().catch(() => {});
}

/* ══════════════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════════════ */

/**
 * Injects the sidebar into document.body and marks the active nav item.
 * @param {string} activePage
 */
function renderSidebar(activePage) {
  const navItems = [
    { page: 'dashboard', href: 'index.html',    icon: '📊', label: 'Dashboard',  badge: '' },
    { page: 'venues',    href: 'venues.html',   icon: '🏨', label: 'Venues',     badge: 'badge-venues' },
    { page: 'artists',   href: 'artists.html',  icon: '🎨', label: 'Artists',    badge: 'badge-artists' },
    { page: 'artworks',  href: 'artworks.html', icon: '🖼️', label: 'Artworks',   badge: 'badge-artworks' },
    { page: 'revenue',   href: 'revenue.html',  icon: '💰', label: 'Revenue',    badge: '' },
    { page: 'settings',  href: 'settings.html', icon: '⚙️', label: 'Settings',   badge: '' },
  ];

  const navHTML = navItems.map(item => {
    const isActive = item.page === activePage;
    const badgeEl  = item.badge
      ? `<span class="sidebar-badge" id="${item.badge}"></span>`
      : '';
    return `
      <a href="${item.href}" class="sidebar-nav-item${isActive ? ' active' : ''}" data-page="${item.page}">
        <span class="sidebar-icon">${item.icon}</span>
        <span>${item.label}</span>
        ${badgeEl}
      </a>`.trim();
  }).join('\n');

  const sidebarHTML = `
<aside class="sidebar" id="sidebar">
  <div class="sidebar-logo">
    <a href="index.html"><b>Unveil</b>Art</a>
    <span>ADMIN</span>
  </div>
  <nav class="sidebar-nav">
    ${navHTML}
  </nav>
  <button class="sidebar-logout" onclick="logout()">Logout</button>
</aside>
<button class="sidebar-toggle" id="sidebar-toggle" onclick="toggleSidebar()" aria-label="Toggle menu">☰</button>
<div class="sidebar-overlay" id="sidebar-overlay" onclick="toggleSidebar()"></div>`;

  const container = document.createElement('div');
  container.innerHTML = sidebarHTML.trim();

  // Prepend all nodes to body
  while (container.lastChild) {
    document.body.insertBefore(container.lastChild, document.body.firstChild);
  }
}

/* ══════════════════════════════════════════════════════════
   SIDEBAR BADGES
══════════════════════════════════════════════════════════ */

/**
 * Loads badge counts into the sidebar nav asynchronously.
 * Silently fails if the API is unavailable.
 */
async function loadSidebarBadges() {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value > 0 ? String(value) : '';
  };

  await Promise.allSettled([
    API.venues.list().then(data => {
      const venues = Array.isArray(data) ? data : (data.venues || []);
      const active = venues.filter(v => v.status === 'active').length;
      set('badge-venues', active);
    }),

    API.artists.list().then(data => {
      const artists = Array.isArray(data) ? data : (data.artists || []);
      const active  = artists.filter(a => a.status === 'active').length;
      set('badge-artists', active);
    }),

    API.artworks.list({ status: 'installed' }).then(data => {
      const artworks  = Array.isArray(data) ? data : (data.artworks || []);
      set('badge-artworks', artworks.length);
    }),
  ]);
}

/* ══════════════════════════════════════════════════════════
   SIDEBAR TOGGLE (mobile)
══════════════════════════════════════════════════════════ */

/** Opens or closes the mobile sidebar. */
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const toggle   = document.getElementById('sidebar-toggle');

  if (!sidebar) return;

  const isOpen = sidebar.classList.toggle('open');
  overlay.classList.toggle('visible', isOpen);

  if (toggle) toggle.textContent = isOpen ? '✕' : '☰';

  // Trap scroll on body when open
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

/* ══════════════════════════════════════════════════════════
   BREADCRUMB
══════════════════════════════════════════════════════════ */

/**
 * Returns a breadcrumb nav HTML string.
 * The last item is rendered as plain text (current page, no link).
 *
 * @param {Array<{label: string, href?: string}>} items
 * @returns {string}
 */
function renderBreadcrumb(items) {
  if (!items || !items.length) return '';

  const parts = items.map((item, i) => {
    const isLast = i === items.length - 1;
    if (isLast) {
      return `<span class="current">${esc(item.label)}</span>`;
    }
    const link = item.href
      ? `<a href="${esc(item.href)}">${esc(item.label)}</a>`
      : `<span>${esc(item.label)}</span>`;
    return link + ' <span class="sep">›</span>';
  });

  return `<nav class="breadcrumb">${parts.join(' ')}</nav>`;
}

/* ══════════════════════════════════════════════════════════
   BADGE
══════════════════════════════════════════════════════════ */

/** Status → CSS class map */
const _badgeClassMap = {
  active:    'badge-active',
  installed: 'badge-installed',
  completed: 'badge-completed',
  past_due:  'badge-past_due',
  inactive:  'badge-inactive',
  stored:    'badge-stored',
  cancelled: 'badge-cancelled',
  pending:   'badge-pending',
  sold:      'badge-sold',
  entry:     'badge-entry',
  mid:       'badge-mid',
  premium:   'badge-premium',
};

/**
 * Returns a badge HTML string for the given status.
 * @param {string} status
 * @param {string} [customLabel]
 * @returns {string}
 */
function badge(status, customLabel) {
  const cls   = _badgeClassMap[status] || 'badge-inactive';
  const label = customLabel || _prettifyStatus(status);
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

/**
 * Converts a snake_case status string to a title-cased label.
 * e.g. 'past_due' → 'Past Due'
 * @param {string} s
 * @returns {string}
 */
function _prettifyStatus(s) {
  if (!s) return '';
  return s
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/* ══════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════ */

let _toastTimer = null;
let _toastEl    = null;

/**
 * Shows a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warn'} [type='success']
 */
function toast(message, type = 'success') {
  // Create element on first use
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.className = 'toast';
    document.body.appendChild(_toastEl);
  }

  // Clear any pending dismiss
  if (_toastTimer) {
    clearTimeout(_toastTimer);
    _toastEl.classList.remove('show', 'error', 'warn', 'success');
  }

  _toastEl.textContent = message;
  _toastEl.classList.remove('error', 'warn', 'success');

  if (type === 'error') _toastEl.classList.add('error');
  else if (type === 'warn') _toastEl.classList.add('warn');
  else _toastEl.classList.add('success');

  // Force reflow so transition plays even when re-showing
  void _toastEl.offsetHeight;
  _toastEl.classList.add('show');

  _toastTimer = setTimeout(() => {
    _toastEl.classList.remove('show');
    _toastTimer = null;
  }, 3500);
}

/* ══════════════════════════════════════════════════════════
   MODAL
══════════════════════════════════════════════════════════ */

/**
 * Shows a generic confirm modal and returns a Promise that resolves
 * when the user confirms and rejects when they cancel.
 *
 * @param {string}   title
 * @param {string}   bodyHTML
 * @param {Function} [onConfirm]
 * @param {string}   [confirmText='Confirm']
 * @returns {Promise<void>}
 */
function showModal(title, bodyHTML, onConfirm, confirmText = 'Confirm') {
  return new Promise((resolve, reject) => {
    // Remove any existing modal
    const existing = document.getElementById('__ui-modal-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop open';
    backdrop.id = '__ui-modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="__ui-modal-title">
        <button class="modal-close" id="__ui-modal-close" aria-label="Close">✕</button>
        <h2 class="modal-title" id="__ui-modal-title">${esc(title)}</h2>
        <div class="modal-body">${bodyHTML}</div>
        <div class="form-actions">
          <button class="btn-secondary" id="__ui-modal-cancel">Cancel</button>
          <button class="btn-primary"   id="__ui-modal-confirm">${esc(confirmText)}</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);

    const close = (confirmed) => {
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 200);
      if (confirmed) resolve();
      else reject(new Error('cancelled'));
    };

    document.getElementById('__ui-modal-close').onclick   = () => close(false);
    document.getElementById('__ui-modal-cancel').onclick  = () => close(false);
    document.getElementById('__ui-modal-confirm').onclick = async () => {
      const btn = document.getElementById('__ui-modal-confirm');
      if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }

      try {
        if (onConfirm) await onConfirm();
        close(true);
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = confirmText; }
        toast(err.message || 'Something went wrong', 'error');
      }
    };

    // Close on backdrop click (outside modal)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });

    // Close on Escape key
    const onKey = (e) => {
      if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);

    // Focus confirm button
    setTimeout(() => {
      const confirmBtn = document.getElementById('__ui-modal-confirm');
      if (confirmBtn) confirmBtn.focus();
    }, 50);
  });
}

/* ══════════════════════════════════════════════════════════
   SKELETON LOADER
══════════════════════════════════════════════════════════ */

/**
 * Returns HTML for a skeleton loading table.
 * @param {number} [rows=5]
 * @param {number} [cols=4]
 * @returns {string}
 */
function skeleton(rows = 5, cols = 4) {
  const widths = ['40%', '25%', '15%', '20%', '12%', '18%', '30%', '22%'];

  const tdCells = Array.from({ length: cols }, (_, i) => {
    const w = widths[i % widths.length];
    return `<td><span class="skeleton" style="width:${w};height:13px;display:block;border-radius:6px;"></span></td>`;
  }).join('');

  const rowsHTML = Array.from({ length: rows }, () =>
    `<tr class="skeleton-table">${tdCells}</tr>`
  ).join('\n');

  return rowsHTML;
}

/* ══════════════════════════════════════════════════════════
   FORMATTING HELPERS (UI layer — mirrors api.js for convenience)
══════════════════════════════════════════════════════════ */

/**
 * Formats a number as AUD currency.
 * @param {number|string} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  const n = Number(amount);
  if (isNaN(n)) return '—';
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * HTML-escapes a string to prevent XSS.
 * @param {string|number|null|undefined} str
 * @returns {string}
 */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/**
 * Formats a date string as '15 Jan 2025'.
 * @param {string|null} str
 * @returns {string}
 */
function formatDate(str) {
  if (!str) return '—';
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

/**
 * Returns a human-readable relative time string.
 * @param {string|null} str
 * @returns {string}
 */
function timeSince(str) {
  if (!str) return '—';
  try {
    const date = new Date(str);
    if (isNaN(date.getTime())) return '—';

    const now  = new Date();
    const secs = Math.floor((now - date) / 1000);

    if (secs < 45)    return 'just now';
    if (secs < 3600)  return Math.floor(secs / 60) + ' min ago';

    const hours = Math.floor(secs / 3600);
    if (secs < 86400) return hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
    if (secs < 172800) return 'yesterday';

    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}
