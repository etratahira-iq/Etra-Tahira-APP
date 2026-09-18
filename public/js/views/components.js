// مكوّنات مشتركة بين صفحات الواجهة
import { html, raw, esc, icon, mediaOrPlaceholder, copyText } from '../core/ui.js';
import * as f from '../core/format.js';

/**
 * أسطر المحاضرة بالترتيب المعتمد:
 *   تقديم المحاضرة: ...
 *   يليها <المجلس>
 *   الملا: ...
 */
export function lectureCredits(l, { compact = true } = {}) {
  const lines = [];
  if (l.speaker) {
    lines.push(`<div class="lecture-credit">
      <span class="lecture-credit__key">تقديم المحاضرة:</span>
      <span class="lecture-credit__val">${esc(l.speaker)}</span></div>`);
  }
  if (l.majlis_name) {
    lines.push(`<div class="lecture-credit lecture-credit--next">
      <span class="lecture-credit__val">يليها ${esc(l.majlis_name)}</span></div>`);
  }
  if (l.reciter) {
    lines.push(`<div class="lecture-credit">
      <span class="lecture-credit__key">الملا:</span>
      <span class="lecture-credit__val">${esc(l.reciter)}</span></div>`);
  }
  if (!lines.length) return '';
  return `<div class="lecture-credits ${compact ? 'lecture-credits--sm' : ''}">${lines.join('')}</div>`;
}

/** بطاقة محاضرة */
export function lectureCard(l) {
  const hijri = l.date_hijri_short || f.dateHijriShort(l.date_iso || l.lecture_date);
  const [day, ...monthParts] = hijri.split(' ');
  return html`
    <a class="card card--link" href="#/lectures/${l.id}" style="display:block;color:inherit">
      <div class="card__media">
        ${raw(mediaOrPlaceholder(l.image_path, l.title))}
        <div class="lecture-card__date">
          <div class="lecture-card__day">${day}</div>
          <div class="lecture-card__month">${monthParts.join(' ')}</div>
        </div>
      </div>
      <div class="card__body">
        <h3 style="margin-bottom:.25rem;font-size:1.12rem">${l.title}</h3>
        ${raw(lectureCredits(l))}
        ${raw(l.description ? `<p class="small muted clamp-2 mt-1">${esc(l.description)}</p>` : '')}
        <div class="lecture-card__meta">
          ${raw(l.occasion ? `<span class="badge badge--gold">${esc(l.occasion)}</span>` : '')}
          <span class="badge">${esc(f.dateShort(l.date_iso || l.lecture_date))}</span>
          ${raw(l.lecture_time ? `<span class="badge">${esc(f.time12(l.lecture_time))}</span>` : '')}
        </div>
      </div>
    </a>`;
}

/** بطاقة مناسبة */
export function eventCard(e) {
  return html`
    <a class="card card--link" href="#/events/${e.id}" style="display:block;color:inherit">
      <div class="card__media">${raw(mediaOrPlaceholder(e.image_path, e.title))}</div>
      <div class="card__body">
        <div class="row" style="gap:.4rem;margin-bottom:.35rem">
          <span class="badge badge--gold">${e.kind || 'مناسبة'}</span>
          <span class="badge">${e.date_hijri_short || f.dateHijriShort(e.event_date)}</span>
        </div>
        <h3 style="font-size:1.1rem;margin-bottom:.2rem">${e.title}</h3>
        <div class="small muted">
          ${e.date_gregorian || f.dateGregorian(e.event_date)}
          ${raw(e.event_time ? ` · ${esc(f.time12(e.event_time))}` : '')}
        </div>
        ${raw(e.description ? `<p class="small muted clamp-2 mt-1">${esc(e.description)}</p>` : '')}
      </div>
    </a>`;
}

/** عنصر في قائمة الشهر */
export function calendarItem(item) {
  const hijri = item.date_hijri_short || '';
  const [day, ...rest] = hijri.split(' ');
  const time = item.lecture_time || item.event_time;
  const href = item.kind === 'lecture' ? `#/lectures/${item.id}` : `#/events/${item.id}`;
  return html`
    <a class="timeline-item" href="${href}" style="color:inherit">
      <div class="timeline-item__date">
        <span class="timeline-item__day">${day}</span>
        <span class="timeline-item__mon">${rest.join(' ')}</span>
      </div>
      <div class="timeline-item__body">
        <div class="timeline-item__title">${item.title}</div>
        <div class="small muted">
          ${item.weekday} · ${f.dateShort(item.date_iso)}
          ${raw(time ? ` · ${esc(f.time12(time))}` : '')}
        </div>
        <div class="row mt-1" style="gap:.35rem">
          <span class="badge ${item.kind === 'lecture' ? 'badge--info' : 'badge--gold'}">
            ${item.kind === 'lecture' ? 'محاضرة' : (item.kind_label || item.kindName || 'مناسبة')}
          </span>
          ${raw(item.speaker ? `<span class="badge">${esc(item.speaker)}</span>` : '')}
          ${raw(item.reciter ? `<span class="badge">الملا ${esc(item.reciter)}</span>` : '')}
          ${raw(item.occasion ? `<span class="badge">${esc(item.occasion)}</span>` : '')}
        </div>
      </div>
    </a>`;
}

/** بطاقة مفقودات */
export function lostCard(item) {
  const delivered = item.status === 'delivered';
  return html`
    <div class="card">
      <div class="card__media" style="aspect-ratio:4/3;position:relative">
        ${raw(mediaOrPlaceholder(item.image_path, item.item_name))}
        <span class="badge ${delivered ? 'badge--muted' : 'badge--ok'} lost-card__status">
          ${delivered ? 'تم تسليمه' : 'متوفر'}
        </span>
      </div>
      <div class="card__body">
        <h3 style="font-size:1.05rem;margin-bottom:.25rem">${item.item_name}</h3>
        ${raw(item.description ? `<p class="small muted clamp-3">${esc(item.description)}</p>` : '')}
        <div class="row mt-1" style="gap:.35rem">
          <span class="badge">${item.found_date_hijri || f.dateHijriShort(item.found_date)}</span>
          ${raw(item.found_place ? `<span class="badge">${esc(item.found_place)}</span>` : '')}
        </div>
      </div>
    </div>`;
}

/**
 * بطاقة التبرع ببوست/بنر الحسينية.
 * linked = البوست نفسه رابط إلى صفحة التبرعات (يُستخدم في الصفحة الرئيسية).
 */
export function donationBanner(s, { linked = false, eager = false, usePost = false } = {}) {
  // الصفحة الرئيسية تعرض البوست، وصفحة التبرعات تعرض البنر العريض
  const src = usePost ? (s.donation_post || s.donation_image) : s.donation_image;
  const img = src
    ? `<img class="donation-banner" src="${esc(src)}"
            alt="${esc(s.donation_title || 'التبرع لحسينية العترة الطاهرة')}"
            loading="${eager ? 'eager' : 'lazy'}" decoding="async">`
    : '';

  const media = linked && img
    ? `<a href="#/donations" class="donation-banner__link"
          aria-label="${esc(s.donation_title || 'تبرع الآن')}">${img}</a>`
    : img;

  return html`
    <div class="card donation-card">
      ${raw(media)}
      <div class="card__body">
        <span class="badge badge--gold mb-1">${raw(icon('heart', 15))} التبرعات</span>
        <h2 style="margin-bottom:.4rem">${s.donation_title || 'ساهم في دعم الحسينية'}</h2>
        <p class="muted" style="margin-bottom:1rem">${s.donation_text || ''}</p>
        <a class="btn btn--gold" href="#/donations">تبرع الآن</a>
      </div>
    </div>`;
}

/** بطاقة إعلان */
export function adCard(ad) {
  const inner = html`
    ${raw(ad.image_path ? `<div class="ad-card__media" style="background-image:url('${esc(ad.image_path)}')"></div>` : '')}
    <div class="ad-card__body">
      <span class="badge badge--gold mb-1">إعلان</span>
      <h3 style="font-size:1.15rem">${ad.title}</h3>
      ${raw(ad.description ? `<p class="small muted" style="margin:0">${esc(ad.description)}</p>` : '')}
    </div>`;
  const cls = `ad-card ${ad.image_path ? 'ad-card--media' : ''}`;
  return ad.link_url
    ? html`<a class="${raw(cls)}" href="${ad.link_url}" target="_blank" rel="noopener noreferrer" style="color:inherit">${raw(inner)}</a>`
    : html`<div class="${raw(cls)}">${raw(inner)}</div>`;
}

/** طريقة دفع مع زر نسخ */
export function paymentMethodCard(m) {
  return html`
    <div class="pay-method">
      <div class="pay-method__icon">${raw(icon('wallet', 20))}</div>
      <div class="pay-method__body">
        <div class="pay-method__name">${m.name}</div>
        ${raw(m.account_number
          ? `<div class="pay-method__num">${esc(m.account_number)}</div>`
          : '<div class="small muted">لم يُحدَّد الرقم بعد</div>')}
        ${raw(m.account_name ? `<div class="tiny muted">${esc(m.account_name)}</div>` : '')}
        ${raw(m.instructions ? `<div class="tiny muted mt-1">${esc(m.instructions)}</div>` : '')}
      </div>
      ${raw(m.account_number
        ? `<button class="btn btn--sm btn--ghost copy-btn" type="button" data-copy="${esc(m.account_number)}">نسخ الآن</button>`
        : '')}
    </div>`;
}

/** يربط كل أزرار النسخ داخل عنصر */
export function bindCopyButtons(root = document) {
  root.querySelectorAll('[data-copy]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => copyText(btn.dataset.copy));
  });
}

/** الخط الزمني لحالة الحجز */
export function bookingTimeline(timeline) {
  const symbols = { done: '✓', current: '●', next: '○', todo: '○' };
  return html`
    <div class="steps">
      ${raw(timeline.map((s) => `
        <div class="step step--${esc(s.state)}">
          <div class="step__dot">${symbols[s.state] || '○'}</div>
          <div class="step__label">${esc(s.label)}</div>
        </div>`).join(''))}
    </div>`;
}

/** صف في قائمة حجوزاتي */
export function bookingRow(b) {
  return html`
    <a class="card card--link" href="#/booking/${b.id}" style="display:block;color:inherit">
      <div class="card__body">
        <div class="row row--between" style="align-items:flex-start">
          <div>
            <span class="booking-code small muted">${b.code}</span>
            <h3 style="font-size:1.08rem;margin:.2rem 0">${b.event_type_display || b.event_type_name}</h3>
          </div>
          <span class="badge badge--${b.status_tone}">${b.status_label}</span>
        </div>
        <div class="dl mt-1">
          <div class="dl__row"><span class="dl__key">التاريخ</span>
            <span class="dl__val num">${raw(f.dateRangeLabel(b.start_date, b.end_date))}</span></div>
          <div class="dl__row"><span class="dl__key">المدة</span>
            <span class="dl__val">${f.days(b.days)}</span></div>
          ${raw(b.total > 0 ? `<div class="dl__row"><span class="dl__key">المجموع</span>
            <span class="dl__val num">${esc(f.money(b.total))}</span></div>` : '')}
          ${raw(b.remaining > 0 && b.deposit_paid > 0 ? `<div class="dl__row"><span class="dl__key">المتبقي</span>
            <span class="dl__val num">${esc(f.money(b.remaining))}</span></div>` : '')}
        </div>
      </div>
    </a>`;
}

/** عنوان قسم موحّد */
export const sectionHead = (title, sub = '', action = '') => html`
  <div class="section-head">
    <div>
      <h2 class="section-title">${title}</h2>
      ${raw(sub ? `<p class="section-sub">${esc(sub)}</p>` : '')}
    </div>
    ${raw(action)}
  </div>`;
