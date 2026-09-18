// الهيدر، القائمة، الفوتر، شريط التنقل السفلي
import { html, raw, esc, icon, $, modal, closeModal } from './ui.js';
import { state, subscribe, logout } from './store.js';
import { currentRoute, navigate } from './router.js';
import { logoSrc } from './branding.js';

export const NAV_ITEMS = [
  { path: '/', label: 'الرئيسية', icon: 'home' },
  { path: '/lectures', label: 'المحاضرات', icon: 'mic' },
  { path: '/events', label: 'المناسبات', icon: 'calendar' },
  { path: '/lost-found', label: 'المفقودات', icon: 'bag' },
  { path: '/gallery', label: 'الصور', icon: 'image' },
  { path: '/donations', label: 'التبرعات', icon: 'heart' },
  { path: '/contact', label: 'تواصل معنا', icon: 'phone' },
];

const BOTTOM_ITEMS = [
  { path: '/', label: 'الرئيسية', icon: 'home' },
  { path: '/lectures', label: 'المحاضرات', icon: 'mic' },
  { path: '/book', label: 'الحجز', icon: 'calendar' },
  { path: '/donations', label: 'التبرع', icon: 'heart' },
  { path: '/account', label: 'حسابي', icon: 'user' },
];

const isActive = (path) => {
  const cur = currentRoute() || '/';
  return path === '/' ? cur === '/' : cur.startsWith(path);
};

// ---------- الهيدر ----------

export function renderHeader() {
  const el = $('#site-header');
  if (!el) return;
  const s = state.settings;
  const logo = `<img src="${esc(logoSrc())}" alt="${esc(s.site_name || '')}">`;

  el.innerHTML = html`
    <div class="container site-header__inner">
      <a class="brand" href="#/">
        <span class="brand__logo">${raw(logo)}</span>
        <span class="brand__text">
          <span class="brand__name">${s.site_name || 'حسينية العترة الطاهرة'}</span>
          <span class="brand__tag">${s.site_tagline || ''}</span>
        </span>
      </a>

      <nav class="nav" aria-label="القائمة الرئيسية">
        ${raw(NAV_ITEMS.map((i) => `
          <a class="nav__link ${isActive(i.path) ? 'nav__link--on' : ''}" href="#${i.path}">${esc(i.label)}</a>
        `).join(''))}
      </nav>

      <div class="header-actions">
        <a class="btn btn--sm btn--book" href="#/book">حجز الحسينية</a>
        <a class="btn btn--sm btn--gold btn--book" href="#/donations">تبرع الآن</a>

        ${raw(state.user ? `
          <a class="icon-btn" href="#/notifications" aria-label="الإشعارات" title="الإشعارات">
            ${icon('bell')}
            ${state.unread > 0 ? `<span class="icon-btn__dot">${state.unread > 99 ? '99+' : state.unread}</span>` : ''}
          </a>
          <a class="icon-btn" href="#/account" aria-label="حسابي" title="حسابي">${icon('user')}</a>
        ` : `
          <a class="btn btn--sm btn--ghost" href="#/login">دخول</a>
        `)}

        <button class="icon-btn menu-btn" type="button" aria-label="القائمة" id="menu-toggle">${raw(icon('menu'))}</button>
      </div>
    </div>`;

  $('#menu-toggle')?.addEventListener('click', openMobileMenu);
}

// ---------- قائمة الهاتف ----------

function openMobileMenu() {
  const items = [...NAV_ITEMS];
  const overlay = document.createElement('div');
  overlay.className = 'mobile-menu';
  overlay.innerHTML = html`
    <div class="mobile-menu__panel" role="dialog" aria-label="القائمة">
      <div class="row row--between mb-2">
        <strong>القائمة</strong>
        <button class="modal__close" type="button" aria-label="إغلاق">✕</button>
      </div>
      ${raw(items.map((i) => `
        <a class="mobile-menu__link ${isActive(i.path) ? 'mobile-menu__link--on' : ''}" href="#${i.path}">
          ${icon(i.icon)} <span>${esc(i.label)}</span>
        </a>`).join(''))}
      <hr class="divider">
      <a class="mobile-menu__link" href="#/book">${raw(icon('calendar'))} <span>حجز الحسينية</span></a>
      ${raw(state.user ? `
        <a class="mobile-menu__link" href="#/account">${icon('user')} <span>حسابي</span></a>
        <a class="mobile-menu__link" href="#/notifications">${icon('bell')} <span>الإشعارات${state.unread ? ` (${state.unread})` : ''}</span></a>
        ${state.user.role !== 'user' ? `<a class="mobile-menu__link" href="/admin">${icon('file')} <span>لوحة التحكم</span></a>` : ''}
        <button class="mobile-menu__link" type="button" id="menu-logout" style="border:none;background:none;width:100%;text-align:start;font:inherit;cursor:pointer">
          ${icon('logout')} <span>تسجيل الخروج</span></button>
      ` : `
        <a class="mobile-menu__link" href="#/login">${icon('user')} <span>تسجيل الدخول</span></a>
      `)}
    </div>`;

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
    if (e.target.closest('a')) close();
  });
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#menu-logout')?.addEventListener('click', async () => {
    close();
    await logout();
    navigate('/');
  });
  document.body.appendChild(overlay);
}

// ---------- شريط التنقل السفلي ----------

export function renderBottomNav() {
  const el = $('#bottom-nav');
  if (!el) return;
  el.innerHTML = BOTTOM_ITEMS.map((i) => html`
    <a class="bottom-nav__item ${isActive(i.path) ? 'bottom-nav__item--on' : ''}" href="#${i.path}">
      ${raw(icon(i.icon, 22))}
      <span>${i.label}</span>
    </a>`).join('');
}

// ---------- الفوتر ----------

const SOCIAL_META = {
  instagram: { label: 'إنستغرام', icon: 'instagram' },
  facebook: { label: 'فيسبوك', icon: 'facebook' },
  whatsapp: { label: 'واتساب', icon: 'chat' },
  phone: { label: 'اتصل بنا', icon: 'phone' },
  email: { label: 'البريد الإلكتروني', icon: 'mail' },
  telegram: { label: 'تيليغرام', icon: 'chat' },
  youtube: { label: 'يوتيوب', icon: 'image' },
};

/** يبني رابطاً صالحاً حسب المنصة (واتساب/هاتف/بريد لها بروتوكولات خاصة) */
export function socialHref(link) {
  const url = String(link.url || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (link.platform === 'whatsapp') return `https://wa.me/${url.replace(/\D/g, '')}`;
  if (link.platform === 'phone') return `tel:${url.replace(/[^\d+]/g, '')}`;
  if (link.platform === 'email') return `mailto:${url}`;
  return url;
}

export function renderFooter() {
  const el = $('#site-footer');
  if (!el) return;
  const s = state.settings;
  const links = (state.social || []).filter((l) => l.url);

  el.innerHTML = html`
    <div class="container">
      <div class="footer-grid">
        <div>
          <h3>${s.site_name || 'حسينية العترة الطاهرة'}</h3>
          <p style="font-size:.93rem">${s.site_tagline || ''}</p>
          ${raw(s.address ? `<p style="font-size:.92rem;display:flex;gap:.4rem;align-items:flex-start">
            ${icon('pin', 17)} <span>${esc(s.address)}</span></p>` : '')}
        </div>

        <div>
          <h3>روابط سريعة</h3>
          <ul style="list-style:none;padding:0;margin:0;display:grid;gap:.35rem;font-size:.93rem">
            ${raw(NAV_ITEMS.slice(0, 5).map((i) => `<li><a href="#${i.path}">${esc(i.label)}</a></li>`).join(''))}
            <li><a href="#/book">حجز الحسينية</a></li>
          </ul>
        </div>

        <div>
          <h3>تواصل معنا</h3>
          ${raw(links.length ? `<div class="footer-social">${links.map((l) => {
            const meta = SOCIAL_META[l.platform] || { label: l.platform, icon: 'info' };
            const href = socialHref(l);
            return `<a class="social-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">
              ${icon(meta.icon, 17)} <span>${esc(l.label || meta.label)}</span></a>`;
          }).join('')}</div>` : '<p style="font-size:.9rem;opacity:.75">تُضاف روابط التواصل من لوحة التحكم.</p>')}
        </div>
      </div>

      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ${esc(s.site_name || 'حسينية العترة الطاهرة')} — جميع الحقوق محفوظة</span>
        <a href="/admin">لوحة التحكم</a>
      </div>
    </div>`;
}

export function renderChrome() {
  renderHeader();
  renderBottomNav();
  renderFooter();
}

// إعادة الرسم عند تغيّر الحالة
subscribe(() => renderChrome());

export { closeModal, modal };
