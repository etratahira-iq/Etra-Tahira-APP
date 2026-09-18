// الفاتورة الحرارية (80mm) — عرض وطباعة/حفظ PDF
import { html, raw, esc } from '../core/ui.js';
import * as f from '../core/format.js';

/**
 * يبني HTML الفاتورة من نسخة (snapshot) مجمّدة وقت الإصدار.
 */
export function receiptHtml(invoice, settings = {}) {
  const snap = invoice.snapshot || {};
  const t = snap.totals || {};
  const b = snap.booking || {};
  const c = snap.customer || {};
  const currency = snap.currency || settings.currency || 'د.ع';
  const amount = (n) => `${Number(n || 0).toLocaleString('en-US')} ${currency}`;

  const issued = String(invoice.issued_at || '').slice(0, 10);

  return html`
    <div class="receipt" id="receipt">
      <div class="receipt__center">
        <div class="receipt__title">${snap.site_name || settings.site_name || 'حسينية العترة الطاهرة'}</div>
        ${raw(snap.address ? `<div class="receipt__sub">${esc(snap.address)}</div>` : '')}
        ${raw(snap.phone ? `<div class="receipt__sub" style="direction:ltr">${esc(snap.phone)}</div>` : '')}
        <div class="receipt__sub" style="margin-top:4px">فاتورة حجز</div>
      </div>

      <hr class="receipt__sep">

      <div class="receipt__row"><span>رقم الفاتورة</span><span>${invoice.number}</span></div>
      <div class="receipt__row"><span>رقم الطلب</span><span>${b.code || '—'}</span></div>
      <div class="receipt__row"><span>التاريخ</span><span>${raw(f.dateShort(issued))}</span></div>

      <hr class="receipt__sep">

      <div class="receipt__row"><span>اسم صاحب الحجز</span><span>${c.name || '—'}</span></div>
      <div class="receipt__row"><span>رقم الهاتف</span><span style="direction:ltr">${c.phone || '—'}</span></div>
      <div class="receipt__row"><span>نوع المناسبة</span><span>${b.event_type || '—'}</span></div>

      <hr class="receipt__sep">

      <div class="receipt__row"><span>تاريخ البداية</span><span>${raw(f.dateShort(b.start_date))}</span></div>
      <div class="receipt__row"><span>تاريخ النهاية</span><span>${raw(f.dateShort(b.end_date))}</span></div>
      <div class="receipt__row"><span>عدد الأيام</span><span>${b.days ?? '—'}</span></div>
      <div class="receipt__row"><span>عدد الحضور</span><span>${b.attendees ?? '—'}</span></div>
      <div class="receipt__row"><span>الطعام</span><span>${b.food_option || '—'}</span></div>

      <hr class="receipt__sep">
      <div class="receipt__center" style="font-weight:700">الخدمات</div>

      <div class="receipt__items">
        ${raw((snap.items || []).map((item) => `
          <div style="margin-bottom:4px">
            <div class="receipt__item-name">${esc(item.label)}</div>
            <div class="receipt__row">
              <span>${Number(item.qty) > 1 ? `${esc(item.qty)} × ${esc(amount(item.unit_price))}` : ''}</span>
              <span>${esc(amount(item.amount))}</span>
            </div>
          </div>`).join(''))}
      </div>

      <hr class="receipt__sep">

      <div class="receipt__row"><span>المجموع الفرعي</span><span>${raw(amount(t.subtotal))}</span></div>
      ${raw(Number(t.food_cost) > 0
        ? `<div class="receipt__row"><span>تكلفة الطعام</span><span>${esc(amount(t.food_cost))}</span></div>`
        : '')}
      <div class="receipt__row receipt__total"><span>المجموع الكلي</span><span>${raw(amount(t.total))}</span></div>

      <hr class="receipt__sep">

      <div class="receipt__row"><span>العربون المطلوب</span><span>${raw(amount(t.deposit_amount))}</span></div>
      <div class="receipt__row"><span>العربون المدفوع</span><span>${raw(amount(t.deposit_paid))}</span></div>
      <div class="receipt__row receipt__total"><span>المبلغ المتبقي</span><span>${raw(amount(t.remaining))}</span></div>

      <hr class="receipt__sep">

      <div class="receipt__note">
        هذه الفاتورة صادرة إلكترونياً من تطبيق الحسينية.<br>
        نسأل الله أن يتقبل منكم صالح الأعمال.
      </div>
    </div>`;
}

/**
 * يفتح نافذة طباعة تحتوي الفاتورة فقط بمقاس 80mm،
 * ومنها يستطيع المستخدم الحفظ كـ PDF أو الطباعة الحرارية.
 */
export function printReceipt() {
  const node = document.getElementById('receipt');
  if (!node) return;

  const win = window.open('', '_blank', 'width=420,height=680');
  if (!win) {
    // المتصفح منع النافذة — نطبع الصفحة الحالية (CSS يخفي ما عدا الفاتورة)
    window.print();
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>فاتورة</title>
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/app.css">
<link rel="stylesheet" href="/css/print.css">
<style>
  body { background:#f4f1ea; padding:14px; }
  @media print { body { background:#fff; padding:0; } }
</style>
</head><body>${node.outerHTML}</body></html>`);
  win.document.close();

  win.addEventListener('load', () => {
    win.focus();
    win.print();
  });
  // احتياط إن لم تُطلق حادثة load
  setTimeout(() => { try { win.focus(); win.print(); } catch { /* تجاهل */ } }, 600);
}
