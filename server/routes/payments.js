// مسارات العربون: إرسال وصل الدفع من المستخدم
import { Router, readJson, sendJson, badRequest, notFound, forbidden } from '../lib/http.js';
import { get, run, all } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import * as v from '../lib/validate.js';
import { saveDataUrlImage } from '../lib/uploads.js';
import { notify, notifyBookingStatus } from '../lib/notify.js';
import { logBookingEvent, recalcBooking, hydrateBooking } from '../lib/booking.js';

export const paymentRoutes = new Router();

// إرسال العربون مع صورة الوصل
paymentRoutes.post('/deposit', async (req, res) => {
  const user = requireUser(req);
  const body = await readJson(req);

  const bookingId = v.num(body.booking_id, 'رقم الحجز', { integer: true, min: 1 });
  const booking = get('SELECT * FROM bookings WHERE id = :id', { id: bookingId });
  if (!booking) throw notFound('طلب الحجز غير موجود');
  if (booking.user_id !== user.id) throw forbidden('لا تملك صلاحية على هذا الحجز');

  const resendPending = all(
    `SELECT id FROM payments WHERE booking_id = :id AND status = 'resend'`,
    { id: bookingId }
  ).length > 0;

  if (booking.status !== 'awaiting_deposit' && !(booking.status === 'deposit_submitted' && resendPending)) {
    throw badRequest('لا يمكن إرسال العربون في الحالة الحالية للحجز');
  }

  const methodId = v.num(body.method_id, 'طريقة الدفع', { integer: true, min: 1 });
  const method = get(
    `SELECT * FROM payment_methods WHERE id = :id AND is_active = 1
       AND (usage_scope = 'deposit' OR usage_scope = 'both')`,
    { id: methodId }
  );
  if (!method) throw badRequest('طريقة الدفع المحددة غير متاحة');

  const amount = v.num(body.amount, 'المبلغ المدفوع', { min: 1, max: 1_000_000_000 });
  const reference = v.str(body.reference, 'رقم العملية', { required: false, max: 80 });

  if (!body.receipt) throw badRequest('يرجى إرفاق صورة وصل الدفع');
  const receiptPath = await saveDataUrlImage(body.receipt, { label: 'وصل الدفع' });

  run(
    `INSERT INTO payments (booking_id, user_id, method_id, method_name, amount, reference, receipt_path, status)
     VALUES (:b, :u, :m, :mn, :amt, :ref, :rp, 'pending')`,
    {
      b: bookingId, u: user.id, m: method.id, mn: method.name,
      amt: amount, ref: reference, rp: receiptPath,
    }
  );

  // أي طلب إعادة إرسال سابق يُعتبر منجزاً
  run(`UPDATE payments SET status = 'rejected' WHERE booking_id = :b AND status = 'resend'`, { b: bookingId });

  run(
    `UPDATE bookings SET status = 'deposit_submitted', updated_at = datetime('now') WHERE id = :id`,
    { id: bookingId }
  );
  logBookingEvent(bookingId, 'deposit_submitted', `أرسل المستخدم وصل دفع بمبلغ ${amount}`, user);

  const updated = recalcBooking(bookingId);
  notifyBookingStatus(updated);
  for (const admin of all(`SELECT id FROM users WHERE role IN ('admin','manager') AND is_active = 1`)) {
    notify(admin.id, 'وصل عربون جديد', `تم إرسال وصل عربون للحجز رقم ${booking.code} بانتظار التأكيد.`, {
      type: 'admin', link: `#/bookings/${bookingId}`,
    });
  }

  sendJson(res, 201, { ok: true, booking: hydrateBooking(updated) });
});

// سجل مدفوعات حجز معيّن (للمستخدم صاحب الحجز)
paymentRoutes.get('/booking/:id', async (req, res, { params }) => {
  const user = requireUser(req);
  const booking = get('SELECT * FROM bookings WHERE id = :id', { id: params.id });
  if (!booking) throw notFound('طلب الحجز غير موجود');
  if (booking.user_id !== user.id && user.role === 'user') throw forbidden();
  sendJson(res, 200, {
    ok: true,
    items: all('SELECT * FROM payments WHERE booking_id = :id ORDER BY id DESC', { id: booking.id }),
  });
});
