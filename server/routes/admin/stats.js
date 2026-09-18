// الإحصائيات والتقارير
import { Router, sendJson } from '../../lib/http.js';
import { all, get, scalar } from '../../lib/db.js';
import { requireRole } from '../../lib/auth.js';
import { todayISO, addDays } from '../../lib/validate.js';
import { STATUSES, OCCUPYING_STATUSES } from '../../lib/booking.js';
import { getSettings } from '../../lib/settings.js';

export const adminStatsRoutes = new Router();

const REVENUE_STATUSES = ['deposit_paid', 'confirmed', 'completed'];

function inList(values, prefix) {
  const keys = values.map((_, i) => `:${prefix}${i}`).join(',');
  const params = {};
  values.forEach((v_, i) => { params[`${prefix}${i}`] = v_; });
  return { keys, params };
}

// ---------- لوحة الإحصائيات ----------

adminStatsRoutes.get('/stats', async (req, res) => {
  requireRole(req, 'admin');
  const today = todayISO();
  const occ = inList(OCCUPYING_STATUSES, 'o');
  const rev = inList(REVENUE_STATUSES, 'r');

  const stats = {
    bookings_total: scalar('SELECT COUNT(*) FROM bookings') || 0,
    bookings_pending: scalar(`SELECT COUNT(*) FROM bookings WHERE status IN ('pending_review','pricing')`) || 0,
    bookings_awaiting_user: scalar(`SELECT COUNT(*) FROM bookings WHERE status = 'awaiting_user_approval'`) || 0,
    bookings_awaiting_deposit: scalar(`SELECT COUNT(*) FROM bookings WHERE status IN ('awaiting_deposit','deposit_submitted')`) || 0,
    bookings_confirmed: scalar(`SELECT COUNT(*) FROM bookings WHERE status IN ('deposit_paid','confirmed','completed')`) || 0,
    bookings_upcoming: scalar(
      `SELECT COUNT(*) FROM bookings WHERE start_date >= :t AND status IN (${occ.keys})`,
      { t: today, ...occ.params }
    ) || 0,
    bookings_cancelled: scalar(`SELECT COUNT(*) FROM bookings WHERE status IN ('cancelled','rejected')`) || 0,
    users_total: scalar(`SELECT COUNT(*) FROM users WHERE role = 'user'`) || 0,
    staff_total: scalar(`SELECT COUNT(*) FROM users WHERE role IN ('admin','manager')`) || 0,
    donations_count: scalar('SELECT COUNT(*) FROM donations') || 0,
    donations_total: scalar('SELECT COALESCE(SUM(amount),0) FROM donations') || 0,
    lost_found_total: scalar('SELECT COUNT(*) FROM lost_found') || 0,
    lost_found_available: scalar(`SELECT COUNT(*) FROM lost_found WHERE status = 'available'`) || 0,
    lectures_total: scalar('SELECT COUNT(*) FROM lectures') || 0,
    events_total: scalar('SELECT COUNT(*) FROM events') || 0,
    revenue_total: scalar(
      `SELECT COALESCE(SUM(total),0) FROM bookings WHERE status IN (${rev.keys})`, rev.params
    ) || 0,
    deposits_total: scalar(`SELECT COALESCE(SUM(amount),0) FROM payments WHERE status = 'accepted'`) || 0,
    remaining_total: scalar(
      `SELECT COALESCE(SUM(remaining),0) FROM bookings WHERE status IN (${rev.keys})`, rev.params
    ) || 0,
    payments_pending: scalar(`SELECT COUNT(*) FROM payments WHERE status = 'pending'`) || 0,
  };

  const recentBookings = all(
    `SELECT b.id, b.code, b.status, b.start_date, b.end_date, b.total, b.created_at,
            u.name AS user_name, u.phone AS user_phone
       FROM bookings b JOIN users u ON u.id = b.user_id
      ORDER BY b.id DESC LIMIT 8`
  ).map((b) => ({ ...b, status_label: STATUSES[b.status]?.label || b.status, status_tone: STATUSES[b.status]?.tone }));

  const upcoming = all(
    `SELECT b.id, b.code, b.start_date, b.end_date, b.status, b.event_type_name, b.event_type_other,
            u.name AS user_name
       FROM bookings b JOIN users u ON u.id = b.user_id
      WHERE b.start_date >= :t AND b.status IN (${occ.keys})
      ORDER BY b.start_date ASC LIMIT 8`,
    { t: today, ...occ.params }
  ).map((b) => ({ ...b, status_label: STATUSES[b.status]?.label || b.status }));

  sendJson(res, 200, {
    ok: true,
    stats,
    recent_bookings: recentBookings,
    upcoming_bookings: upcoming,
    pending_payments: all(
      `SELECT p.*, b.code AS booking_code, u.name AS user_name
         FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN users u ON u.id = p.user_id
        WHERE p.status = 'pending' ORDER BY p.id DESC LIMIT 8`
    ),
    currency: getSettings().currency,
  });
});

// ---------- التقارير ----------

adminStatsRoutes.get('/reports', async (req, res) => {
  requireRole(req, 'admin');
  const url = new URL(req.url, 'http://x');
  const to = url.searchParams.get('to') || todayISO();
  const from = url.searchParams.get('from') || addDays(to, -365);
  const rev = inList(REVENUE_STATUSES, 'r');
  const range = { from, to };

  // الحجوزات حسب الشهر الميلادي
  const byMonth = all(
    `SELECT substr(start_date, 1, 7) AS month,
            COUNT(*) AS count,
            COALESCE(SUM(total),0) AS total,
            COALESCE(SUM(deposit_paid),0) AS deposits,
            COALESCE(SUM(remaining),0) AS remaining,
            COALESCE(SUM(food_cost),0) AS food
       FROM bookings
      WHERE start_date BETWEEN :from AND :to
      GROUP BY month ORDER BY month`,
    range
  );

  const byStatus = all(
    `SELECT status, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
       FROM bookings WHERE created_at BETWEEN :from AND :to || ' 23:59:59'
      GROUP BY status ORDER BY count DESC`,
    range
  ).map((r) => ({ ...r, label: STATUSES[r.status]?.label || r.status }));

  const byEventType = all(
    `SELECT CASE WHEN event_type_other != '' THEN event_type_other ELSE event_type_name END AS type,
            COUNT(*) AS count, COALESCE(SUM(total),0) AS total
       FROM bookings WHERE start_date BETWEEN :from AND :to
      GROUP BY type ORDER BY count DESC`,
    range
  );

  const donationsByMonth = all(
    `SELECT substr(donated_at, 1, 7) AS month, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
       FROM donations WHERE donated_at BETWEEN :from AND :to
      GROUP BY month ORDER BY month`,
    range
  );

  const totals = get(
    `SELECT COUNT(*) AS bookings,
            COALESCE(SUM(total),0) AS revenue,
            COALESCE(SUM(deposit_paid),0) AS deposits,
            COALESCE(SUM(remaining),0) AS remaining,
            COALESCE(SUM(food_cost),0) AS food_cost,
            COALESCE(SUM(days),0) AS days
       FROM bookings
      WHERE start_date BETWEEN :from AND :to AND status IN (${rev.keys})`,
    { ...range, ...rev.params }
  );

  sendJson(res, 200, {
    ok: true,
    range,
    totals: {
      ...totals,
      donations: scalar(
        'SELECT COALESCE(SUM(amount),0) FROM donations WHERE donated_at BETWEEN :from AND :to', range
      ) || 0,
      donations_count: scalar(
        'SELECT COUNT(*) FROM donations WHERE donated_at BETWEEN :from AND :to', range
      ) || 0,
      all_bookings: scalar(
        'SELECT COUNT(*) FROM bookings WHERE start_date BETWEEN :from AND :to', range
      ) || 0,
    },
    by_month: byMonth,
    by_status: byStatus,
    by_event_type: byEventType,
    donations_by_month: donationsByMonth,
    currency: getSettings().currency,
  });
});
