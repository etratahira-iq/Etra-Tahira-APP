// هيكل لوحة التحكم: الشريط الجانبي، الشريط العلوي، شاشة الدخول
import { html, raw, esc, icon, $, $$, toast, busy } from '../core/ui.js';
import { state, login, logout } from '../core/store.js';
import { currentRoute, navigate } from '../core/router.js';
import { logoSrc } from '../core/branding.js';

export const MENU = [
  { group: 'العمليات', items: [
    { path: '/', label: 'الرئيسية', icon: 'home' },
    { path: '/bookings', label: 'الحجوزات', icon: 'calendar', badge: 'bookings_pending' },
    { path: '/payments', label: 'العربون والمدفوعات', icon: 'wallet', badge: 'payments_pending' },
    { path: '/availability', label: 'توفر الحسينية', icon: 'clock' },
    { path: '/reports', label: 'التقارير', icon: 'file' },
  ]},
  { group: 'المحتوى', items: [
    { path: '/lectures', label: 'المحاضرات والمجالس', icon: 'mic' },
    { path: '/events', label: 'المناسبات', icon: 'calendar' },
    { path: '/gallery', label: 'معرض الصور', icon: 'image' },
    { path: '/lost-found', label: 'المفقودات', icon: 'bag' },
    { path: '/ads', label: 'الإعلانات', icon: 'info' },
    { path: '/donations', label: 'التبرعات', icon: 'heart' },
  ]},
  { group: 'الإدارة', items: [
    { path: '/users', label: 'المستخدمون', icon: 'user' },
    { path: '/notifications', label: 'الإشعارات', icon: 'bell' },
    { path: '/payment-methods', label: 'طرق الدفع', icon: 'wallet' },
    { path: '/lists', label: 'القوائم (مناسبات/طعام)', icon: 'file' },
    { path: '/settings', label: 'الإعدادات العامة', icon: 'info' },
  ]},
];

let badges = {};
export function setBadges(b) { badges = b || {}; renderSidebar(); }

const isOn = (p) => {
  const cur = currentRoute() || '/';
  return p === '/' ? cur === '/' : cur.startsWith(p);
};

// ---------- الهيكل ----------

export function renderShell() {
  const root = $('#root');
  root.innerHTML = html`
    <div class="admin-layout">
      <aside class="sidebar" id="sidebar"></aside>
      <div class="admin-main">
        <header class="topbar no-print">
          <button class="icon-btn" id="sb-toggle" type="button" aria-label="القائمة"
                  style="display:none">${raw(icon('menu'))}</button>
          <h1 class="topbar__title" id="page-title">لوحة التحكم</h1>
          <div class="topbar__actions" id="page-actions"></div>
        </header>
        <div class="admin-content" id="admin-outlet"></div>
      </div>
    </div>`;

  renderSidebar();

  const toggle = $('#sb-toggle');
  const applyResponsive = () => {
    toggle.style.display = window.innerWidth <= 1000 ? 'grid' : 'none';
  };
  applyResponsive();
  window.addEventListener('resize', applyResponsive);
  toggle.addEventListener('click', openSidebar);
}

function openSidebar() {
  const sb = $('#sidebar');
  sb.classList.add('sidebar--open');
  const back = document.createElement('div');
  back.className = 'sidebar-backdrop';
  back.addEventListener('click', () => { sb.classList.remove('sidebar--open'); back.remove(); });
  document.body.appendChild(back);
  sb.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
    sb.classList.remove('sidebar--open');
    back.remove();
  }, { once: true }));
}

export function renderSidebar() {
  const sb = $('#sidebar');
  if (!sb) return;
  const s = state.settings;
  const u = state.user;

  sb.innerHTML = html`
    <div class="sidebar__brand">
      <span class="sidebar__logo">
        ${raw(`<img src="${esc(logoSrc())}" alt="">`)}
      </span>
      <span>
        <span class="sidebar__title">${s.site_name || 'حسينية العترة الطاهرة'}</span>
        <span class="sidebar__sub">لوحة التحكم</span>
      </span>
    </div>

    <nav class="sidebar__nav">
      ${raw(MENU.map((g) => `
        <div class="sidebar__group">${esc(g.group)}</div>
        ${g.items.map((i) => {
          const count = i.badge ? (badges[i.badge] || 0) : 0;
          return `<a class="sidebar__link ${isOn(i.path) ? 'sidebar__link--on' : ''}" href="#${i.path}">
            ${icon(i.icon)} <span>${esc(i.label)}</span>
            ${count > 0 ? `<span class="sidebar__count">${count}</span>` : ''}
          </a>`;
        }).join('')}
      `).join(''))}
    </nav>

    <div class="sidebar__foot">
      <div style="color:#fff;font-weight:700">${u?.name || ''}</div>
      <div style="font-size:.78rem;opacity:.7">${roleLabel(u?.role)}</div>
      <div class="row mt-1" style="gap:.35rem">
        <a class="btn btn--sm btn--ghost" href="/" style="color:#fff;border-color:rgba(255,255,255,.3)">الموقع</a>
        <button class="btn btn--sm btn--ghost" id="sb-logout" type="button"
                style="color:#fff;border-color:rgba(255,255,255,.3)">خروج</button>
      </div>
    </div>`;

  $('#sb-logout')?.addEventListener('click', async () => {
    await logout();
    location.reload();
  });
}

export const roleLabel = (role) =>
  ({ manager: 'مدير النظام', admin: 'مشرف', user: 'مستخدم' }[role] || '');

/** يضبط عنوان الصفحة وأزرار الشريط العلوي */
export function setPage(title, actionsHtml = '') {
  const t = $('#page-title');
  const a = $('#page-actions');
  if (t) t.textContent = title;
  if (a) a.innerHTML = actionsHtml;
  document.title = title === 'لوحة التحكم' ? 'لوحة التحكم — حسينية العترة الطاهرة' : `${title} — لوحة التحكم`;
  renderSidebar();
}

// ---------- شاشة الدخول ----------

export function renderLogin(message = '') {
  const root = $('#root');
  root.innerHTML = html`
    <div class="login-shell">
      <div class="card auth-card">
        <div class="card__body">
          <div class="center mb-3">
            <div style="color:var(--green);margin-bottom:.4rem">${raw(icon('mosque', 38))}</div>
            <h1 style="font-size:1.35rem;margin-bottom:.2rem">لوحة التحكم</h1>
            <p class="small muted" style="margin:0">حسينية العترة الطاهرة</p>
          </div>
          ${raw(message ? `<div class="alert alert--warn">${esc(message)}</div>` : '')}
          <div id="adm-error"></div>
          <form id="adm-login">
            <div class="field">
              <label class="field__label" for="a-phone">رقم الهاتف</label>
              <input class="input" id="a-phone" type="tel" inputmode="numeric" dir="ltr"
                     style="text-align:right" autocomplete="username" required>
            </div>
            <div class="field">
              <label class="field__label" for="a-pass">كلمة المرور</label>
              <input class="input" id="a-pass" type="password" autocomplete="current-password" required>
            </div>
            <button class="btn btn--block btn--lg" type="submit">دخول</button>
          </form>
          <div class="center mt-2"><a class="small" href="/">العودة إلى الموقع</a></div>
        </div>
      </div>
    </div>`;

  $('#adm-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const err = $('#adm-error');
    err.innerHTML = '';
    busy(btn, true, 'جارٍ الدخول...');
    try {
      const user = await login($('#a-phone').value, $('#a-pass').value);
      if (user.role === 'user') {
        await logout();
        throw new Error('هذا الحساب لا يملك صلاحية الدخول إلى لوحة التحكم');
      }
      location.reload();
    } catch (e2) {
      err.innerHTML = `<div class="alert alert--bad">${esc(e2.message)}</div>`;
      busy(btn, false);
    }
  });
}

export { toast, navigate };
