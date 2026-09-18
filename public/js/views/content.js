// صفحات المحتوى: المحاضرات، المناسبات، المعرض، المفقودات، التبرعات، التواصل
import { api } from '../core/api.js';
import {
  html, raw, esc, icon, $, $$, errorState, emptyState, skeletonCards,
  mediaOrPlaceholder, toast,
} from '../core/ui.js';
import * as f from '../core/format.js';
import { lectureCard, eventCard, lostCard, adCard, paymentMethodCard, bindCopyButtons, sectionHead, lectureCredits, donationBanner } from './components.js';
import { state } from '../core/store.js';
import { socialHref } from '../core/chrome.js';

const pageShell = (title, sub, body) => html`
  <div class="container section">
    ${raw(sectionHead(title, sub))}
    ${raw(body)}
  </div>`;

// ================= المحاضرات =================

export async function lecturesView({ query }) {
  const app = $('#app');
  app.innerHTML = pageShell('المحاضرات والمجالس', '', `<div class="grid grid--3">${skeletonCards(6)}</div>`);

  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.occasion) params.set('occasion', query.occasion);
  if (query.speaker) params.set('speaker', query.speaker);
  if (query.page) params.set('page', query.page);

  let data;
  try {
    data = await api.get(`/lectures?${params}`);
  } catch (err) {
    app.innerHTML = pageShell('المحاضرات والمجالس', '', errorState(err.message));
    return null;
  }

  const filters = html`
    <div class="filters">
      <input class="input" id="lec-q" type="search" placeholder="ابحث في المحاضرات..." value="${query.q || ''}">
      <select class="select" id="lec-occasion">
        <option value="">كل المناسبات</option>
        ${raw(data.occasions.map((o) =>
          `<option value="${esc(o)}" ${o === query.occasion ? 'selected' : ''}>${esc(o)}</option>`).join(''))}
      </select>
      <select class="select" id="lec-speaker">
        <option value="">كل المحاضرين</option>
        ${raw(data.speakers.map((o) =>
          `<option value="${esc(o)}" ${o === query.speaker ? 'selected' : ''}>${esc(o)}</option>`).join(''))}
      </select>
      <button class="btn btn--ghost" id="lec-reset" type="button">إعادة تعيين</button>
    </div>`;

  const body = html`
    ${raw(filters)}
    ${raw(data.items.length
      ? `<div class="grid grid--3">${data.items.map(lectureCard).join('')}</div>`
      : emptyState('لا توجد محاضرات مطابقة', 'جرّب تغيير كلمة البحث أو الفلاتر.', '🔍'))}
    ${raw(pagination(data, '/lectures', query))}`;

  app.innerHTML = pageShell('المحاضرات والمجالس', `${data.total} محاضرة ومجلس`, body);

  const apply = () => {
    const p = new URLSearchParams();
    const q = $('#lec-q').value.trim();
    const occ = $('#lec-occasion').value;
    const sp = $('#lec-speaker').value;
    if (q) p.set('q', q);
    if (occ) p.set('occasion', occ);
    if (sp) p.set('speaker', sp);
    location.hash = `#/lectures${p.toString() ? '?' + p : ''}`;
  };
  $('#lec-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  $('#lec-occasion').addEventListener('change', apply);
  $('#lec-speaker').addEventListener('change', apply);
  $('#lec-reset').addEventListener('click', () => { location.hash = '#/lectures'; });
  return null;
}

function pagination(data, base, query) {
  if (!data.pages || data.pages <= 1) return '';
  const link = (p, label, on = false) => {
    const q = new URLSearchParams({ ...query, page: p });
    return `<a class="btn btn--sm ${on ? '' : 'btn--quiet'}" href="#${base}?${q}">${esc(label)}</a>`;
  };
  const parts = [];
  if (data.page > 1) parts.push(link(data.page - 1, 'السابق'));
  for (let p = 1; p <= data.pages; p++) parts.push(link(p, String(p), p === data.page));
  if (data.page < data.pages) parts.push(link(data.page + 1, 'التالي'));
  return `<div class="row center mt-3" style="justify-content:center">${parts.join('')}</div>`;
}

// ---------- تفاصيل محاضرة ----------

export async function lectureDetailView({ params }) {
  const app = $('#app');
  app.innerHTML = `<div class="container section">${skeletonCards(1)}</div>`;

  let data;
  try {
    data = await api.get(`/lectures/${params.id}`);
  } catch (err) {
    app.innerHTML = `<div class="container section">${errorState(err.message)}</div>`;
    return null;
  }

  const l = data.lecture;
  const s = data.settings;

  app.innerHTML = html`
    <div class="container section">
      <a class="btn btn--sm btn--quiet mb-2" href="#/lectures">${raw(icon('chevron', 16))} العودة للمحاضرات</a>

      ${raw(l.image_path ? `<div class="detail-hero">${mediaOrPlaceholder(l.image_path, l.title)}</div>` : '')}

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr));align-items:start">
        <div>
          <h1 style="margin-bottom:.5rem">${l.title}</h1>
          <div style="font-size:1.06rem;margin-bottom:1rem">
            ${raw(lectureCredits(l, { compact: false }))}
          </div>

          <div class="row mb-2" style="gap:.4rem">
            ${raw(l.occasion ? `<span class="badge badge--gold">${esc(l.occasion)}</span>` : '')}
            <span class="badge badge--info">${l.date_hijri}</span>
            <span class="badge">${l.weekday} · ${raw(f.dateShort(l.date_iso))}</span>
            ${raw(l.lecture_time ? `<span class="badge">${esc(f.time12(l.lecture_time))}</span>` : '')}
          </div>

          ${raw(l.description
            ? `<div class="card"><div class="card__body"><div class="prose">${esc(l.description)}</div></div></div>`
            : '')}
        </div>

        <div class="grid" style="gap:1rem">
          <div class="card">
            <div class="card__head">تفاصيل المجلس</div>
            <div class="card__body">
              <div class="dl">
                ${raw(l.speaker ? `<div class="dl__row"><span class="dl__key">تقديم المحاضرة</span>
                  <span class="dl__val">${esc(l.speaker)}</span></div>` : '')}
                ${raw(l.majlis_name ? `<div class="dl__row"><span class="dl__key">يليها</span>
                  <span class="dl__val">${esc(l.majlis_name)}</span></div>` : '')}
                ${raw(l.reciter ? `<div class="dl__row"><span class="dl__key">الملا</span>
                  <span class="dl__val">${esc(l.reciter)}</span></div>` : '')}
                <div class="dl__row"><span class="dl__key">التاريخ الهجري</span>
                  <span class="dl__val">${l.date_hijri}</span></div>
                <div class="dl__row"><span class="dl__key">التاريخ الميلادي</span>
                  <span class="dl__val num">${raw(f.dateShort(l.date_iso))}</span></div>
                <div class="dl__row"><span class="dl__key">اليوم</span>
                  <span class="dl__val">${l.weekday}</span></div>
                ${raw(l.lecture_time ? `<div class="dl__row"><span class="dl__key">الوقت</span>
                  <span class="dl__val">${esc(f.time12(l.lecture_time))}</span></div>` : '')}
                ${raw(l.occasion ? `<div class="dl__row"><span class="dl__key">المناسبة</span>
                  <span class="dl__val">${esc(l.occasion)}</span></div>` : '')}
              </div>
            </div>
          </div>

          ${raw(l.show_venue ? `
            <div class="card">
              <div class="card__head">موقع الحسينية</div>
              <div class="card__body">
                <div class="row" style="gap:.5rem;align-items:flex-start">
                  <span style="color:var(--green)">${icon('pin', 20)}</span>
                  <div>
                    <div class="bold">${esc(s.site_name)}</div>
                    <div class="small muted">${esc(s.address || 'يُحدَّد العنوان من لوحة التحكم')}</div>
                  </div>
                </div>
                ${s.maps_url ? `<a class="btn btn--ghost btn--block mt-2" href="${esc(s.maps_url)}"
                   target="_blank" rel="noopener noreferrer">فتح الموقع على الخريطة</a>` : ''}
              </div>
            </div>` : '')}
        </div>
      </div>

      ${raw(data.related?.length ? `
        <div class="mt-3">
          ${sectionHead('محاضرات مرتبطة')}
          <div class="grid grid--3">${data.related.map(lectureCard).join('')}</div>
        </div>` : '')}
    </div>`;
  return null;
}

// ================= المناسبات =================

export async function eventsView({ query }) {
  const app = $('#app');
  app.innerHTML = pageShell('المناسبات', '', `<div class="grid grid--3">${skeletonCards(6)}</div>`);

  let data;
  try {
    data = await api.get(`/events?q=${encodeURIComponent(query.q || '')}`);
  } catch (err) {
    app.innerHTML = pageShell('المناسبات', '', errorState(err.message));
    return null;
  }

  app.innerHTML = pageShell('المناسبات', 'المجالس والموالد والفواتح والمناسبات المقامة في الحسينية', html`
    <div class="filters">
      <input class="input" id="ev-q" type="search" placeholder="ابحث في المناسبات..." value="${query.q || ''}">
      <button class="btn btn--ghost" id="ev-reset" type="button">إعادة تعيين</button>
    </div>
    ${raw(data.items.length
      ? `<div class="grid grid--3">${data.items.map(eventCard).join('')}</div>`
      : emptyState('لا توجد مناسبات مسجلة حالياً', 'تُضاف المناسبات من لوحة التحكم.', '🗓'))}`);

  $('#ev-q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') location.hash = `#/events?q=${encodeURIComponent(e.target.value.trim())}`;
  });
  $('#ev-reset').addEventListener('click', () => { location.hash = '#/events'; });
  return null;
}

export async function eventDetailView({ params }) {
  const app = $('#app');
  app.innerHTML = `<div class="container section">${skeletonCards(1)}</div>`;

  let data;
  try {
    data = await api.get(`/events/${params.id}`);
  } catch (err) {
    app.innerHTML = `<div class="container section">${errorState(err.message)}</div>`;
    return null;
  }
  const e = data.event;
  const s = data.settings;

  app.innerHTML = html`
    <div class="container section">
      <a class="btn btn--sm btn--quiet mb-2" href="#/events">${raw(icon('chevron', 16))} العودة للمناسبات</a>
      ${raw(e.image_path ? `<div class="detail-hero">${mediaOrPlaceholder(e.image_path, e.title)}</div>` : '')}
      <span class="badge badge--gold mb-1">${e.kind}</span>
      <h1>${e.title}</h1>
      <div class="row mb-2" style="gap:.4rem">
        <span class="badge badge--info">${e.date_hijri}</span>
        <span class="badge">${e.weekday} · ${raw(f.dateShort(e.date_iso))}</span>
        ${raw(e.event_time ? `<span class="badge">${esc(f.time12(e.event_time))}</span>` : '')}
        ${raw(e.speaker ? `<span class="badge">${esc(e.speaker)}</span>` : '')}
      </div>
      ${raw(e.description ? `<div class="card"><div class="card__body">
        <div class="prose">${esc(e.description)}</div></div></div>` : '')}
      ${raw(e.show_venue ? `<div class="card mt-2"><div class="card__body row" style="gap:.5rem">
        <span style="color:var(--green)">${icon('pin', 20)}</span>
        <div><div class="bold">${esc(s.site_name)}</div>
        <div class="small muted">${esc(s.address || '')}</div></div></div></div>` : '')}
    </div>`;
  return null;
}

// ================= معرض الصور =================

const CATEGORIES = [
  { key: 'all', label: 'الكل' },
  { key: 'exterior', label: 'من الخارج' },
  { key: 'interior', label: 'من الداخل' },
  { key: 'occasions', label: 'مناسبات سابقة' },
];

export async function galleryView({ query }) {
  const app = $('#app');
  const cat = query.category || 'all';
  app.innerHTML = pageShell('صور الحسينية', '', `<div class="gallery-grid">${skeletonCards(8)}</div>`);

  let data;
  try {
    data = await api.get(`/gallery?category=${encodeURIComponent(cat)}`);
  } catch (err) {
    app.innerHTML = pageShell('صور الحسينية', '', errorState(err.message));
    return null;
  }

  app.innerHTML = pageShell('صور الحسينية', 'صور من داخل الحسينية وخارجها ومن المناسبات السابقة', html`
    <div class="chip-row mb-2">
      ${raw(CATEGORIES.map((c) =>
        `<a class="chip ${c.key === cat ? 'chip--on' : ''}" href="#/gallery?category=${c.key}">${esc(c.label)}</a>`).join(''))}
    </div>
    ${raw(data.items.length
      ? `<div class="gallery-grid">${data.items.map((g, i) => `
          <button class="gallery-item" type="button" data-idx="${i}">
            ${mediaOrPlaceholder(g.image_path, g.title)}
            ${g.title ? `<span class="gallery-item__cap">${esc(g.title)}</span>` : ''}
          </button>`).join('')}</div>`
      : emptyState('لا توجد صور في هذا القسم', 'تُرفع الصور من لوحة التحكم.', '🖼'))}`);

  $$('[data-idx]').forEach((btn) => {
    btn.addEventListener('click', () => openLightbox(data.items, Number(btn.dataset.idx)));
  });
  return null;
}

function openLightbox(items, index) {
  let i = index;
  const box = document.createElement('div');
  box.className = 'lightbox';
  const draw = () => {
    const it = items[i];
    box.innerHTML = html`
      <button class="lightbox__close" type="button" aria-label="إغلاق">✕</button>
      <div class="center">
        <img src="${it.image_path}" alt="${it.title || ''}">
        <div class="lightbox__cap">
          <strong>${it.title || ''}</strong>
          ${raw(it.description ? `<div class="small" style="opacity:.8">${esc(it.description)}</div>` : '')}
          <div class="small" style="opacity:.6;margin-top:.4rem">${i + 1} / ${items.length}</div>
        </div>
      </div>`;
    box.querySelector('.lightbox__close').addEventListener('click', close);
  };
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') { i = (i + 1) % items.length; draw(); }
    if (e.key === 'ArrowRight') { i = (i - 1 + items.length) % items.length; draw(); }
  };
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', onKey);
  draw();
  document.body.appendChild(box);
}

// ================= المفقودات =================

export async function lostFoundView({ query }) {
  const app = $('#app');
  app.innerHTML = pageShell('المفقودات', '', `<div class="grid grid--3">${skeletonCards(6)}</div>`);

  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);

  let data;
  try {
    data = await api.get(`/lost-found?${params}`);
  } catch (err) {
    app.innerHTML = pageShell('المفقودات', '', errorState(err.message));
    return null;
  }

  app.innerHTML = pageShell(
    'المفقودات والموجودات',
    'الأغراض التي تم العثور عليها داخل الحسينية. لمراجعة أي غرض يرجى التواصل مع إدارة الحسينية.',
    html`
      <div class="filters">
        <input class="input" id="lf-q" type="search" placeholder="ابحث عن غرض..." value="${query.q || ''}">
        <select class="select" id="lf-status">
          <option value="">كل الحالات</option>
          <option value="available" ${raw(query.status === 'available' ? 'selected' : '')}>متوفر</option>
          <option value="delivered" ${raw(query.status === 'delivered' ? 'selected' : '')}>تم تسليمه</option>
        </select>
        <button class="btn btn--ghost" id="lf-reset" type="button">إعادة تعيين</button>
      </div>
      ${raw(data.items.length
        ? `<div class="grid grid--3">${data.items.map(lostCard).join('')}</div>`
        : emptyState('لا توجد مفقودات مسجلة حالياً', '', '🎒'))}`
  );

  const apply = () => {
    const p = new URLSearchParams();
    const q = $('#lf-q').value.trim();
    const st = $('#lf-status').value;
    if (q) p.set('q', q);
    if (st) p.set('status', st);
    location.hash = `#/lost-found${p.toString() ? '?' + p : ''}`;
  };
  $('#lf-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  $('#lf-status').addEventListener('change', apply);
  $('#lf-reset').addEventListener('click', () => { location.hash = '#/lost-found'; });
  return null;
}

// ================= التبرعات =================

export async function donationsView() {
  const app = $('#app');
  app.innerHTML = pageShell('التبرعات', '', skeletonCards(2));

  let data;
  try {
    data = await api.get('/donations');
  } catch (err) {
    app.innerHTML = pageShell('التبرعات', '', errorState(err.message));
    return null;
  }
  const s = data.settings;

  app.innerHTML = html`
    <div class="container section">
      <div class="mb-3">${raw(donationBanner(s, { eager: true }))}</div>

      ${raw(data.ads?.length ? `<div class="grid grid--2 mb-3">${data.ads.map(adCard).join('')}</div>` : '')}

      ${raw(data.campaigns?.length ? `
        <div class="mb-3">
          ${sectionHead('حملات التبرع')}
          <div class="grid grid--2">
            ${data.campaigns.map((c) => `
              <div class="card">
                ${c.image_path ? `<div class="card__media" style="aspect-ratio:16/9">
                  ${mediaOrPlaceholder(c.image_path, c.title)}</div>` : ''}
                <div class="card__body">
                  <h3 style="font-size:1.08rem">${esc(c.title)}</h3>
                  <p class="small muted" style="margin:0">${esc(c.description)}</p>
                </div>
              </div>`).join('')}
          </div>
        </div>` : '')}

      ${raw(sectionHead('طرق التبرع', 'انسخ الرقم المطلوب ثم أرسل المبلغ عبر الخدمة المناسبة.'))}
      ${raw(data.methods.length
        ? `<div class="grid grid--2">${data.methods.map(paymentMethodCard).join('')}</div>`
        : emptyState('لم تُضَف طرق تبرع بعد', 'تُضاف أرقام التبرع من لوحة التحكم.', '💳'))}

      <div class="alert alert--info mt-3">
        تُصرف التبرعات في خدمة المجالس الحسينية وصيانة الحسينية. جزاكم الله خيراً.
      </div>
    </div>`;

  bindCopyButtons(app);
  return null;
}

// ================= تواصل معنا =================

const SOCIAL_META = {
  instagram: { label: 'إنستغرام', icon: 'instagram' },
  facebook: { label: 'فيسبوك', icon: 'facebook' },
  whatsapp: { label: 'واتساب', icon: 'chat' },
  phone: { label: 'الاتصال', icon: 'phone' },
  email: { label: 'البريد الإلكتروني', icon: 'mail' },
  telegram: { label: 'تيليغرام', icon: 'chat' },
  youtube: { label: 'يوتيوب', icon: 'image' },
};

export async function contactView() {
  const s = state.settings;
  const links = (state.social || []).filter((l) => l.url);

  return pageShell('تواصل معنا', 'يسعدنا تواصلكم معنا عبر الوسائل التالية', html`
    <div class="grid grid--2">
      ${raw(links.length ? links.map((l) => {
        const meta = SOCIAL_META[l.platform] || { label: l.platform, icon: 'info' };
        return `<a class="card card--link" href="${esc(socialHref(l))}" target="_blank" rel="noopener noreferrer"
                  style="color:inherit">
          <div class="card__body row" style="gap:.8rem">
            <span class="pay-method__icon">${icon(meta.icon, 20)}</span>
            <div>
              <div class="bold">${esc(l.label || meta.label)}</div>
              <div class="small muted" style="direction:ltr;text-align:right">${esc(l.url)}</div>
            </div>
          </div>
        </a>`;
      }).join('') : emptyState('لم تُضَف وسائل تواصل بعد', 'تُضاف روابط التواصل من لوحة التحكم.', '📞'))}
    </div>

    <div class="card mt-3">
      <div class="card__head">موقع الحسينية</div>
      <div class="card__body">
        <div class="row" style="gap:.6rem;align-items:flex-start">
          <span style="color:var(--green)">${raw(icon('pin', 20))}</span>
          <div>
            <div class="bold">${s.site_name || ''}</div>
            <div class="muted">${s.address || 'يُحدَّد العنوان من لوحة التحكم'}</div>
          </div>
        </div>
        ${raw(s.maps_url ? `<a class="btn mt-2" href="${esc(s.maps_url)}" target="_blank"
           rel="noopener noreferrer">فتح الموقع على الخريطة</a>` : '')}
      </div>
    </div>`);
}

export { toast };
