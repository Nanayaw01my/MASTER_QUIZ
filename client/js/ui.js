/* ============================================================
   Quiz Master - shared UI helpers (theme, toast, modal, tables)
   ============================================================ */

// ---------------- Theme ----------------
function initTheme() {
  // Dark slate (matching the login) is the default; light is optional via the toggle
  const saved = localStorage.getItem('qm_theme') || 'dark';
  document.documentElement.dataset.theme = saved;
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('qm_theme', next);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerHTML = next === 'light' ? svgIcon('moon') : svgIcon('sun');
}
initTheme();

// ---------------- Escaping ----------------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Safely embed an object as a JS string argument inside an inline HTML event handler. */
const attrJson = (o) => esc(JSON.stringify(JSON.stringify(o)));

// ---------------- Toasts ----------------
function toast(message, type = 'info', ms = 3500) {
  let box = document.getElementById('toast-container');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-container';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------------- Modal ----------------
function openModal(html, { wide = false } = {}) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.body.appendChild(backdrop);
  return backdrop;
}
function closeModal() {
  document.getElementById('modal-backdrop')?.remove();
}
function confirmModal(message) {
  return new Promise((resolve) => {
    const m = openModal(`
      <h2>Confirm</h2>
      <p>${esc(message)}</p>
      <div class="modal-actions">
        <button class="btn secondary" id="cf-no">Cancel</button>
        <button class="btn danger" id="cf-yes">Confirm</button>
      </div>`);
    m.querySelector('#cf-no').onclick = () => { closeModal(); resolve(false); };
    m.querySelector('#cf-yes').onclick = () => { closeModal(); resolve(true); };
  });
}

// ---------------- Tables & pagination ----------------
function renderPagination(el, page, pages, onPage) {
  if (!el) return;
  el.innerHTML = '';
  if (pages <= 1) return;
  const mk = (label, p, opts = {}) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (opts.active) b.className = 'active';
    b.disabled = !!opts.disabled;
    b.onclick = () => onPage(p);
    el.appendChild(b);
  };
  mk('‹', page - 1, { disabled: page <= 1 });
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  for (let p = start; p <= end; p++) mk(p, p, { active: p === page });
  mk('›', page + 1, { disabled: page >= pages });
}

const loaderHtml = '<div class="loader"></div>';
const emptyHtml = (msg = 'Nothing here yet') => `<div class="empty">${esc(msg)}</div>`;

const fmtDate = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '-');
const fmtDur = (sec) => {
  if (!sec && sec !== 0) return '-';
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}m ${s}s`;
};

// ---------------- Dashboard shell ----------------
/**
 * Build the sidebar + topbar shell shared by all dashboards.
 * items: [{id, icon, label}], onNav(id) renders the section.
 */
function buildShell({ title, items, user, onNav }) {
  document.body.innerHTML = `
    <div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><span class="logo">${svgIcon('cap', 20)}</span> Quiz Master</div>
        <nav id="side-nav">
          ${items.map((i) => `<a href="#${i.id}" data-id="${i.id}"><span class="nav-ico">${svgIcon(i.icon, 19)}</span> ${esc(i.label)}</a>`).join('')}
        </nav>
        <div class="sidebar-footer">
          Logged in as <strong>${esc(user.name)}</strong><br>
          <span style="opacity:.7">${esc(user.role.toUpperCase())}</span>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div style="display:flex;align-items:center;gap:12px">
            <button class="menu-toggle" id="menu-toggle">${svgIcon('menu', 22)}</button>
            <h1 id="page-title">${esc(title)}</h1>
          </div>
          <div class="actions">
            <button class="icon-btn" id="notif-btn" title="Notifications">${svgIcon('bell')}<span class="notif-dot" id="notif-count" style="display:none"></span></button>
            <button class="icon-btn" id="theme-btn" title="Toggle theme">${document.documentElement.dataset.theme === 'light' ? svgIcon('moon') : svgIcon('sun')}</button>
            <button class="btn secondary sm" onclick="logout()">Logout</button>
            <span class="avatar" id="topbar-avatar">${user.profileImage ? `<img src="${esc(user.profileImage)}" alt="">` : esc(user.name[0] || '?')}</span>
          </div>
        </header>
        <main class="content" id="content"></main>
      </div>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
    </div>`;

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const openSidebar = () => { sidebar.classList.add('open'); overlay.classList.add('show'); };
  const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };

  document.getElementById('theme-btn').onclick = toggleTheme;
  document.getElementById('menu-toggle').onclick = () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  overlay.onclick = closeSidebar;           // tap outside auto-hides the sidebar
  document.getElementById('notif-btn').onclick = () => { location.hash = 'notifications'; };

  const navigate = (id) => {
    document.querySelectorAll('#side-nav a').forEach((a) => a.classList.toggle('active', a.dataset.id === id));
    const item = items.find((i) => i.id === id);
    document.getElementById('page-title').textContent = item ? item.label : title;
    closeSidebar(); // auto-hide after picking a menu item
    onNav(id);
  };

  document.querySelectorAll('#side-nav a').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); location.hash = a.dataset.id; });
  });
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || items[0].id));
  navigate(location.hash.slice(1) || items[0].id);
  refreshNotifCount();
}

async function refreshNotifCount() {
  try {
    const { data } = await API.get('/notifications?limit=1');
    const el = document.getElementById('notif-count');
    if (el) {
      el.style.display = data.unread ? 'flex' : 'none';
      el.textContent = data.unread > 99 ? '99+' : data.unread;
    }
  } catch { /* ignore */ }
}

// Shared notifications section renderer
async function renderNotifications(container) {
  container.innerHTML = loaderHtml;
  try {
    const { data } = await API.get('/notifications?limit=30');
    if (!data.notifications.length) { container.innerHTML = emptyHtml('No notifications'); return; }
    container.innerHTML = `
      <div class="card">
        <div class="toolbar"><h3 style="margin:0">Notifications</h3><span class="spacer"></span>
          <button class="btn secondary sm" id="mark-all">Mark all read</button></div>
        ${data.notifications.map((n) => `
          <div style="padding:12px 4px;border-bottom:1px solid var(--border);${n.read ? 'opacity:.65' : ''}">
            <strong>${esc(n.title)}</strong>
            <span class="badge ${n.type === 'cheating-alert' ? 'red' : n.type === 'results' ? 'green' : 'blue'}">${esc(n.type)}</span>
            <div style="font-size:.88rem;margin-top:4px">${esc(n.message)}</div>
            <div class="hint">${fmtDate(n.createdAt)}</div>
          </div>`).join('')}
      </div>`;
    container.querySelector('#mark-all').onclick = async () => {
      await API.patch('/notifications/read-all');
      refreshNotifCount();
      renderNotifications(container);
    };
  } catch (err) { container.innerHTML = emptyHtml(apiError(err)); }
}
