// إدارة الحجوزات والتسعير والعربون — للمشرفين
import { Router, readJson, sendJson, badRequest, notFound } from '../../lib/http.js';
import { all, get, run } from '../../lib/db.js';
import { requireRole } from '../../lib/auth.js';
import * as v from '../../lib/validate.js';
import { getSettings, getNumberSetting } from '../../lib/settings.js';
import { notify, notifyBookingStatus } from '../../lib/notify.js';
import {
  recalcBooking, hydrateBooking, logBookingEvent, canTransition,
  STATUSES, issueInvoice, assertRangeAvailable, round2, unavailableDates,
} from '../../lib/booking.js';

export const adminBookingRoutes = new Router();

function loadBooking(id) {
  const b = get('SELECT * FROM bookings WHERE id = :id', { id });
  if (!b) throw notFound('طلب الحجز غير موجود');
  return b;
}

// ---------- القائمة مع الفلاتر ----------

adminBookingRoutes.get('/', async (req, res) => {
  requireRole(req, 'admin');
  const url = new URL(req.url, 'http://x');
  const status = url.searchParams.get('status') || '';
  const q = (url.searchParams.get('q') || '').trim();
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const eventType = url.searchParams.get('event_type') || '';
  const userId = url.searchParams.get('user_id') || '';
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const perPage = Math.min(100, Number(url.searchParams.get('per_page') || 20));

  const where = ['1=1'];
  const params = {};
  if (status && STATUSES[status]) { where.push('b.status = :st'); params.st = status; }
  if (from) { where.push('b.end_date >= :from'); params.from = from; }
  if (to) { where.push('b.start_date <= :to'); params.to = to; }
  if (eventType) { where.push('b.event_type_name = :et'); params.et = eventType; }
  if (userId) { where.push('b.user_id = :uid'); params.uid = Number(userId); }
  if (q) {
    where.push('(b.code LIKE :q OR u.name LIKE :q OR u.phone LIKE :q)');
    params.q = `%${q}%`;
  }

  const clause = where.join(' AND ');
  const total = all(
    `SELECT b.id FROM bookings b JOIN users u ON u.id = b.user_id WHERE ${clause}`, params
  ).length;

  const rows = all(
    `SELECT b.*, u.name AS user_name, u.phone AS user_phone
       FROM bookings b JOIN users u ON u.id = b.user_id
      WHERE ${clause}
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT :lim OFFSET :off`,
    { ...params, lim: perPage, off: (page - 1) * perPage }
  );

  sendJson(res, 200, {
    ok: true,
    total, page, per_page: perPage, pages: Math.max(1, Math.ceil(total / perPage)),
    items: rows.map((b) => ({
      ...b,
      status_label: STATUSES[b.status]?.label || b.status,
      status_tone: STATUSES[b.status]?.tone || 'muted',
      event_type_display: b.event_type_other || b.event_type_name,
    })),
    statuses: Object.entries(STATUSES).map(([key, x]) => ({ key, ...x })),
    event_types: all(`SELECT DISTINCT event_type_name FROM bookings WHERE event_type_name != ''`)
      .map((r) => r.event_type_name),
  });
});

// ---------- تفاصيل ----------

adminBookingRoutes.get('/:id', async (req, res, { params }) => {
  requireRole(req, 'admin');
  const booking = loadBooking(params.id);
  sendJson(res, 200, {
    ok: true,
    booking: hydrateBooking(booking, { includeUser: true }),
    payments: all('SELECT * FROM payments WHERE booking_id = :id ORDER BY id DESC', { id: booking.id }),
    settings: getSettings(),
  });
});

// ---------- التسعير ----------

adminBookingRoutes.post('/:id/price', async (req, res, { params }) => {
  const admin = requireRole(req, 'admin');
  const booking = loadBooking(params.id);
  const body = await readJson(req);

  if (['completed', 'cancelled', 'rejected'].includes(booking.status)) {
    throw badRequest('لا يمكن تسعير حجز منتهٍ أو ملغي');
  }

  const dailyPrice = v.num(body.daily_price, 'سعر الحجز لليوم الواحد', { min: 0, max: 1_000_000_000 });
  const foodCost = booking.food_option_slug === 'kitchen'
    ? v.num(body.food_cost, 'تكلفة الطعام', { min: 0, max: 1_000_000_000, required: false })
    : 0;

  const subtotal = round2(dailyPrice * booking.days);
  const total = round2(subtotal + foodCost);

  // العربون: قيمة مباشرة أو نسبة افتراضية من الإعدادات
  let deposit;
  if (body.deposit_amount !== undefined && body.deposit_amount !== '' && body.deposit_amount !== null) {
    deposit = v.num(body.deposit_amount, 'قيمة العربون', { min: 0, max: 1_000_000_000 });
  } else {
    deposit = round2((total * getNumberSetting('deposit_percent', 30)) / 100);
  }
  if (deposit > total) throw badRequest('قيمة العربون لا يمكن أن تتجاوز المجموع الكلي');

  const adminNote = v.str(body.admin_note, 'ملاحظات الإدارة', { required: false, max: 600 });
  const notifyUser = body.notify !== false;

  run(
    `UPDATE bookings
        SET daily_price = :dp, food_cost = :fc, deposit_amount = :dep,
            admin_note = :note, priced_at = datetime('now'),
            reviewed_by = :by, updated_at = datetime('now')
      WHERE id = :id`,
    { dp: dailyPrice, fc: foodCost, dep: deposit, note: adminNote, by: admin.id, id: booking.id }
  );

  // نقل الحالة إلى "بانتظار موافقة المستخدم" إن كان ذلك مسموحاً
  let statusChanged = false;
  if (canTransition(booking.status, 'awaiting_user_approval')) {
    run(`UPDATE bookings SET status = 'awaiting_user_approval' WHERE id = :id`, { id: booking.id });
    statusChanged = true;
  }

  const updated = recalcBooking(booking.id);
  issueInvoice(booking.id);
  logBookingEvent(
    booking.id, updated.status,
    `تم تحديد السعر: ${dailyPrice} × ${booking.days} يوم` + (foodCost ? ` + طعام ${foodCost}` : ''),
    admin
  );

  if (notifyUser && statusChanged) notifyBookingStatus(updated);
  else if (notifyUser) {
    notify(updated.user_id, 'تم تحديث تسعير الحجز', `تم تحديث تسعير الحجز رقم ${updated.code}.`, {
      type: 'booking', link: `#/booking/${updated.id}`,
    });
  }

  sendJson(res, 200, { ok: true, booking: hydrateBooking(updated, { includeUser: true }) });
});

// ---------- تغيير الحالة ----------

adminBookingRoutes.post('/:id/status', async (req, res, { params }) => {
  const admin = requireRole(req, 'admin');
  const booking = loadBooking(params.id);
  const body = await readJson(req);

  const status = v.oneOf(body.status, Object.keys(STATUSES), 'الحالة');
  if (status === booking.status) throw badRequest('الحجز في هذه الحالة بالفعل');
  if (!canTransition(booking.status, status)) {
    throw badRequest(
      `لا يمكن الانتقال من "${STATUSES[booking.status].label}" إلى "${STATUSES[status].label}"`
    );
  }
  const note = v.str(body.note, 'ملاحظة', { required: false, max: 400 });

  const sets = [`status = :st`, `updated_at = datetime('now')`];
  if (status === 'confirmed' || status === 'deposit_paid') sets.push(`confirmed_at = datetime('now')`);
  run(`UPDATE bookings SET ${sets.join(', ')} WHERE id = :id`, { st: status, id: booking.id });

  logBookingEvent(booking.id, status, note || `غيّرت الإدارة الحالة إلى ${STATUSES[status].label}`, admin);
  const updated = recalcBooking(booking.id);
  notifyBookingStatus(updated, note);

  sendJson(res, 200, { ok: true, booking: hydrateBooking(updated, { includeUser: true }) });
});

// ---------- تعديل بيانات الحجز (تاريخ/أيام/حضور) ----------

adminBookingRoutes.patch('/:id', async (req, res, { params }) => {
  const admin = requireRole(req, 'admin');
  const booking = loadBooking(params.id);
  const body = await readJson(req);
  const s = getSettings();

  const startDate = v.date(body.start_date ?? booking.start_date, 'تاريخ البداية');
  const days = v.num(body.days ?? booking.days, 'عدد الأيام', { min: 1, max: 60, integer: true });
  const attendees = v.num(body.attendees ?? booking.attendees, 'عدد الحضور', {
    min: 1, max: Number(s.attendees_max) * 5 || 5000, integer: true,
  });
  const adminNote = v.str(body.admin_note ?? booking.admin_note, 'ملاحظات الإدارة', { required: false, max: 600 });

  let endDate = booking.end_date;
  if (startDate !== booking.start_date || days !== booking.days) {
    endDate = assertRangeAvailable(startDate, days, { excludeBookingId: booking.id });
  }

  run(
    `UPDATE bookings SET start_date = :sd, days = :d, end_date = :ed,
            attendees = :a, admin_note = :note, updated_at = datetime('now')
      WHERE id = :id`,
    { sd: startDate, d: days, ed: endDate, a: attendees, note: adminNote, id: booking.id }
  );
  logBookingEvent(booking.id, booking.status, 'عدّلت الإدارة بيانات الحجز', admin);

  const updated = recalcBooking(booking.id);
  if (updated.total > 0) issueInvoice(booking.id);
  sendJson(res, 200, { ok: true, booking: hydrateBooking(updated, { includeUser: true }) });
});

// ---------- مراجعة العربون ----------

adminBookingRoutes.post('/payments/:paymentId/review', async (req, res, { params }) => {
  const admin = requireRole(req, 'admin');
  const payment = get('SELECT * FROM payments WHERE id = :id', { id: params.paymentId });
  if (!payment) throw notFound('سجل الدفع غير موجود');
  const booking = loadBooking(payment.booking_id);

  const body = await readJson(req);
  const action = v.oneOf(body.action, ['accept', 'reject', 'resend'], 'الإجراء');
  const note = v.str(body.note, 'ملاحظة', { required: false, max: 400 });

  if (payment.status === 'accepted') throw badRequest('تم قبول هذا الوصل مسبقاً');

  const statusMap = { accept: 'accepted', reject: 'rejected', resend: 'resend' };
  run(
    `UPDATE payments SET status = :st, admin_note = :n, reviewed_at = datetime('now'), reviewed_by = :by
      WHERE id = :id`,
    { st: statusMap[action], n: note, by: admin.id, id: payment.id }
  );

  if (action === 'accept') {
    if (canTransition(booking.status, 'deposit_paid')) {
      run(
        `UPDATE bookings SET status = 'deposit_paid', confirmed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = :id`,
        { id: booking.id }
      );
    }
    logBookingEvent(booking.id, 'deposit_paid', `تم تأكيد العربون بمبلغ ${payment.amount}`, admin);
  } else if (action === 'reject') {
    logBookingEvent(booking.id, booking.status, `تم رفض وصل الدفع${note ? ': ' + note : ''}`, admin);
    if (canTransition(booking.status, 'awaiting_deposit')) {
      run(`UPDATE bookings SET status = 'awaiting_deposit', updated_at = datetime('now') WHERE id = :id`, { id: booking.id });
    }
    notify(booking.user_id, 'تم رفض وصل الدفع', `تم رفض وصل عربون الحجز رقم ${booking.code}.${note ? ' ' + note : ''}`, {
      type: 'booking', link: `#/booking/${booking.id}`,
    });
  } else {
    logBookingEvent(booking.id, booking.status, `طُلب إعادة إرسال وصل الدفع${note ? ': ' + note : ''}`, admin);
    notify(booking.user_id, 'يرجى إعادة إرسال وصل الدفع', `وصل عربون الحجز رقم ${booking.code} غير واضح.${note ? ' ' + note : ''}`, {
      type: 'booking', link: `#/booking/${booking.id}`,
    });
  }

  const updated = recalcBooking(booking.id);
  issueInvoice(booking.id);
  if (action === 'accept') notifyBookingStatus(updated);

  sendJson(res, 200, { ok: true, booking: hydrateBooking(updated, { includeUser: true }) });
});

// ---------- إرسال إشعار يدوي للمستخدم ----------

adminBookingRoutes.post('/:id/notify', async (req, res, { params }) => {
  requireRole(req, 'admin');
  const booking = loadBooking(params.id);
  const body = await readJson(req);
  const title = v.str(body.title, 'عنوان الإشعار', { min: 2, max: 120 });
  const text = v.str(body.body, 'نص الإشعار', { required: false, max: 600 });
  notify(booking.user_id, title, text, { type: 'booking', link: `#/booking/${booking.id}` });
  sendJson(res, 200, { ok: true, message: 'تم إرسال الإشعار' });
});

// ---------- الأيام غير المتاحة ----------

adminBookingRoutes.get('/availability/blocked', async (req, res) => {
  requireRole(req, 'admin');
  const url = new URL(req.url, 'http://x');
  const from = url.searchParams.get('from') || v.todayISO();
  const to = url.searchParams.get('to') || v.addDays(from, 365);
  sendJson(res, 200, {
    ok: true,
    blocked: all('SELECT * FROM blocked_dates WHERE date BETWEEN :f AND :t ORDER BY date', { f: from, t: to }),
    unavailable: unavailableDates(from, to),
  });
});

adminBookingRoutes.post('/availability/blocked', async (req, res) => {
  const admin = requireRole(req, 'admin');
  const body = await readJson(req);
  const start = v.date(body.date, 'التاريخ');
  const days = v.num(body.days ?? 1, 'عدد الأيام', { min: 1, max: 60, integer: true, required: false }) || 1;
  const reason = v.str(body.reason, 'السبب', { required: false, max: 200 });

  const added = [];
  for (const d of v.dateRange(start, v.addDays(start, days - 1))) {
    run(
      `INSERT INTO blocked_dates (date, reason, created_by) VALUES (:d, :r, :by)
       ON CONFLICT(date) DO UPDATE SET reason = :r`,
      { d, r: reason, by: admin.id }
    );
    added.push(d);
  }
  sendJson(res, 201, { ok: true, added });
});

adminBookingRoutes.delete('/availability/blocked/:id', async (req, res, { params }) => {
  requireRole(req, 'admin');
  run('DELETE FROM blocked_dates WHERE id = :id', { id: params.id });
  sendJson(res, 200, { ok: true });
});
