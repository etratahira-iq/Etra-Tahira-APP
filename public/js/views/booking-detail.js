// صفحة تفاصيل الحجز: الحالة، الخط الزمني، الفاتورة، العربون
import { api, fileToDataUrl } from '../core/api.js';
import {
  html, raw, esc, icon, $, $$, toast, busy, errorState, skeletonLines,
  modal, closeModal, confirmDialog,
} from '../core/ui.js';
import * as f from '../core/format.js';
import { state, refreshUnread } from '../core/store.js';
import { navigate, rerender } from '../core/router.js';
import { bookingTimeline, paymentMethodCard, bindCopyButtons } from './components.js';
import { receiptHtml, printReceipt } from './invoice.js';

export async function bookingDetailView({ params }) {
  if (!state.user) {
    navigate('/login?next=' + encodeURIComponent(`/booking/${params.id}`), { replace: true });
    return null;
  }

  const app = $('#app');
  app.innerHTML = `<div class="container section">${skeletonLines(8)}</div>`;

  let data;
  try {
    data = await api.get(`/bookings/${params.id}`);
  } catch (err) {
    app.innerHTML = `<div class="container section">${errorState(err.message)}</div>`;
    return null;
  }

  const b = data.booking;
  const priced = b.total > 0 || b.daily_price > 0;

  app.innerHTML = html`
    <div class="container section">
      <a class="btn btn--sm btn--quiet mb-2" href="#/account">${raw(icon('chevron', 16))} العودة إلى حسابي</a>

      <div class="booking-hero">
        <div class="row row--between" style="align-items:flex-start;gap:1rem">
          <div>
            <div class="small muted">رقم الطلب</div>
            <div class="booking-code" style="font-size:1.15rem">${b.code}</div>
            <h1 style="font-size:1.35rem;margin:.35rem 0 0">${b.event_type_display}</h1>
          </div>
          <span class="badge badge--${b.status_tone}" style="font-size:.95rem;padding:.35rem .9rem">
            ${b.status_label}</span>
        </div>
        ${raw(b.status === 'confirmed' || b.status === 'deposit_paid' ? `
          <div class="alert alert--ok mt-2" style="margin-bottom:0">
            ✓ تم التأكيد — الحجز مثبّت باسمكم في التواريخ المحددة.
          </div>` : '')}
        ${raw(b.admin_note ? `<div class="alert alert--info mt-2" style="margin-bottom:0">
          <strong>ملاحظة الإدارة:</strong> ${esc(b.admin_note)}</div>` : '')}
      </div>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start">
        <!-- العمود الأول -->
        <div class="grid" style="gap:1rem">
          <div class="card">
            <div class="card__head">بيانات الحجز</div>
            <div class="card__body">
              <div class="dl">
                <div class="dl__row"><span class="dl__key">تاريخ البداية</span>
                  <span class="dl__val num">${raw(f.dateShort(b.start_date))}</span></div>
                <div class="dl__row"><span class="dl__key">تاريخ النهاية</span>
                  <span class="dl__val num">${raw(f.dateShort(b.end_date))}</span></div>
                <div class="dl__row"><span class="dl__key">المدة</span>
                  <span class="dl__val">${f.days(b.days)}</span></div>
                <div class="dl__row"><span class="dl__key">نوع المناسبة</span>
                  <span class="dl__val">${b.event_type_display}</span></div>
                <div class="dl__row"><span class="dl__key">عدد الحضور</span>
                  <span class="dl__val">${f.persons(b.attendees)}</span></div>
                <div class="dl__row"><span class="dl__key">الطعام</span>
                  <span class="dl__val">${b.food_option_label}</span></div>
                <div class="dl__row"><span class="dl__key">تاريخ الطلب</span>
                  <span class="dl__val small">${raw(f.relative(b.created_at))}</span></div>
              </div>
              ${raw(b.user_note ? `<div class="alert mt-2" style="margin-bottom:0">
                <strong>ملاحظتك:</strong> ${esc(b.user_note)}</div>` : '')}
            </div>
          </div>

          <!-- التسعير -->
          <div class="card">
            <div class="card__head">التكلفة</div>
            <div class="card__body">
              ${raw(priced ? priceBlock(b) : `
                <div class="alert alert--warn" style="margin:0">
                  لم يتم تسعير الحجز بعد. ستصلك الفاتورة فور مراجعة الإدارة للطلب.
                </div>`)}
            </div>
            ${raw(priced ? `<div class="card__foot row" style="gap:.5rem">
              <button class="btn btn--sm btn--ghost" id="btn-invoice">عرض الفاتورة</button>
            </div>` : '')}
          </div>
        </div>

        <!-- العمود الثاني -->
        <div class="grid" style="gap:1rem">
          <div class="card">
            <div class="card__head">مراحل الطلب</div>
            <div class="card__body">${raw(bookingTimeline(b.timeline))}</div>
          </div>

          ${raw(actionsCard(b))}

          ${raw(b.payments?.length ? paymentsCard(b) : '')}

          ${raw(b.history?.length ? `
            <div class="card">
              <div class="card__head">سجل الطلب</div>
              <div class="card__body">
                <div class="grid" style="gap:.6rem">
                  ${b.history.map((h) => `
                    <div style="padding-bottom:.55rem;border-bottom:1px dashed var(--line-soft)">
                      <div class="bold small">${esc(h.label)}</div>
                      ${h.note ? `<div class="small muted">${esc(h.note)}</div>` : ''}
                      <div class="tiny faint">${esc(f.relative(h.created_at))}</div>
                    </div>`).join('')}
                </div>
              </div>
            </div>` : '')}
        </div>
      </div>
    </div>`;

  bindActions(b);
  return null;
}

// ---------- كتلة الأسعار ----------

function priceBlock(b) {
  return html`
    <div class="price-box">
      <div class="dl">
        <div class="dl__row"><span class="dl__key">سعر اليوم الواحد</span>
          <span class="dl__val num">${raw(f.money(b.daily_price))}</span></div>
        <div class="dl__row"><span class="dl__key">عدد الأيام</span>
          <span class="dl__val">× ${b.days}</span></div>
        <div class="dl__row"><span class="dl__key">إجمالي الحجز</span>
          <span class="dl__val num">${raw(f.money(b.subtotal))}</span></div>
        ${raw(b.food_cost > 0 ? `<div class="dl__row"><span class="dl__key">تكلفة الطعام</span>
          <span class="dl__val num">${esc(f.money(b.food_cost))}</span></div>` : '')}
      </div>
      <div class="price-box__total">
        <span>المجموع الكلي</span>
        <span class="num">${raw(f.money(b.total))}</span>
      </div>
    </div>

    ${raw(b.deposit_amount > 0 ? `
      <div class="dl mt-2">
        <div class="dl__row"><span class="dl__key">العربون المطلوب</span>
          <span class="dl__val num">${esc(f.money(b.deposit_amount))}</span></div>
        <div class="dl__row"><span class="dl__key">العربون المدفوع</span>
          <span class="dl__val num" style="color:var(--ok)">${esc(f.money(b.deposit_paid))}</span></div>
        <div class="dl__row"><span class="dl__key">المبلغ المتبقي</span>
          <span class="dl__val num" style="color:var(--bad)">${esc(f.money(b.remaining))}</span></div>
      </div>` : '')}`;
}

// ---------- بطاقة الإجراءات ----------

function actionsCard(b) {
  const actions = [];

  if (b.can_approve) {
    actions.push(`
      <div class="alert alert--info">تمت مراجعة طلبك وتحديد السعر. يرجى الاطلاع على الفاتورة والموافقة للمتابعة.</div>
      <button class="btn btn--block" id="btn-approve">الموافقة على السعر ومتابعة الحجز</button>`);
  }

  if (b.can_pay_deposit) {
    actions.push(`
      <div class="alert alert--warn">
        <div class="bold">تثبيت الحجز</div>
        <div class="small">يتم تثبيت الحجز بعد دفع العربون المحدد من الإدارة وإرفاق صورة وصل الدفع.</div>
      </div>
      <div class="dl mb-2">
        <div class="dl__row"><span class="dl__key">قيمة العربون المطلوبة</span>
          <span class="dl__val num" style="font-size:1.1rem">${esc(f.money(b.deposit_amount))}</span></div>
      </div>
      <button class="btn btn--block btn--gold" id="btn-deposit">إرسال العربون</button>`);
  }

  if (b.status === 'deposit_submitted' && !b.can_pay_deposit) {
    actions.push(`<div class="alert alert--info" style="margin:0">
      تم استلام وصل الدفع، وهو بانتظار تأكيد الإدارة.</div>`);
  }

  if (b.can_cancel) {
    actions.push(`<button class="btn btn--block btn--quiet mt-1" id="btn-cancel">إلغاء طلب الحجز</button>`);
  }

  if (!actions.length) return '';
  return html`<div class="card"><div class="card__head">الإجراءات</div>
    <div class="card__body">${raw(actions.join(''))}</div></div>`;
}

// ---------- سجل المدفوعات ----------

const PAYMENT_STATUS = {
  pending: { label: 'بانتظار التأكيد', tone: 'warn' },
  accepted: { label: 'تم القبول', tone: 'ok' },
  rejected: { label: 'مرفوض', tone: 'bad' },
  resend: { label: 'يرجى إعادة الإرسال', tone: 'warn' },
};

function paymentsCard(b) {
  return html`
    <div class="card">
      <div class="card__head">وصولات الدفع</div>
      <div class="card__body">
        <div class="grid" style="gap:.7rem">
          ${raw(b.payments.map((p) => {
            const st = PAYMENT_STATUS[p.status] || { label: p.status, tone: 'muted' };
            return `<div style="padding-bottom:.7rem;border-bottom:1px dashed var(--line-soft)">
              <div class="row row--between">
                <div>
                  <div class="bold num">${esc(f.money(p.amount))}</div>
                  <div class="small muted">${esc(p.method_name)}${p.reference ? ` · ${esc(p.reference)}` : ''}</div>
                  <div class="tiny faint">${esc(f.relative(p.created_at))}</div>
                </div>
                <span class="badge badge--${st.tone}">${esc(st.label)}</span>
              </div>
              ${p.admin_note ? `<div class="small muted mt-1">ملاحظة الإدارة: ${esc(p.admin_note)}</div>` : ''}
              ${p.receipt_path ? `<a class="btn btn--sm btn--quiet mt-1" href="${esc(p.receipt_path)}"
                 target="_blank" rel="noopener">عرض صورة الوصل</a>` : ''}
            </div>`;
          }).join(''))}
        </div>
      </div>
    </div>`;
}

// ---------- ربط الأحداث ----------

function bindActions(b) {
  $('#btn-invoice')?.addEventListener('click', () => openInvoice(b.id));

  $('#btn-approve')?.addEventListener('click', async (e) => {
    const ok = await confirmDialog(
      'بالموافقة على السعر ستنتقل إلى مرحلة دفع العربون لتثبيت الحجز. هل تريد المتابعة؟',
      { title: 'الموافقة على السعر', okText: 'نعم، أوافق', tone: 'primary' }
    );
    if (!ok) return;
    busy(e.target, true, 'جارٍ التنفيذ...');
    try {
      await api.post(`/bookings/${b.id}/approve`);
      toast('تمت الموافقة، يرجى دفع العربون لتثبيت الحجز', 'ok', 4200);
      await refreshUnread();
      rerender();
    } catch (err) {
      busy(e.target, false);
      toast(err.message, 'bad');
    }
  });

  $('#btn-cancel')?.addEventListener('click', async (e) => {
    const ok = await confirmDialog('هل أنت متأكد من إلغاء طلب الحجز؟ لا يمكن التراجع عن هذا الإجراء.', {
      title: 'إلغاء الحجز', okText: 'نعم، إلغاء الطلب',
    });
    if (!ok) return;
    busy(e.target, true, 'جارٍ الإلغاء...');
    try {
      await api.post(`/bookings/${b.id}/cancel`, { reason: '' });
      toast('تم إلغاء طلب الحجز', 'ok');
      rerender();
    } catch (err) {
      busy(e.target, false);
      toast(err.message, 'bad');
    }
  });

  $('#btn-deposit')?.addEventListener('click', () => openDepositModal(b));
}

// ---------- نافذة إرسال العربون ----------

async function openDepositModal(b) {
  let methods = [];
  let instructions = '';
  try {
    const res = await api.get('/payment-methods');
    methods = res.methods;
    instructions = res.instructions;
  } catch (err) {
    toast(err.message, 'bad');
    return;
  }

  modal({
    title: 'إرسال العربون',
    wide: true,
    body: html`
      <div class="alert alert--info">${instructions || 'يتم تثبيت الحجز بعد دفع العربون وإرفاق صورة وصل الدفع.'}</div>

      <div class="dl mb-2">
        <div class="dl__row"><span class="dl__key">قيمة العربون المطلوبة</span>
          <span class="dl__val num" style="font-size:1.1rem">${raw(f.money(b.deposit_amount))}</span></div>
      </div>

      <h4 style="margin:.8rem 0 .5rem">طرق الدفع المتاحة</h4>
      ${raw(methods.length
        ? `<div class="grid" style="gap:.6rem">${methods.map(paymentMethodCard).join('')}</div>`
        : '<div class="alert alert--warn">لم تُضَف طرق دفع بعد، يرجى التواصل مع الإدارة.</div>')}

      <hr class="divider">

      <form id="dep-form" novalidate>
        <div class="field">
          <label class="field__label" for="dep-method">طريقة الدفع المستخدمة <span class="field__req">*</span></label>
          <select class="select" id="dep-method" required>
            <option value="">اختر طريقة الدفع</option>
            ${raw(methods.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join(''))}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="dep-amount">المبلغ المدفوع <span class="field__req">*</span></label>
          <input class="input num" id="dep-amount" type="number" inputmode="numeric" min="1"
                 value="${b.deposit_amount || ''}" required>
        </div>
        <div class="field">
          <label class="field__label" for="dep-ref">رقم العملية (اختياري)</label>
          <input class="input" id="dep-ref" type="text" placeholder="إن وُجد في وصل التحويل">
        </div>
        <div class="field">
          <label class="field__label" for="dep-file">صورة وصل الدفع <span class="field__req">*</span></label>
          <input class="input" id="dep-file" type="file" accept="image/*" required>
          <span class="field__hint">الصيغ المدعومة: JPG, PNG, WEBP — الحد الأقصى 4 ميغابايت</span>
          <div id="dep-preview" class="mt-1"></div>
        </div>
      </form>`,
    footer: `<button class="btn btn--gold" id="dep-submit">إرسال العربون</button>
             <button class="btn btn--quiet" onclick="this.closest('.modal-backdrop').remove();document.body.style.overflow=''">إلغاء</button>`,
    onOpen: (el) => {
      bindCopyButtons(el);
      let receipt = null;

      el.querySelector('#dep-file').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        const preview = el.querySelector('#dep-preview');
        if (!file) { receipt = null; preview.innerHTML = ''; return; }
        try {
          receipt = await fileToDataUrl(file);
          preview.innerHTML = `<img src="${receipt}" alt="معاينة الوصل"
            style="max-height:160px;border-radius:8px;border:1px solid var(--line)">`;
        } catch (err) {
          receipt = null;
          preview.innerHTML = `<div class="alert alert--bad" style="margin:.4rem 0 0">${esc(err.message)}</div>`;
        }
      });

      el.querySelector('#dep-submit').addEventListener('click', async (ev) => {
        const methodId = el.querySelector('#dep-method').value;
        const amount = el.querySelector('#dep-amount').value;
        if (!methodId) return toast('يرجى اختيار طريقة الدفع', 'bad');
        if (!amount || Number(amount) <= 0) return toast('يرجى إدخال المبلغ المدفوع', 'bad');
        if (!receipt) return toast('يرجى إرفاق صورة وصل الدفع', 'bad');

        busy(ev.target, true, 'جارٍ الإرسال...');
        try {
          await api.post('/payments/deposit', {
            booking_id: b.id,
            method_id: Number(methodId),
            amount: Number(amount),
            reference: el.querySelector('#dep-ref').value,
            receipt,
          });
          closeModal();
          toast('تم إرسال العربون، بانتظار تأكيد الإدارة', 'ok', 4200);
          await refreshUnread();
          rerender();
        } catch (err) {
          busy(ev.target, false);
          toast(err.message, 'bad', 5000);
        }
      });
    },
  });
}

// ---------- نافذة الفاتورة ----------

export async function openInvoice(bookingId) {
  let data;
  try {
    data = await api.get(`/bookings/${bookingId}/invoice`);
  } catch (err) {
    toast(err.message, 'bad');
    return;
  }

  modal({
    title: 'الفاتورة',
    body: `<div id="receipt-host">${receiptHtml(data.invoice, data.settings)}</div>`,
    footer: `<button class="btn" id="inv-print">حفظ الفاتورة / طباعة</button>
             <button class="btn btn--quiet" onclick="this.closest('.modal-backdrop').remove();document.body.style.overflow=''">إغلاق</button>`,
    onOpen: (el) => {
      el.querySelector('#inv-print').addEventListener('click', () => printReceipt());
    },
  });
}
