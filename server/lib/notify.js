// نظام الإشعارات داخل التطبيق
import { run, all, get, scalar } from './db.js';

/**
 * ينشئ إشعاراً لمستخدم محدد. userId = null يعني إشعاراً عاماً لكل المستخدمين.
 */
export function notify(userId, title, body = '', { type = 'general', link = '' } = {}) {
  run(
    `INSERT INTO notifications (user_id, title, body, type, link)
     VALUES (:u, :t, :b, :ty, :l)`,
    { u: userId ?? null, t: title, b: body, ty: type, l: link }
  );
}

/** إشعار عام لجميع المستخدمين */
export function broadcast(title, body = '', opts = {}) {
  notify(null, title, body, { ...opts, type: opts.type || 'announcement' });
}

export function listForUser(userId, { limit = 50, offset = 0 } = {}) {
  return all(
    `SELECT * FROM notifications
      WHERE user_id = :u OR user_id IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT :lim OFFSET :off`,
    { u: userId, lim: limit, off: offset }
  );
}

export function unreadCount(userId) {
  return scalar(
    `SELECT COUNT(*) FROM notifications
      WHERE (user_id = :u OR user_id IS NULL) AND is_read = 0`,
    { u: userId }
  ) || 0;
}

export function markRead(userId, id) {
  const row = get('SELECT user_id FROM notifications WHERE id = :id', { id });
  if (!row) return false;
  // الإشعارات العامة تُعلَّم مقروءة للجميع (نموذج مبسّط ومقبول لهذا الحجم)
  if (row.user_id !== null && row.user_id !== userId) return false;
  run('UPDATE notifications SET is_read = 1 WHERE id = :id', { id });
  return true;
}

export function markAllRead(userId) {
  run(
    'UPDATE notifications SET is_read = 1 WHERE user_id = :u OR user_id IS NULL',
    { u: userId }
  );
}

// ---------- قوالب إشعارات الحجز ----------

export const BOOKING_NOTIFICATIONS = {
  pending_review: (b) => ['تم استلام طلب الحجز', `طلبك رقم ${b.code} قيد المراجعة من قبل الإدارة.`],
  pricing: (b) => ['جارٍ تسعير طلبك', `بدأت الإدارة بمراجعة وتسعير طلب الحجز رقم ${b.code}.`],
  awaiting_user_approval: (b) => ['تم تحديد سعر الحجز', `تمت مراجعة طلب الحجز رقم ${b.code}، يرجى الاطلاع على الفاتورة والموافقة عليها.`],
  awaiting_deposit: (b) => ['بانتظار دفع العربون', `يرجى دفع العربون لتثبيت الحجز رقم ${b.code}.`],
  deposit_submitted: (b) => ['تم استلام وصل الدفع', `تم استلام وصل عربون الحجز رقم ${b.code} وهو بانتظار التأكيد.`],
  deposit_paid: (b) => ['تم تثبيت الحجز', `تم تأكيد العربون وتثبيت الحجز رقم ${b.code}.`],
  confirmed: (b) => ['تم تأكيد الحجز', `تم تأكيد حجزك رقم ${b.code}. نسأل الله أن يتقبل منكم.`],
  completed: (b) => ['اكتمل الحجز', `تم إكمال الحجز رقم ${b.code}. شكراً لثقتكم.`],
  cancelled: (b) => ['تم إلغاء الحجز', `تم إلغاء طلب الحجز رقم ${b.code}.`],
  rejected: (b) => ['تم رفض طلب الحجز', `نعتذر، تم رفض طلب الحجز رقم ${b.code}. يمكنك التواصل مع الإدارة للاستفسار.`],
};

export function notifyBookingStatus(booking, extraNote = '') {
  const tpl = BOOKING_NOTIFICATIONS[booking.status];
  if (!tpl) return;
  const [title, body] = tpl(booking);
  notify(booking.user_id, title, extraNote ? `${body}\n${extraNote}` : body, {
    type: 'booking',
    link: `#/booking/${booking.id}`,
  });
}
