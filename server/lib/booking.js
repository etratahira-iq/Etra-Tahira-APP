// منطق الحجز: الحالات، التوفر، التسعير، الفاتورة، الخط الزمني
import { all, get, run, scalar } from './db.js';
import { addDays, dateRange } from './validate.js';
import { conflict, notFound } from './http.js';
import { getSettings } from './settings.js';

// ---------- الحالات ----------

export const STATUSES = {
  pending_review:         { label: 'قيد المراجعة',            tone: 'warn' },
  pricing:                { label: 'بانتظار تعديل السعر',      tone: 'warn' },
  awaiting_user_approval: { label: 'بانتظار موافقة المستخدم',  tone: 'info' },
  awaiting_deposit:       { label: 'بانتظار العربون',          tone: 'info' },
  deposit_submitted:      { label: 'بانتظار تأكيد العربون',    tone: 'info' },
  deposit_paid:           { label: 'تم دفع العربون',           tone: 'ok' },
  confirmed:              { label: 'تم التأكيد',               tone: 'ok' },
  completed:              { label: 'مكتمل',                    tone: 'ok' },
  cancelled:              { label: 'ملغي',                     tone: 'muted' },
  rejected:               { label: 'مرفوض',                    tone: 'bad' },
};

/** الحالات التي تحجز التاريخ فعلياً (تمنع التعارض) */
export const OCCUPYING_STATUSES = [
  'pending_review', 'pricing', 'awaiting_user_approval',
  'awaiting_deposit', 'deposit_submitted', 'deposit_paid',
  'confirmed', 'completed',
];

/** الانتقالات المسموحة بين الحالات */
const TRANSITIONS = {
  pending_review:         ['pricing', 'awaiting_user_approval', 'rejected', 'cancelled'],
  pricing:                ['awaiting_user_approval', 'rejected', 'cancelled'],
  awaiting_user_approval: ['awaiting_deposit', 'confirmed', 'pricing', 'cancelled', 'rejected'],
  awaiting_deposit:       ['deposit_submitted', 'cancelled', 'rejected'],
  deposit_submitted:      ['deposit_paid', 'awaiting_deposit', 'cancelled', 'rejected'],
  deposit_paid:           ['confirmed', 'completed', 'cancelled'],
  confirmed:              ['completed', 'cancelled'],
  completed:              [],
  cancelled:              [],
  rejected:               [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/** الحالات التي يستطيع المستخدم فيها إلغاء طلبه بنفسه */
export const USER_CANCELLABLE = ['pending_review', 'pricing', 'awaiting_user_approval', 'awaiting_deposit'];

// ---------- الخط الزمني (Timeline) ----------

const TIMELINE_STEPS = [
  { key: 'submitted', label: 'تم إرسال الطلب' },
  { key: 'reviewed',  label: 'تمت مراجعة الطلب' },
  { key: 'priced',    label: 'تم تحديد السعر' },
  { key: 'approved',  label: 'تمت الموافقة' },
  { key: 'deposit',   label: 'دفع العربون' },
  { key: 'locked',    label: 'تم تثبيت الحجز' },
];

const STATUS_PROGRESS = {
  pending_review: 1,
  pricing: 2,
  awaiting_user_approval: 3,
  awaiting_deposit: 4,
  deposit_submitted: 4,
  deposit_paid: 6,
  confirmed: 6,
  completed: 6,
  cancelled: 0,
  rejected: 0,
};

/** يبني خطوات الخط الزمني حسب حالة الحجز */
export function buildTimeline(booking) {
  const done = STATUS_PROGRESS[booking.status] ?? 0;
  const terminated = booking.status === 'cancelled' || booking.status === 'rejected';
  return TIMELINE_STEPS.map((step, i) => {
    const index = i + 1;
    let state = 'todo';
    if (!terminated) {
      if (index < done) state = 'done';
      else if (index === done) state = 'current';
      else if (index === done + 1 && done > 0) state = 'next';
    } else if (index === 1) {
      state = 'done';
    }
    return { ...step, state };
  });
}

// ---------- التوفر ----------

/**
 * يعيد قائمة التواريخ غير المتاحة ضمن نطاق (للاستخدام في واجهة الحجز).
 */
export function unavailableDates(fromISO, toISO, { excludeBookingId = null } = {}) {
  const blocked = all(
    'SELECT date, reason FROM blocked_dates WHERE date BETWEEN :f AND :t',
    { f: fromISO, t: toISO }
  );

  const placeholders = OCCUPYING_STATUSES.map((_, i) => `:s${i}`).join(',');
  const params = { f: fromISO, t: toISO };
  OCCUPYING_STATUSES.forEach((s, i) => { params[`s${i}`] = s; });

  let sql = `SELECT id, start_date, end_date FROM bookings
              WHERE status IN (${placeholders})
                AND start_date <= :t AND end_date >= :f`;
  if (excludeBookingId) {
    sql += ' AND id != :ex';
    params.ex = excludeBookingId;
  }
  const bookings = all(sql, params);

  const map = new Map();
  for (const b of blocked) map.set(b.date, b.reason || 'غير متاح للحجز');
  for (const b of bookings) {
    for (const d of dateRange(b.start_date, b.end_date)) {
      if (d >= fromISO && d <= toISO) map.set(d, 'محجوز');
    }
  }
  return [...map.entries()].map(([date, reason]) => ({ date, reason })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * يتحقق من إمكانية الحجز في النطاق، ويرمي خطأ 409 عند التعارض.
 */
export function assertRangeAvailable(startDate, days, { excludeBookingId = null } = {}) {
  const endDate = addDays(startDate, days - 1);
  const taken = unavailableDates(startDate, endDate, { excludeBookingId });
  if (taken.length) {
    const list = taken.map((t) => t.date).join('، ');
    throw conflict(
      `هذا التاريخ غير متاح للحجز، يرجى اختيار تاريخ آخر. التواريخ غير المتاحة: ${list}`,
      { dates: taken }
    );
  }
  return endDate;
}

// ---------- التسعير ----------

/**
 * يعيد حساب مبالغ الحجز ويحدّث الصف.
 * subtotal = سعر اليوم × عدد الأيام ، total = subtotal + تكلفة الطعام
 */
export function recalcBooking(bookingId) {
  const b = get('SELECT * FROM bookings WHERE id = :id', { id: bookingId });
  if (!b) throw notFound('الحجز غير موجود');

  const subtotal = round2(b.daily_price * b.days);
  const foodCost = b.food_option_slug === 'kitchen' ? round2(b.food_cost) : 0;
  const total = round2(subtotal + foodCost);
  const paid = round2(
    scalar(
      `SELECT COALESCE(SUM(amount),0) FROM payments WHERE booking_id = :id AND status = 'accepted'`,
      { id: bookingId }
    ) || 0
  );
  const remaining = round2(Math.max(0, total - paid));

  run(
    `UPDATE bookings SET subtotal = :st, food_cost = :fc, total = :tt,
            deposit_paid = :dp, remaining = :rem, updated_at = datetime('now')
      WHERE id = :id`,
    { st: subtotal, fc: foodCost, tt: total, dp: paid, rem: remaining, id: bookingId }
  );

  syncBookingItems(bookingId);
  return get('SELECT * FROM bookings WHERE id = :id', { id: bookingId });
}

/** يحدّث بنود الفاتورة لتطابق الحجز */
function syncBookingItems(bookingId) {
  const b = get('SELECT * FROM bookings WHERE id = :id', { id: bookingId });
  run('DELETE FROM booking_items WHERE booking_id = :id', { id: bookingId });
  run(
    `INSERT INTO booking_items (booking_id, label, qty, unit_price, amount, sort_order)
     VALUES (:id, :label, :qty, :unit, :amount, 1)`,
    {
      id: bookingId,
      label: `حجز الحسينية (${daysLabel(b.days)})`,
      qty: b.days,
      unit: b.daily_price,
      amount: b.subtotal,
    }
  );
  if (b.food_cost > 0) {
    run(
      `INSERT INTO booking_items (booking_id, label, qty, unit_price, amount, sort_order)
       VALUES (:id, 'تكلفة الطعام — مطبخ الحسينية', 1, :amount, :amount, 2)`,
      { id: bookingId, amount: b.food_cost }
    );
  }
}

/** تصريف عربي صحيح لعدد الأيام: يوم واحد / يومان / 3 أيام / 11 يوماً */
export function daysLabel(n) {
  const c = Number(n) || 0;
  if (c === 1) return 'يوم واحد';
  if (c === 2) return 'يومان';
  if (c >= 3 && c <= 10) return `${c} أيام`;
  return `${c} يوماً`;
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ---------- الخط الزمني في قاعدة البيانات ----------

export function logBookingEvent(bookingId, status, note = '', actor = null) {
  run(
    `INSERT INTO booking_events (booking_id, status, note, actor_id, actor_role)
     VALUES (:b, :s, :n, :a, :r)`,
    { b: bookingId, s: status, n: note, a: actor?.id ?? null, r: actor?.role || 'system' }
  );
}

// ---------- الفاتورة ----------

export function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const count = (scalar('SELECT COUNT(*) FROM invoices') || 0) + 1;
  return `INV-${year}-${String(count).padStart(4, '0')}`;
}

export function generateBookingCode() {
  const year = new Date().getFullYear();
  const count = (scalar('SELECT COUNT(*) FROM bookings') || 0) + 1;
  return `BK-${year}-${String(count).padStart(4, '0')}`;
}

/** ينشئ/يحدّث فاتورة الحجز ويعيد نسخة كاملة منها */
export function issueInvoice(bookingId) {
  const booking = get('SELECT * FROM bookings WHERE id = :id', { id: bookingId });
  if (!booking) throw notFound('الحجز غير موجود');
  const user = get('SELECT id, name, phone FROM users WHERE id = :id', { id: booking.user_id });
  const items = all('SELECT * FROM booking_items WHERE booking_id = :id ORDER BY sort_order', { id: bookingId });
  const settings = getSettings();

  const snapshot = {
    site_name: settings.site_name,
    address: settings.address,
    phone: settings.contact_phone,
    currency: settings.currency,
    customer: { name: user?.name || '', phone: user?.phone || '' },
    booking: {
      code: booking.code,
      start_date: booking.start_date,
      end_date: booking.end_date,
      days: booking.days,
      attendees: booking.attendees,
      event_type: booking.event_type_other || booking.event_type_name,
      food_option: booking.food_option_label,
    },
    items: items.map((i) => ({ label: i.label, qty: i.qty, unit_price: i.unit_price, amount: i.amount })),
    totals: {
      subtotal: booking.subtotal,
      food_cost: booking.food_cost,
      total: booking.total,
      deposit_amount: booking.deposit_amount,
      deposit_paid: booking.deposit_paid,
      remaining: booking.remaining,
    },
  };

  const existing = get('SELECT * FROM invoices WHERE booking_id = :id', { id: bookingId });
  if (existing) {
    run(
      `UPDATE invoices SET snapshot = :s, issued_at = datetime('now') WHERE booking_id = :id`,
      { s: JSON.stringify(snapshot), id: bookingId }
    );
    return get('SELECT * FROM invoices WHERE booking_id = :id', { id: bookingId });
  }

  const number = generateInvoiceNumber();
  run(
    `INSERT INTO invoices (booking_id, number, snapshot) VALUES (:b, :n, :s)`,
    { b: bookingId, n: number, s: JSON.stringify(snapshot) }
  );
  return get('SELECT * FROM invoices WHERE booking_id = :id', { id: bookingId });
}

// ---------- التجميع للعرض ----------

/** يبني كائن الحجز الكامل المرسل للواجهة */
export function hydrateBooking(booking, { includeUser = false } = {}) {
  if (!booking) return null;
  const events = all(
    'SELECT * FROM booking_events WHERE booking_id = :id ORDER BY id ASC',
    { id: booking.id }
  );
  const items = all('SELECT * FROM booking_items WHERE booking_id = :id ORDER BY sort_order', { id: booking.id });
  const payments = all(
    `SELECT id, method_name, amount, reference, receipt_path, status, admin_note, created_at, reviewed_at
       FROM payments WHERE booking_id = :id ORDER BY id DESC`,
    { id: booking.id }
  );
  const invoice = get('SELECT * FROM invoices WHERE booking_id = :id', { id: booking.id });

  const out = {
    ...booking,
    status_label: STATUSES[booking.status]?.label || booking.status,
    status_tone: STATUSES[booking.status]?.tone || 'muted',
    event_type_display: booking.event_type_other || booking.event_type_name,
    timeline: buildTimeline(booking),
    history: events.map((e) => ({
      ...e,
      label: STATUSES[e.status]?.label || e.status,
    })),
    items,
    payments,
    invoice: invoice ? { ...invoice, snapshot: safeParse(invoice.snapshot) } : null,
    can_cancel: USER_CANCELLABLE.includes(booking.status),
    can_approve: booking.status === 'awaiting_user_approval',
    can_pay_deposit: booking.status === 'awaiting_deposit'
      || (booking.status === 'deposit_submitted' && payments.some((p) => p.status === 'resend')),
  };

  if (includeUser) {
    const u = get('SELECT id, name, phone, role FROM users WHERE id = :id', { id: booking.user_id });
    out.user = u || null;
  }
  return out;
}

function safeParse(json) {
  try { return JSON.parse(json); } catch { return {}; }
}
