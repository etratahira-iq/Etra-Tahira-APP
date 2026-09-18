// إدارة الحجوزات: القائمة، التفاصيل، التسعير، العربون، الحالات
import { api } from '../core/api.js';
import {
  html, raw, esc, icon, $, $$, toast, busy, errorState, emptyState,
  skeletonLines, modal, closeModal, confirmDialog,
} from '../core/ui.js';
import * as f from '../core/format.js';
import { setPage } from './shell.js';
import { rerender } from '../core/router.js';
import { bookingTimeline } from '../views/components.js';
import { receiptHtml, printReceipt } from '../views/invoice.js';

// ================= القائمة =================

export async function adminBookingsView({ query }) {
  setPage('الحجوزات');
  const out = $('#admin-outlet');
  out.innerHTML = skeletonLines(8);

  const params = new URLSearchParams();
  for (const k of ['status', 'q', 'from', 'to', 'event_type', 'user_id', 'page']) {
    if (query[k]) params.set(k, query[k]);
  }

  let data;
  try {
    data = await api.get(`/admin/bookings?${params}`);
  } catch (err) {
    out.innerHTML = errorState(err.message);
    return null;
  }

  out.innerHTML = html`
    <form class="toolbar" id="bk-filters">
      <input class="input" name="q" type="search" placeholder="بحث: رقم الطلب، الاسم، الهاتف" value="${query.q || ''}">
      <select class="select" name="status">
        <option value="">كل الحالات</option>
        ${raw(data.statuses.map((s) =>
          `<option value="${esc(s.key)}" ${query.status === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join(''))}
      </select>
      <select class="select" name="event_type">
        <option value="">كل أنواع المناسبات</option>
        ${raw(data.event_types.map((t) =>
          `<option value="${esc(t)}" ${query.event_type === t ? 'selected' : ''}>${esc(t)}</option>`).join(''))}
      </select>
      <input class="input" name="from" type="date" value="${query.from || ''}" title="من تاريخ">
      <input class="input" name="to" type="date" value="${query.to || ''}" title="إلى تاريخ">
      <button class="btn btn--sm" type="submit">تطبيق</button>
      <a class="btn btn--sm btn--quiet" href="#/bookings">مسح</a>
    </form>

    <div class="muted small mb-1">النتائج: ${data.total}</div>

    ${raw(data.items.length ? `
      <div class="table-wrap">
        <table class="table table--cards">
          <thead>
            <tr>
              <th>رقم الطلب</th><th>المستخدم</th><th>التواريخ</th><th>الأيام</th>
              <th>المناسبة</th><th>الحضور</th><th>الطعام</th>
              <th>السعر/يوم</th><th>الطعام</th><th>المجموع</th><th>العربون</th><th>المتبقي</th>
              <th>الحالة</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((b) => `
              <tr>
                <td data-label="رقم الطلب"><span class="booking-code">${esc(b.code)}</span>
                  <div class="tiny faint">${esc(f.relative(b.created_at))}</div></td>
                <td data-label="المستخدم">${esc(b.user_name)}
                  <div class="tiny faint" style="direction:ltr;text-align:right">${esc(b.user_phone)}</div></td>
                <td data-label="التواريخ" class="num">${esc(f.dateShort(b.start_date))}<br>${esc(f.dateShort(b.end_date))}</td>
                <td data-label="الأيام" class="num">${b.days}</td>
                <td data-label="المناسبة">${esc(b.event_type_display)}</td>
                <td data-label="الحضور" class="num">${b.attendees}</td>
                <td data-label="الطعام">${esc(b.food_option_label)}</td>
                <td data-label="السعر/يوم" class="num">${esc(f.money(b.daily_price, { withCurrency: false }))}</td>
                <td data-label="تكلفة الطعام" class="num">${esc(f.money(b.food_cost, { withCurrency: false }))}</td>
                <td data-label="المجموع" class="num bold">${esc(f.money(b.total, { withCurrency: false }))}</td>
                <td data-label="العربون" class="num">${esc(f.money(b.deposit_paid, { withCurrency: false }))}
                  <div class="tiny faint">مطلوب: ${esc(f.money(b.deposit_amount, { withCurrency: false }))}</div></td>
                <td data-label="المتبقي" class="num">${esc(f.money(b.remaining, { withCurrency: false }))}</td>
                <td data-label="الحالة"><span class="badge badge--${esc(b.status_tone)}">${esc(b.status_label)}</span></td>
                <td data-label=""><a class="btn btn--sm btn--ghost" href="#/bookings/${b.id}">إدارة</a></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : emptyState('لا توجد حجوزات مطابقة', 'جرّب تغيير الفلاتر.'))}

    ${raw(pager(data, query))}`;

  $('#bk-filters').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const p = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (String(v).trim()) p.set(k, v);
    location.hash = `#/bookings${p.toString() ? '?' + p : ''}`;
  });
  return null;
}

function pager(data, query) {
  if (data.pages <= 1) return '';
  const parts = [];
  for (let p = 1; p <= data.pages; p++) {
    const q = new URLSearchParams({ ...query, page: p });
    parts.push(`<a class="btn btn--sm ${p === data.page ? '' : 'btn--quiet'}" href="#/bookings?${q}">${p}</a>`);
  }
  return `<div class="row mt-2" style="justify-content:center">${parts.join('')}</div>`;
}

// ================= التفاصيل =================

export async function adminBookingDetailView({ params }) {
  setPage('تفاصيل الحجز');
  const out = $('#admin-outlet');
  out.innerHTML = skeletonLines(10);

  let data;
  try {
    data = await api.get(`/admin/bookings/${params.id}`);
  } catch (err) {
    out.innerHTML = errorState(err.message);
    return null;
  }

  const b = data.booking;
  const currency = data.settings.currency;
  setPage(`الحجز ${b.code}`, `<a class="btn btn--sm btn--quiet" href="#/bookings">العودة للقائمة</a>`);

  out.innerHTML = html`
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(330px,1fr));align-items:start">

      <!-- بيانات الحجز -->
      <div class="grid" style="gap:1rem">
        <div class="card">
          <div class="card__head row row--between">
            <span>بيانات الطلب</span>
            <span class="badge badge--${raw(b.status_tone)}">${b.status_label}</span>
          </div>
          <div class="card__body">
            <div class="dl">
              <div class="dl__row"><span class="dl__key">رقم الطلب</span>
                <span class="dl__val booking-code">${b.code}</span></div>
              <div class="dl__row"><span class="dl__key">المستخدم</span>
                <span class="dl__val">${b.user?.name || '—'}</span></div>
              <div class="dl__row"><span class="dl__key">رقم الهاتف</span>
                <span class="dl__val" style="direction:ltr">${b.user?.phone || '—'}</span></div>
              <div class="dl__row"><span class="dl__key">تاريخ البداية</span>
                <span class="dl__val num">${raw(f.dateShort(b.start_date))}</span></div>
              <div class="dl__row"><span class="dl__key">تاريخ النهاية</span>
                <span class="dl__val num">${raw(f.dateShort(b.end_date))}</span></div>
              <div class="dl__row"><span class="dl__key">عدد الأيام</span>
                <span class="dl__val">${b.days}</span></div>
              <div class="dl__row"><span class="dl__key">نوع المناسبة</span>
                <span class="dl__val">${b.event_type_display}</span></div>
              <div class="dl__row"><span class="dl__key">عدد الحضور</span>
                <span class="dl__val">${b.attendees}</span></div>
              <div class="dl__row"><span class="dl__key">خيار الطعام</span>
                <span class="dl__val">${b.food_option_label}</span></div>
              <div class="dl__row"><span class="dl__key">تاريخ الطلب</span>
                <span class="dl__val small">${raw(f.relative(b.created_at))}</span></div>
            </div>
            ${raw(b.user_note ? `<div class="alert mt-2" style="margin-bottom:0">
              <strong>ملاحظة المستخدم:</strong> ${esc(b.user_note)}</div>` : '')}
          </div>
          <div class="card__foot row" style="gap:.4rem">
            <button class="btn btn--sm btn--quiet" id="bk-edit">تعديل بيانات الحجز</button>
            <button class="btn btn--sm btn--quiet" id="bk-notify">إرسال إشعار</button>
          </div>
        </div>

        <!-- التسعير -->
        <div class="card">
          <div class="card__head">التسعير والفاتورة</div>
          <div class="card__body">
            <form id="price-form">
              <div class="admin-form-grid">
                <div class="field">
                  <label class="field__label" for="p-daily">سعر الحجز لليوم الواحد (${raw(esc(currency))})</label>
                  <input class="input num" id="p-daily" type="number" min="0" step="any" value="${b.daily_price || ''}">
                </div>
                <div class="field">
                  <label class="field__label" for="p-food">تكلفة الطعام (${raw(esc(currency))})</label>
                  <input class="input num" id="p-food" type="number" min="0" step="any"
                         value="${b.food_cost || ''}" ${raw(b.food_option_slug === 'kitchen' ? '' : 'disabled')}>
                  <span class="field__hint">
                    ${b.food_option_slug === 'kitchen' ? 'الطعام من مطبخ الحسينية' : 'الطعام على صاحب المجلس — لا تُضاف تكلفة'}
                  </span>
                </div>
                <div class="field">
                  <label class="field__label" for="p-dep">قيمة العربون (${raw(esc(currency))})</label>
                  <input class="input num" id="p-dep" type="number" min="0" step="any" value="${b.deposit_amount || ''}">
                  <span class="field__hint">اتركه فارغاً لاحتساب ${data.settings.deposit_percent}% تلقائياً</span>
                </div>
                <div class="field field--full">
                  <label class="field__label" for="p-note">ملاحظات الإدارة (تظهر للمستخدم)</label>
                  <textarea class="textarea" id="p-note" style="min-height:70px">${b.admin_note || ''}</textarea>
                </div>
              </div>

              <div class="price-box mb-2" id="price-preview"></div>

              <label class="switch mb-2"><input type="checkbox" id="p-notify" checked>
                <span>إرسال إشعار للمستخدم</span></label>
              <button class="btn btn--block" type="submit">حفظ التسعير وإرسال الفاتورة للمستخدم</button>
            </form>
          </div>
          ${raw(b.invoice ? `<div class="card__foot row" style="gap:.4rem">
            <button class="btn btn--sm btn--ghost" id="bk-invoice">عرض الفاتورة</button>
            <span class="small muted">${esc(b.invoice.number)}</span>
          </div>` : '')}
        </div>
      </div>

      <!-- العمود الثاني -->
      <div class="grid" style="gap:1rem">
        <div class="card">
          <div class="card__head">تغيير الحالة</div>
          <div class="card__body">
            <div class="row" style="gap:.4rem">
              ${raw(statusButtons(b))}
            </div>
            <div class="small muted mt-2">الانتقالات غير المنطقية محجوبة تلقائياً لحماية سلامة البيانات.</div>
          </div>
        </div>

        <div class="card">
          <div class="card__head">مراحل الطلب</div>
          <div class="card__body">${raw(bookingTimeline(b.timeline))}</div>
        </div>

        <div class="card">
          <div class="card__head">وصولات العربون</div>
          <div class="card__body">
            ${raw(data.payments.length ? paymentsList(data.payments) : emptyState('لم تصل أي وصولات دفع بعد'))}
          </div>
        </div>

        <div class="card">
          <div class="card__head">سجل الطلب</div>
          <div class="card__body">
            <div class="grid" style="gap:.55rem">
              ${raw(b.history.map((h) => `
                <div style="padding-bottom:.5rem;border-bottom:1px dashed var(--line-soft)">
                  <div class="bold small">${esc(h.label)}</div>
                  ${h.note ? `<div class="small muted">${esc(h.note)}</div>` : ''}
                  <div class="tiny faint">${esc(h.actor_role === 'user' ? 'المستخدم' : 'الإدارة')} · ${esc(f.relative(h.created_at))}</div>
                </div>`).join(''))}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  bindDetail(b, data);
  return null;
}

// ---------- أزرار الحالة ----------

const TRANSITIONS = {
  pending_review: ['pricing', 'awaiting_user_approval', 'rejected', 'cancelled'],
  pricing: ['awaiting_user_approval', 'rejected', 'cancelled'],
  awaiting_user_approval: ['awaiting_deposit', 'confirmed', 'pricing', 'cancelled', 'rejected'],
  awaiting_deposit: ['deposit_submitted', 'cancelled', 'rejected'],
  deposit_submitted: ['deposit_paid', 'awaiting_deposit', 'cancelled', 'rejected'],
  deposit_paid: ['confirmed', 'completed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [], cancelled: [], rejected: [],
};

const LABELS = {
  pending_review: 'قيد المراجعة', pricing: 'بانتظار تعديل السعر',
  awaiting_user_approval: 'بانتظار موافقة المستخدم', awaiting_deposit: 'بانتظار العربون',
  deposit_submitted: 'بانتظار تأكيد العربون', deposit_paid: 'تم دفع العربون',
  confirmed: 'تم التأكيد', completed: 'مكتمل', cancelled: 'ملغي', rejected: 'مرفوض',
};

const TONE = {
  rejected: 'btn--danger', cancelled: 'btn--quiet', completed: 'btn--ghost',
  confirmed: 'btn', deposit_paid: 'btn',
};

function statusButtons(b) {
  const allowed = TRANSITIONS[b.status] || [];
  if (!allowed.length) return '<span class="muted small">لا توجد انتقالات متاحة من هذه الحالة.</span>';
  return allowed.map((s) =>
    `<button class="btn btn--sm ${TONE[s] || 'btn--ghost'}" data-status="${s}">${esc(LABELS[s])}</button>`).join('');
}

// ---------- قائمة المدفوعات ----------

const PAY_STATUS = {
  pending: ['بانتظار التأكيد', 'warn'], accepted: ['مقبول', 'ok'],
  rejected: ['مرفوض', 'bad'], resend: ['طُلبت إعادة الإرسال', 'warn'],
};

function paymentsList(payments) {
  return `<div class="grid" style="gap:.8rem">${payments.map((p) => {
    const [label, tone] = PAY_STATUS[p.status] || [p.status, 'muted'];
    return `<div style="padding-bottom:.8rem;border-bottom:1px dashed var(--line-soft)">
      <div class="row row--between">
        <div>
          <div class="bold num" style="font-size:1.05rem">${esc(f.money(p.amount))}</div>
          <div class="small muted">${esc(p.method_name)}${p.reference ? ` · ${esc(p.reference)}` : ''}</div>
          <div class="tiny faint">${esc(f.relative(p.created_at))}</div>
        </div>
        <span class="badge badge--${tone}">${esc(label)}</span>
      </div>
      ${p.receipt_path ? `<a href="${esc(p.receipt_path)}" target="_blank" rel="noopener">
        <img src="${esc(p.receipt_path)}" alt="وصل الدفع"
             style="max-height:130px;margin-top:.5rem;border-radius:8px;border:1px solid var(--line)"></a>` : ''}
      ${p.admin_note ? `<div class="small muted mt-1">${esc(p.admin_note)}</div>` : ''}
      ${p.status === 'pending' ? `
        <div class="row mt-1" style="gap:.35rem">
          <button class="btn btn--sm" data-pay="${p.id}" data-action="accept">قبول العربون</button>
          <button class="btn btn--sm btn--quiet" data-pay="${p.id}" data-action="resend">طلب إعادة الإرسال</button>
          <button class="btn btn--sm btn--danger" data-pay="${p.id}" data-action="reject">رفض</button>
        </div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ---------- الأحداث ----------

function bindDetail(b, data) {
  // معاينة حية للأسعار
  const preview = $('#price-preview');
  const daily = $('#p-daily');
  const food = $('#p-food');
  const dep = $('#p-dep');

  const drawPreview = () => {
    const d = Number(daily.value) || 0;
    const fo = b.food_option_slug === 'kitchen' ? (Number(food.value) || 0) : 0;
    const sub = d * b.days;
    const total = sub + fo;
    const depositVal = dep.value === '' ? (total * Number(data.settings.deposit_percent || 0)) / 100 : Number(dep.value) || 0;
    preview.innerHTML = `
      <div class="dl">
        <div class="dl__row"><span class="dl__key">سعر اليوم × ${b.days}</span>
          <span class="dl__val num">${esc(f.money(sub))}</span></div>
        ${fo ? `<div class="dl__row"><span class="dl__key">تكلفة الطعام</span>
          <span class="dl__val num">${esc(f.money(fo))}</span></div>` : ''}
        <div class="dl__row"><span class="dl__key">العربون</span>
          <span class="dl__val num">${esc(f.money(depositVal))}</span></div>
      </div>
      <div class="price-box__total"><span>المجموع الكلي</span>
        <span class="num">${esc(f.money(total))}</span></div>`;
  };
  [daily, food, dep].forEach((el) => el?.addEventListener('input', drawPreview));
  drawPreview();

  // حفظ التسعير
  $('#price-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    busy(btn, true);
    try {
      await api.post(`/admin/bookings/${b.id}/price`, {
        daily_price: daily.value || 0,
        food_cost: food.disabled ? 0 : (food.value || 0),
        deposit_amount: dep.value === '' ? undefined : dep.value,
        admin_note: $('#p-note').value,
        notify: $('#p-notify').checked,
      });
      toast('تم حفظ التسعير وإصدار الفاتورة', 'ok');
      rerender();
    } catch (err) {
      busy(btn, false);
      toast(err.message, 'bad', 5000);
    }
  });

  // تغيير الحالة
  $$('[data-status]').forEach((btn) => btn.addEventListener('click', async () => {
    const status = btn.dataset.status;
    const ok = await confirmDialog(`هل تريد تغيير حالة الحجز إلى "${LABELS[status]}"؟`, {
      title: 'تغيير الحالة', okText: 'تأكيد', tone: status === 'rejected' ? 'danger' : 'primary',
    });
    if (!ok) return;
    busy(btn, true, '...');
    try {
      await api.post(`/admin/bookings/${b.id}/status`, { status });
      toast('تم تحديث حالة الحجز', 'ok');
      rerender();
    } catch (err) {
      busy(btn, false);
      toast(err.message, 'bad', 5000);
    }
  }));

  // مراجعة العربون
  $$('[data-pay]').forEach((btn) => btn.addEventListener('click', async () => {
    const action = btn.dataset.action;
    const titles = { accept: 'قبول العربون', reject: 'رفض الوصل', resend: 'طلب إعادة الإرسال' };
    let note = '';
    if (action !== 'accept') {
      note = prompt(`${titles[action]} — اكتب سبباً/ملاحظة للمستخدم (اختياري):`, '') ?? null;
      if (note === null) return;
    } else {
      const ok = await confirmDialog('بقبول العربون سيتم تثبيت الحجز. هل تريد المتابعة؟', {
        title: 'قبول العربون', okText: 'نعم، قبول', tone: 'primary',
      });
      if (!ok) return;
    }
    busy(btn, true, '...');
    try {
      await api.post(`/admin/bookings/payments/${btn.dataset.pay}/review`, { action, note });
      toast(action === 'accept' ? 'تم تأكيد العربون وتثبيت الحجز' : 'تم تحديث حالة الوصل', 'ok');
      rerender();
    } catch (err) {
      busy(btn, false);
      toast(err.message, 'bad', 5000);
    }
  }));

  // الفاتورة
  $('#bk-invoice')?.addEventListener('click', async () => {
    try {
      const res = await api.get(`/bookings/${b.id}/invoice`);
      modal({
        title: `الفاتورة ${res.invoice.number}`,
        body: `<div class="receipt-preview">${receiptHtml(res.invoice, res.settings)}</div>`,
        footer: `<button class="btn" id="inv-print">طباعة / حفظ PDF</button>`,
        onOpen: (el) => el.querySelector('#inv-print').addEventListener('click', () => printReceipt()),
      });
    } catch (err) { toast(err.message, 'bad'); }
  });

  // تعديل بيانات الحجز
  $('#bk-edit')?.addEventListener('click', () => {
    modal({
      title: 'تعديل بيانات الحجز',
      body: html`
        <div class="admin-form-grid">
          <div class="field">
            <label class="field__label" for="e-start">تاريخ البداية</label>
            <input class="input" id="e-start" type="date" value="${b.start_date}">
          </div>
          <div class="field">
            <label class="field__label" for="e-days">عدد الأيام</label>
            <input class="input num" id="e-days" type="number" min="1" value="${b.days}">
          </div>
          <div class="field">
            <label class="field__label" for="e-att">عدد الحضور</label>
            <input class="input num" id="e-att" type="number" min="1" value="${b.attendees}">
          </div>
          <div class="field field--full">
            <label class="field__label" for="e-note">ملاحظات الإدارة</label>
            <textarea class="textarea" id="e-note" style="min-height:70px">${b.admin_note || ''}</textarea>
          </div>
        </div>`,
      footer: `<button class="btn" id="e-save">حفظ</button>`,
      onOpen: (el) => el.querySelector('#e-save').addEventListener('click', async (ev) => {
        busy(ev.target, true);
        try {
          await api.patch(`/admin/bookings/${b.id}`, {
            start_date: el.querySelector('#e-start').value,
            days: el.querySelector('#e-days').value,
            attendees: el.querySelector('#e-att').value,
            admin_note: el.querySelector('#e-note').value,
          });
          closeModal();
          toast('تم حفظ التعديلات', 'ok');
          rerender();
        } catch (err) {
          busy(ev.target, false);
          toast(err.message, 'bad', 5000);
        }
      }),
    });
  });

  // إشعار يدوي
  $('#bk-notify')?.addEventListener('click', () => {
    modal({
      title: 'إرسال إشعار للمستخدم',
      body: html`
        <div class="field">
          <label class="field__label" for="n-title">عنوان الإشعار</label>
          <input class="input" id="n-title" placeholder="مثال: يرجى مراجعة الإدارة">
        </div>
        <div class="field">
          <label class="field__label" for="n-body">نص الإشعار</label>
          <textarea class="textarea" id="n-body"></textarea>
        </div>`,
      footer: `<button class="btn" id="n-send">إرسال</button>`,
      onOpen: (el) => el.querySelector('#n-send').addEventListener('click', async (ev) => {
        busy(ev.target, true, 'جارٍ الإرسال...');
        try {
          await api.post(`/admin/bookings/${b.id}/notify`, {
            title: el.querySelector('#n-title').value,
            body: el.querySelector('#n-body').value,
          });
          closeModal();
          toast('تم إرسال الإشعار', 'ok');
        } catch (err) {
          busy(ev.target, false);
          toast(err.message, 'bad');
        }
      }),
    });
  });
}

// ================= صفحة المدفوعات =================

export async function adminPaymentsView() {
  setPage('العربون والمدفوعات');
  const out = $('#admin-outlet');
  out.innerHTML = skeletonLines(6);

  let data;
  try {
    data = await api.get('/admin/bookings?status=deposit_submitted&per_page=100');
  } catch (err) {
    out.innerHTML = errorState(err.message);
    return null;
  }

  out.innerHTML = html`
    <div class="alert alert--info">
      تظهر هنا الحجوزات التي أرسل أصحابها وصل العربون وهي بانتظار تأكيد الإدارة.
    </div>
    ${raw(data.items.length ? `
      <div class="grid grid--2">
        ${data.items.map((b) => `
          <div class="card"><div class="card__body">
            <div class="row row--between">
              <div>
                <span class="booking-code small muted">${esc(b.code)}</span>
                <h3 style="font-size:1.05rem;margin:.2rem 0">${esc(b.user_name)}</h3>
                <div class="small muted" style="direction:ltr;text-align:right">${esc(b.user_phone)}</div>
              </div>
              <span class="badge badge--warn">بانتظار التأكيد</span>
            </div>
            <div class="dl mt-2">
              <div class="dl__row"><span class="dl__key">التاريخ</span>
                <span class="dl__val num">${esc(f.dateRangeLabel(b.start_date, b.end_date))}</span></div>
              <div class="dl__row"><span class="dl__key">المجموع</span>
                <span class="dl__val num">${esc(f.money(b.total))}</span></div>
              <div class="dl__row"><span class="dl__key">العربون المطلوب</span>
                <span class="dl__val num">${esc(f.money(b.deposit_amount))}</span></div>
            </div>
            <a class="btn btn--block mt-2" href="#/bookings/${b.id}">مراجعة الوصل</a>
          </div></div>`).join('')}
      </div>` : emptyState('لا توجد وصولات بانتظار التأكيد', 'كل الوصولات تمت مراجعتها.', '✅'))}`;
  return null;
}
