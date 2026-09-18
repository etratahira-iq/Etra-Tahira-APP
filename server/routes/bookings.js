// مسارات الحجز الخاصة بالمستخدم
import { Router, readJson, sendJson, badRequest, notFound, forbidden } from '../lib/http.js';
import { all, get, run, transaction } from '../lib/db.js';
import { requireUser, isStaff } from '../lib/auth.js';
import * as v from '../lib/validate.js';
import { getSettings } from '../lib/settings.js';
import { notifyBookingStatus, notify } from '../lib/notify.js';
import {
  assertRangeAvailable, recalcBooking, hydrateBooking, logBookingEvent,
  generateBookingCode, canTransition, USER_CANCELLABLE, issueInvoice, round2,
} from '../lib/booking.js';

export const bookingRoutes = new Router();

function loadOwned(req, id) {
  const user = requireUser(req);
  const booking = get('SELECT * FROM bookings WHERE id = :id', { id });
  if (!booking) throw notFound('طلب الحجز غير موجود');
  if (booking.user_id !== user.id && !isStaff(user)) throw forbidden('لا تملك صلاحية عرض هذا الحجز');
  return { user, booking };
}

// ---------- قائمة حجوزاتي ----------

bookingRoutes.get('/', async (req, res) => {
  const user = requireUser(req);
  const rows = all(
    'SELECT * FROM bookings WHERE user_id = :u ORDER BY created_at DESC, id DESC',
    { u: user.id }
  );
  sendJson(res, 200, { ok: true, items: rows.map((b) => hydrateBooking(b)) });
});

// ---------- تفاصيل حجز ----------

bookingRoutes.get('/:id', async (req, res, { params }) => {
  const { booking } = loadOwned(req, params.id);
  sendJson(res, 200, { ok: true, booking: hydrateBooking(booking, { includeUser: true }) });
});

// ---------- إنشاء طلب حجز ----------

bookingRoutes.post('/', async (req, res) => {
  const user = requireUser(req);
  const body = await readJson(req);
  const s = getSettings();

  const startDate = v.date(body.start_date, 'تاريخ بداية الحجز');
  const maxDays = Number(s.booking_max_days) || 10;
  const days = v.num(body.days, 'عدد الأيام', { min: 1, max: maxDays, integer: true });

  const today = v.todayISO();
  const leadDays = Number(s.booking_min_lead_days) || 0;
  const earliest = v.addDays(today, leadDays);
  if (startDate < earliest) {
    throw badRequest(
      leadDays > 0
        ? `يجب أن يكون تاريخ الحجز بعد ${leadDays} يوم على الأقل من اليوم`
        : 'لا يمكن الحجز في تاريخ سابق'
    );
  }

  // نوع المناسبة
  const eventTypeId = v.num(body.event_type_id, 'نوع المناسبة', { integer: true, min: 1 });
  const eventType = get('SELECT * FROM event_types WHERE id = :id AND is_active = 1', { id: eventTypeId });
  if (!eventType) throw badRequest('نوع المناسبة المحدد غير متاح');
  let eventTypeOther = '';
  if (eventType.allows_custom_text) {
    eventTypeOther = v.str(body.event_type_other, 'نوع المناسبة (أخرى)', { min: 2, max: 120 });
  }

  // عدد الحضور
  const minA = Number(s.attendees_min) || 1;
  const maxA = Number(s.attendees_max) || 5000;
  const attendees = v.num(body.attendees, 'العدد التقريبي للحضور', { min: minA, max: maxA, integer: true });

  // الطعام (إلزامي)
  const foodId = v.num(body.food_option_id, 'خيار الطعام', { integer: true, min: 1 });
  const food = get('SELECT * FROM food_options WHERE id = :id AND is_active = 1', { id: foodId });
  if (!food) throw badRequest('يجب اختيار أحد خياري الطعام');

  const userNote = v.str(body.user_note, 'ملاحظات', { required: false, max: 600 });

  const endDate = assertRangeAvailable(startDate, days);

  const booking = transaction(() => {
    const code = generateBookingCode();
    const result = run(
      `INSERT INTO bookings
        (code, user_id, start_date, days, end_date, event_type_id, event_type_name,
         event_type_other, attendees, food_option_id, food_option_slug, food_option_label,
         user_note, status)
       VALUES
        (:code, :uid, :start, :days, :end, :etid, :etname, :etother, :att,
         :fid, :fslug, :flabel, :note, 'pending_review')`,
      {
        code, uid: user.id, start: startDate, days, end: endDate,
        etid: eventType.id, etname: eventType.name, etother: eventTypeOther,
        att: attendees, fid: food.id, fslug: food.slug, flabel: food.label,
        note: userNote,
      }
    );
    const id = Number(result.lastInsertRowid);
    logBookingEvent(id, 'pending_review', 'تم إرسال طلب الحجز', user);
    return recalcBooking(id);
  });

  notifyBookingStatus(booking);
  // إشعار الإدارة
  for (const admin of all(`SELECT id FROM users WHERE role IN ('admin','manager') AND is_active = 1`)) {
    notify(admin.id, 'طلب حجز جديد', `طلب حجز جديد رقم ${booking.code} من ${user.name}.`, {
      type: 'admin', link: `#/bookings/${booking.id}`,
    });
  }

  sendJson(res, 201, { ok: true, booking: hydrateBooking(booking) });
});

// ---------- فحص توفر تاريخ قبل الإرسال ----------

bookingRoutes.post('/check-availability', async (req, res) => {
  requireUser(req);
  const body = await readJson(req);
  const startDate = v.date(body.start_date, 'تاريخ بداية الحجز');
  const days = v.num(body.days, 'عدد الأيام', { min: 1, max: 60, integer: true });
  try {
    const endDate = assertRangeAvailable(startDate, days);
    sendJson(res, 200, { ok: true, available: true, end_date: endDate, dates: v.dateRange(startDate, endDate) });
  } catch (err) {
    if (err.status === 409) {
      return sendJson(res, 200, { ok: true, available: false, message: err.message, conflicts: err.details?.dates || [] });
    }
    throw err;
  }
});

// ---------- موافقة المستخدم على السعر ----------

bookingRoutes.post('/:id/approve', async (req, res, { params }) => {
  const { user, booking } = loadOwned(req, params.id);
  if (booking.user_id !== user.id) throw forbidden('الموافقة تتم من صاحب الحجز فقط');
  if (booking.status !== 'awaiting_user_approval') {
    throw badRequest('لا يمكن الموافقة على هذا الطلب في حالته الحالية');
  }

  const needsDeposit = booking.deposit_amount > 0;
  const nextStatus = needsDeposit ? 'awaiting_deposit' : 'confirmed';
  if (!canTransition(booking.status, nextStatus)) throw badRequest('انتقال غير مسموح');

  run(
    `UPDATE bookings SET status = :st, approved_at = datetime('now'),
            confirmed_at = CASE WHEN :st = 'confirmed' THEN datetime('now') ELSE confirmed_at END,
            updated_at = datetime('now')
      WHERE id = :id`,
    { st: nextStatus, id: booking.id }
  );
  logBookingEvent(booking.id, nextStatus, 'وافق المستخدم على السعر', user);

  const updated = recalcBooking(booking.id);
  issueInvoice(booking.id);
  notifyBookingStatus(updated);
  sendJson(res, 200, { ok: true, booking: hydrateBooking(updated) });
});

// ---------- رفض/إلغاء من المستخدم ----------

bookingRoutes.post('/:id/cancel', async (req, res, { params }) => {
  const { user, booking } = loadOwned(req, params.id);
  if (booking.user_id !== user.id) throw forbidden('الإلغاء يتم من صاحب الحجز فقط');
  if (!USER_CANCELLABLE.includes(booking.status)) {
    throw badRequest('لا يمكن إلغاء الحجز في هذه المرحلة، يرجى التواصل مع الإدارة');
  }
  const body = await readJson(req);
  const reason = v.str(body.reason, 'سبب الإلغاء', { required: false, max: 300 });

  run(`UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = :id`, { id: booking.id });
  logBookingEvent(booking.id, 'cancelled', reason || 'ألغى المستخدم الطلب', user);

  const updated = get('SELECT * FROM bookings WHERE id = :id', { id: booking.id });
  notifyBookingStatus(updated);
  for (const admin of all(`SELECT id FROM users WHERE role IN ('admin','manager') AND is_active = 1`)) {
    notify(admin.id, 'إلغاء حجز', `ألغى ${user.name} طلب الحجز رقم ${booking.code}.`, {
      type: 'admin', link: `#/bookings/${booking.id}`,
    });
  }
  sendJson(res, 200, { ok: true, booking: hydrateBooking(updated) });
});

// ---------- الفاتورة ----------

bookingRoutes.get('/:id/invoice', async (req, res, { params }) => {
  const { booking } = loadOwned(req, params.id);
  if (booking.total <= 0 && booking.daily_price <= 0) {
    throw badRequest('لم يتم تسعير هذا الحجز بعد');
  }
  const invoice = issueInvoice(booking.id);
  const s = getSettings();
  sendJson(res, 200, {
    ok: true,
    invoice: { ...invoice, snapshot: JSON.parse(invoice.snapshot) },
    booking: hydrateBooking(booking, { includeUser: true }),
    settings: {
      site_name: s.site_name, address: s.address, contact_phone: s.contact_phone,
      currency: s.currency, logo_path: s.logo_path,
    },
  });
});

// ---------- تعديل محدود قبل المراجعة ----------

bookingRoutes.patch('/:id', async (req, res, { params }) => {
  const { user, booking } = loadOwned(req, params.id);
  if (booking.user_id !== user.id) throw forbidden();
  if (booking.status !== 'pending_review') {
    throw badRequest('لا يمكن تعديل الطلب بعد بدء مراجعته من الإدارة');
  }
  const body = await readJson(req);
  const s = getSettings();
  const minA = Number(s.attendees_min) || 1;
  const maxA = Number(s.attendees_max) || 5000;
  const attendees = v.num(body.attendees, 'العدد التقريبي للحضور', { min: minA, max: maxA, integer: true });
  const userNote = v.str(body.user_note, 'ملاحظات', { required: false, max: 600 });

  run(
    `UPDATE bookings SET attendees = :a, user_note = :n, updated_at = datetime('now') WHERE id = :id`,
    { a: attendees, n: userNote, id: booking.id }
  );
  logBookingEvent(booking.id, booking.status, 'عدّل المستخدم بيانات الطلب', user);
  sendJson(res, 200, { ok: true, booking: hydrateBooking(get('SELECT * FROM bookings WHERE id = :id', { id: booking.id })) });
});

export { round2 };
