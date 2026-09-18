// الصفحة الرئيسية للوحة التحكم — الإحصائيات
import { api } from '../core/api.js';
import { html, raw, esc, $, errorState, emptyState, skeletonLines } from '../core/ui.js';
import * as f from '../core/format.js';
import { setPage, setBadges } from './shell.js';

export async function dashboardView() {
  setPage('لوحة التحكم');
  const out = $('#admin-outlet');
  out.innerHTML = skeletonLines(8);

  let data;
  try {
    data = await api.get('/admin/stats');
  } catch (err) {
    out.innerHTML = errorState(err.message);
    return null;
  }

  const s = data.stats;
  setBadges({
    bookings_pending: s.bookings_pending + s.bookings_awaiting_deposit,
    payments_pending: s.payments_pending,
  });

  const stat = (label, value, hint = '', tone = '') =>
    `<div class="stat ${tone ? 'stat--' + tone : ''}">
      <div class="stat__label">${esc(label)}</div>
      <div class="stat__value">${esc(value)}</div>
      ${hint ? `<div class="stat__hint">${esc(hint)}</div>` : ''}
    </div>`;

  out.innerHTML = html`
    <div class="stats-grid mb-3">
      ${raw(stat('إجمالي الحجوزات', s.bookings_total, 'كل الطلبات المسجلة'))}
      ${raw(stat('قيد المراجعة', s.bookings_pending, 'بانتظار التسعير', 'warn'))}
      ${raw(stat('بانتظار موافقة المستخدم', s.bookings_awaiting_user, '', 'warn'))}
      ${raw(stat('بانتظار العربون', s.bookings_awaiting_deposit, '', 'warn'))}
      ${raw(stat('الحجوزات المؤكدة', s.bookings_confirmed, 'مثبّتة أو مكتملة', 'ok'))}
      ${raw(stat('الحجوزات القادمة', s.bookings_upcoming, 'تواريخ لم تحن بعد', 'ok'))}
      ${raw(stat('عدد المستخدمين', s.users_total, `${s.staff_total} مشرف/مدير`))}
      ${raw(stat('وصولات بانتظار التأكيد', s.payments_pending, '', s.payments_pending ? 'bad' : ''))}
      ${raw(stat('إجمالي الإيرادات', f.money(s.revenue_total), 'حجوزات مؤكدة', 'gold'))}
      ${raw(stat('العربونات المستلمة', f.money(s.deposits_total), '', 'gold'))}
      ${raw(stat('المبالغ المتبقية', f.money(s.remaining_total), '', 'bad'))}
      ${raw(stat('التبرعات', f.money(s.donations_total), `${s.donations_count} تبرع`, 'gold'))}
      ${raw(stat('المفقودات', s.lost_found_total, `${s.lost_found_available} متوفر`))}
      ${raw(stat('المحاضرات', s.lectures_total, `${s.events_total} مناسبة`))}
    </div>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));align-items:start">
      <div class="card">
        <div class="card__head row row--between">
          <span>أحدث الطلبات</span>
          <a class="btn btn--sm btn--quiet" href="#/bookings">عرض الكل</a>
        </div>
        <div class="card__body" style="padding:0">
          ${raw(data.recent_bookings.length ? `
            <div class="table-wrap" style="border:none">
              <table class="table table--cards">
                <thead><tr><th>رقم الطلب</th><th>المستخدم</th><th>التاريخ</th><th>الحالة</th></tr></thead>
                <tbody>
                  ${data.recent_bookings.map((b) => `
                    <tr style="cursor:pointer" onclick="location.hash='#/bookings/${b.id}'">
                      <td data-label="رقم الطلب"><span class="booking-code">${esc(b.code)}</span></td>
                      <td data-label="المستخدم">${esc(b.user_name)}<div class="tiny faint" style="direction:ltr;text-align:right">${esc(b.user_phone)}</div></td>
                      <td data-label="التاريخ" class="num">${esc(f.dateShort(b.start_date))}</td>
                      <td data-label="الحالة"><span class="badge badge--${esc(b.status_tone)}">${esc(b.status_label)}</span></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>` : `<div style="padding:1rem">${emptyState('لا توجد طلبات بعد')}</div>`)}
        </div>
      </div>

      <div class="card">
        <div class="card__head">الحجوزات القادمة</div>
        <div class="card__body">
          ${raw(data.upcoming_bookings.length ? `
            <div class="grid" style="gap:.6rem">
              ${data.upcoming_bookings.map((b) => `
                <a href="#/bookings/${b.id}" style="color:inherit">
                  <div class="row row--between" style="padding-bottom:.55rem;border-bottom:1px dashed var(--line-soft)">
                    <div>
                      <div class="bold">${esc(b.event_type_other || b.event_type_name)}</div>
                      <div class="small muted">${esc(b.user_name)} · ${esc(b.code)}</div>
                    </div>
                    <div style="text-align:left">
                      <div class="num small">${esc(f.dateShort(b.start_date))}</div>
                      <span class="badge badge--info">${esc(b.status_label)}</span>
                    </div>
                  </div>
                </a>`).join('')}
            </div>` : emptyState('لا توجد حجوزات قادمة'))}
        </div>
      </div>

      ${raw(data.pending_payments.length ? `
        <div class="card">
          <div class="card__head row row--between">
            <span>وصولات بانتظار التأكيد</span>
            <a class="btn btn--sm btn--quiet" href="#/payments">عرض الكل</a>
          </div>
          <div class="card__body">
            <div class="grid" style="gap:.6rem">
              ${data.pending_payments.map((p) => `
                <a href="#/bookings/${p.booking_id}" style="color:inherit">
                  <div class="row row--between" style="padding-bottom:.55rem;border-bottom:1px dashed var(--line-soft)">
                    <div>
                      <div class="bold num">${esc(f.money(p.amount))}</div>
                      <div class="small muted">${esc(p.user_name)} · ${esc(p.booking_code)}</div>
                    </div>
                    <span class="badge badge--warn">بانتظار التأكيد</span>
                  </div>
                </a>`).join('')}
            </div>
          </div>
        </div>` : '')}
    </div>`;
  return null;
}
