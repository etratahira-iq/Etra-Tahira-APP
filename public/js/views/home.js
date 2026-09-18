// الصفحة الرئيسية
import { api } from '../core/api.js';
import { html, raw, esc, icon, $, errorState, emptyState, skeletonCards, mediaOrPlaceholder } from '../core/ui.js';
import * as f from '../core/format.js';
import { lectureCard, eventCard, calendarItem, adCard, sectionHead, lectureCredits, donationBanner } from './components.js';
import { patch } from '../core/store.js';

export async function homeView() {
  const app = $('#app');
  app.innerHTML = `<div class="container section">${skeletonCards(3)}</div>`;

  let data;
  try {
    data = await api.get('/home');
  } catch (err) {
    return `<div class="container section">${errorState(err.message)}</div>`;
  }

  patch({ settings: data.settings, social: data.social });
  const s = data.settings;

  const heroStyle = s.hero_image ? `style="background-image:url('${esc(s.hero_image)}')"` : '';

  const out = html`
    <!-- القسم الرئيسي -->
    <section class="hero" ${raw(heroStyle)}>
      <div class="container hero__inner">
        <span class="hero__eyebrow">${raw(icon('mosque', 16))} ${s.site_tagline || 'منبر أهل البيت عليهم السلام'}</span>
        <h1 class="hero__title">${s.hero_title || s.site_name}</h1>
        <p class="hero__text">${s.hero_subtitle || ''}</p>
        <div class="hero__actions">
          <a class="btn btn--lg btn--gold" href="#/book">حجز الحسينية</a>
          <a class="btn btn--lg btn--ghost" href="#/donations">تبرع الآن</a>
        </div>
      </div>
    </section>

    <!-- المحاضرة القادمة -->
    ${raw(data.upcoming_lecture ? `
      <section class="section">
        <div class="container">${nextLectureBlock(data.upcoming_lecture, s)}</div>
      </section>` : '')}

    <!-- الإعلانات -->
    ${raw(data.ads?.length ? `
      <section class="section" style="padding-top:0">
        <div class="container grid grid--2">${data.ads.map(adCard).join('')}</div>
      </section>` : '')}

    <!-- مناسبات ومحاضرات الشهر -->
    <section class="section section--tint" id="month">
      <div class="container">
        ${raw(sectionHead('مناسبات ومحاضرات الشهر', 'يعرض التطبيق مناسبات الشهر الحالي، ويمكنك الانتقال إلى الشهر القادم.'))}
        <div id="calendar-block">${skeletonCards(1)}</div>
      </div>
    </section>

    <!-- المحاضرات والمجالس -->
    <section class="section">
      <div class="container">
        ${raw(sectionHead('المحاضرات والمجالس', 'أحدث المجالس والمحاضرات في الحسينية',
          '<a class="btn btn--sm btn--ghost" href="#/lectures">عرض الكل</a>'))}
        ${raw(data.lectures?.length
          ? `<div class="grid grid--3">${data.lectures.map(lectureCard).join('')}</div>`
          : emptyState('لا توجد محاضرات قادمة حالياً', 'ستظهر المحاضرات هنا فور إضافتها من الإدارة.', '🕌'))}
      </div>
    </section>

    <!-- المناسبات القادمة -->
    ${raw(data.events?.length ? `
      <section class="section section--tint">
        <div class="container">
          ${sectionHead('المناسبات القادمة', '', '<a class="btn btn--sm btn--ghost" href="#/events">عرض الكل</a>')}
          <div class="grid grid--3">${data.events.map(eventCard).join('')}</div>
        </div>
      </section>` : '')}

    <!-- معلومات الحسينية -->
    <section class="section">
      <div class="container">
        ${raw(sectionHead(s.about_title || 'نبذة عن الحسينية'))}
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start">
          <div class="card"><div class="card__body">
            <p style="line-height:1.95">${s.about_text || ''}</p>
            ${raw(s.address ? `
              <div class="row mt-2" style="gap:.5rem;align-items:flex-start;color:var(--ink-muted)">
                ${icon('pin', 19)} <span>${esc(s.address)}</span>
              </div>` : '')}
          </div></div>

          ${raw(data.gallery?.length ? `
            <div>
              <div class="gallery-grid">
                ${data.gallery.slice(0, 6).map((g) => `
                  <a class="gallery-item" href="#/gallery">
                    ${mediaOrPlaceholder(g.image_path, g.title)}
                    ${g.title ? `<span class="gallery-item__cap">${esc(g.title)}</span>` : ''}
                  </a>`).join('')}
              </div>
              <a class="btn btn--ghost btn--block mt-2" href="#/gallery">عرض كل الصور</a>
            </div>` : '')}
        </div>
      </div>
    </section>

    <!-- موقع الحسينية -->
    <section class="section section--tint" id="location">
      <div class="container">
        ${raw(sectionHead('موقع الحسينية'))}
        ${raw(locationBlock(s))}
      </div>
    </section>

    <!-- التبرعات -->
    <section class="section">
      <div class="container">
        ${raw(donationBanner(s, { linked: true, usePost: true }))}
      </div>
    </section>

    <!-- المفقودات -->
    <section class="section section--tint">
      <div class="container">
        <div class="card"><div class="card__body row row--between" style="gap:1rem">
          <div>
            <h3 style="margin-bottom:.2rem">المفقودات والموجودات</h3>
            <p class="small muted" style="margin:0">
              ${data.lost_found_count > 0
                ? `يوجد حالياً ${data.lost_found_count} غرضاً بانتظار أصحابه.`
                : 'لا توجد مفقودات مسجلة حالياً.'}
            </p>
          </div>
          <a class="btn btn--ghost" href="#/lost-found">عرض المفقودات</a>
        </div></div>
      </div>
    </section>`;

  app.innerHTML = out;
  loadCalendar(0);
  return null;
}

// ---------- المحاضرة القادمة ----------

function nextLectureBlock(l, s) {
  const media = l.image_path
    ? `<div class="next-lecture__media" style="background-image:url('${esc(l.image_path)}')"></div>`
    : '';
  return html`
    <div class="next-lecture ${raw(media ? 'next-lecture--media' : '')}">
      ${raw(media)}
      <div class="next-lecture__body">
        <div class="next-lecture__label">المحاضرة القادمة</div>
        <h2 class="next-lecture__title">${l.title}</h2>
        ${raw(lectureCredits(l, { compact: false }))}

        <div class="nl-meta">
          <div class="nl-meta__item">${raw(icon('calendar', 17))}<span>${l.date_hijri}</span></div>
          <div class="nl-meta__item">${raw(icon('calendar', 17))}<span>${l.weekday} · ${raw(f.dateShort(l.date_iso))}</span></div>
          ${raw(l.lecture_time ? `<div class="nl-meta__item">${icon('clock', 17)}<span>${esc(f.time12(l.lecture_time))}</span></div>` : '')}
          ${raw(l.occasion ? `<div class="nl-meta__item">${icon('info', 17)}<span>${esc(l.occasion)}</span></div>` : '')}
          ${raw(l.show_venue && s.address ? `<div class="nl-meta__item">${icon('pin', 17)}<span>${esc(s.site_name)}</span></div>` : '')}
        </div>

        ${raw(l.description ? `<p style="color:rgba(255,255,255,.85);margin-bottom:1.1rem" class="clamp-3">${esc(l.description)}</p>` : '')}
        <a class="btn btn--gold" href="#/lectures/${l.id}">عرض التفاصيل</a>
      </div>
    </div>`;
}

// ---------- الموقع ----------

function locationBlock(s) {
  const hasMap = !!s.maps_embed_url;
  const hasLink = !!s.maps_url;
  return html`
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:stretch">
      <div class="card"><div class="card__body">
        <div class="row" style="gap:.6rem;align-items:flex-start">
          <span style="color:var(--green)">${raw(icon('pin', 22))}</span>
          <div>
            <h3 style="font-size:1.1rem;margin-bottom:.25rem">${s.site_name}</h3>
            <p class="muted" style="margin-bottom:1rem">${s.address || 'يُحدَّد العنوان من لوحة التحكم'}</p>
            ${raw(hasLink
              ? `<a class="btn" href="${esc(s.maps_url)}" target="_blank" rel="noopener noreferrer">فتح الموقع</a>`
              : '<div class="alert alert--info" style="margin:0">لم يتم تحديد رابط الموقع بعد من لوحة التحكم.</div>')}
          </div>
        </div>
      </div></div>

      <div class="map-box">
        ${raw(hasMap
          ? `<iframe src="${esc(s.maps_embed_url)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
               title="خريطة موقع الحسينية"></iframe>`
          : `<div class="center muted" style="padding:2rem">
               <div style="opacity:.4;margin-bottom:.5rem">${icon('pin', 40)}</div>
               <div>تُضاف الخريطة من لوحة التحكم</div>
             </div>`)}
      </div>
    </div>`;
}

// ---------- قائمة الشهر (الحالي / القادم فقط) ----------

export async function loadCalendar(offset) {
  const box = $('#calendar-block');
  if (!box) return;
  box.innerHTML = `<div class="skeleton skeleton--line" style="width:60%"></div>${skeletonCards(1)}`;

  let data;
  try {
    data = await api.get(`/calendar?offset=${offset === 1 ? 1 : 0}`);
  } catch (err) {
    box.innerHTML = errorState(err.message);
    return;
  }

  box.innerHTML = html`
    <div class="row row--between mb-2" style="gap:.6rem">
      <div>
        <strong style="font-size:1.05rem">${data.window.label}</strong>
        <div class="small muted num">${raw(f.dateShort(data.window.start))} ← ${raw(f.dateShort(data.window.end))}</div>
      </div>
      <div class="month-switch" role="tablist">
        <button class="month-switch__btn ${raw(data.offset === 0 ? 'month-switch__btn--on' : '')}" data-offset="0">
          الشهر الحالي</button>
        <button class="month-switch__btn ${raw(data.offset === 1 ? 'month-switch__btn--on' : '')}" data-offset="1">
          الشهر القادم</button>
      </div>
    </div>

    ${raw(data.items.length
      ? `<div class="timeline-list">${data.items.map(calendarItem).join('')}</div>`
      : emptyState(
          data.offset === 0 ? 'لا توجد مناسبات قادمة في هذا الشهر' : 'لا توجد مناسبات مسجلة للشهر القادم',
          'تُضاف المناسبات والمحاضرات من لوحة التحكم.', '🗓'))}`;

  box.querySelectorAll('[data-offset]').forEach((btn) => {
    btn.addEventListener('click', () => loadCalendar(Number(btn.dataset.offset)));
  });
}
