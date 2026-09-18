// أدوات الواجهة: HTML آمن، إشعارات، نوافذ، أيقونات، حالات فارغة
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** تهريب النصوص لمنع XSS */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** قالب وسمي يُهرّب كل القيم تلقائياً — استخدم ${raw(x)} لتمرير HTML جاهز */
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => {
    if (i === 0) return s;
    const v = values[i - 1];
    let chunk;
    if (v === null || v === undefined || v === false) chunk = '';
    else if (v instanceof Raw) chunk = v.value;
    else if (Array.isArray(v)) chunk = v.map((x) => (x instanceof Raw ? x.value : esc(x))).join('');
    else chunk = esc(v);
    return out + chunk + s;
  }, '');
}

class Raw { constructor(value) { this.value = value; } }
export const raw = (v) => new Raw(v ?? '');

// ---------- الإشعارات المنبثقة ----------

export function toast(message, tone = 'ok', ms = 3200) {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

// ---------- النوافذ ----------

let openModal = null;

export function modal({ title, body, footer = '', wide = false, onOpen, onClose }) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = html`
    <div class="modal ${wide ? 'modal--wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal__head">
        <h3 class="modal__title">${title}</h3>
        <button class="modal__close" type="button" aria-label="إغلاق">✕</button>
      </div>
      <div class="modal__body">${raw(body)}</div>
      ${raw(footer ? `<div class="modal__foot">${footer}</div>` : '')}
    </div>`;

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  backdrop.querySelector('.modal__close').addEventListener('click', closeModal);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  openModal = { el: backdrop, onClose };
  onOpen?.(backdrop);
  const focusable = backdrop.querySelector('input, select, textarea, button:not(.modal__close)');
  focusable?.focus();
  return backdrop;
}

export function closeModal() {
  if (!openModal) return;
  const { el, onClose } = openModal;
  openModal = null;
  el.remove();
  document.body.style.overflow = '';
  onClose?.();
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/** نافذة تأكيد بسيطة تعيد Promise<boolean> */
export function confirmDialog(message, { title = 'تأكيد', okText = 'تأكيد', tone = 'danger' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    modal({
      title,
      body: html`<p style="margin:0">${message}</p>`,
      footer: `<button class="btn btn--${tone}" data-ok>${esc(okText)}</button>
               <button class="btn btn--quiet" data-cancel>إلغاء</button>`,
      onOpen: (el) => {
        el.querySelector('[data-ok]').addEventListener('click', () => { done(true); closeModal(); });
        el.querySelector('[data-cancel]').addEventListener('click', () => { done(false); closeModal(); });
      },
      onClose: () => done(false),
    });
  });
}

// ---------- حالات العرض ----------

export const emptyState = (title, text = '', icon = '◇') => html`
  <div class="empty">
    <div class="empty__icon">${icon}</div>
    <div class="empty__title">${title}</div>
    ${text ? raw(`<div class="small">${esc(text)}</div>`) : ''}
  </div>`;

export const errorState = (message) => html`
  <div class="empty">
    <div class="empty__icon">⚠</div>
    <div class="empty__title">تعذّر تحميل البيانات</div>
    <div class="small">${message}</div>
  </div>`;

export const skeletonCards = (n = 3) =>
  Array.from({ length: n }, () => '<div class="skeleton skeleton--card"></div>').join('');

export const skeletonLines = (n = 4) =>
  Array.from({ length: n }, (_, i) =>
    `<div class="skeleton skeleton--line" style="width:${100 - i * 12}%"></div>`).join('');

/** يضبط حالة زر أثناء عملية غير متزامنة */
export function busy(btn, on, labelWhenBusy = 'جارٍ الحفظ...') {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${esc(labelWhenBusy)}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

/** نسخ إلى الحافظة مع رسالة */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('تم النسخ بنجاح', 'ok', 1800);
    return true;
  } catch {
    toast('تعذّر النسخ، يرجى النسخ يدوياً', 'bad');
    return false;
  }
}

// ---------- الأيقونات (SVG مضمّنة) ----------

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  mic: '<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  bag: '<path d="M6 7h12l1 13H5z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/>',
  bell: '<path d="M18 16V11a6 6 0 1 0-12 0v5l-2 3h16z"/><path d="M10 21h4"/>',
  heart: '<path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7-0.5C19 15.5 12 20 12 20z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/>',
  facebook: '<path d="M14 8h3V5h-3a4 4 0 0 0-4 4v2H8v3h2v7h3v-7h3l1-3h-4V9a1 1 0 0 1 1-1z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chevron: '<path d="m15 6-6 6 6 6"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m16 15 3-3-3-3M19 12H9"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14h2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  mosque: '<path d="M12 3c2.5 2.2 2.5 4.8 0 7-2.5-2.2-2.5-4.8 0-7z"/><path d="M5 21v-7a7 7 0 0 1 14 0v7"/><path d="M3 21h18M9 21v-4a3 3 0 0 1 6 0v4"/>',
};

export function icon(name, size = 20) {
  const path = ICONS[name] || ICONS.info;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** صورة مع بديل أنيق عند غيابها */
export function mediaOrPlaceholder(src, alt = '') {
  if (src) return html`<img src="${src}" alt="${alt}" loading="lazy" decoding="async">`;
  return `<div class="media-placeholder">${icon('mosque', 46)}</div>`;
}
