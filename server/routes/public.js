// المسارات العامة: محتوى الصفحة الرئيسية، المحاضرات، المناسبات، المعرض، المفقودات، التبرعات
import { Router, sendJson, notFound } from '../lib/http.js';
import { all, get } from '../lib/db.js';
import { getSettings, detectDefaultLogo, detectRasterLogo } from '../lib/settings.js';
import { todayISO } from '../lib/validate.js';
import { displayWindow, formatHijri, formatGregorian, weekdayAr } from '../lib/hijri.js';
import { unavailableDates } from '../lib/booking.js';

export const publicRoutes = new Router();

// ---------- مساعدات ----------

function withDates(row, dateField) {
  const iso = row[dateField];
  return {
    ...row,
    date_iso: iso,
    date_hijri: formatHijri(iso),
    date_hijri_short: formatHijri(iso, { withYear: false }),
    date_gregorian: formatGregorian(iso),
    weekday: weekdayAr(iso),
  };
}

const activeAds = (placement) => all(
  `SELECT * FROM advertisements
    WHERE is_active = 1
      AND (placement = :p OR placement = 'both')
      AND (start_date IS NULL OR start_date = '' OR start_date <= date('now'))
      AND (end_date   IS NULL OR end_date   = '' OR end_date   >= date('now'))
    ORDER BY sort_order, id DESC`,
  { p: placement }
);

function publicPaymentMethods(scope) {
  return all(
    `SELECT id, name, slug, account_number, account_name, instructions, usage_scope
       FROM payment_methods
      WHERE is_active = 1 AND (usage_scope = :s OR usage_scope = 'both')
      ORDER BY sort_order, id`,
    { s: scope }
  );
}

// ---------- الإعدادات العامة (للهيدر والفوتر) ----------

publicRoutes.get('/settings', async (req, res) => {
  const s = getSettings();
  sendJson(res, 200, {
    ok: true,
    settings: { ...s, default_logo: detectDefaultLogo(), default_logo_raster: detectRasterLogo() },
    social: all('SELECT platform, label, url FROM social_links WHERE is_active = 1 ORDER BY sort_order, id'),
  });
});

// ---------- الصفحة الرئيسية ----------

publicRoutes.get('/home', async (req, res) => {
  const s = getSettings();
  const today = todayISO();

  // المحاضرة القادمة: أقرب محاضرة مُعلَّمة للظهور
  const upcomingLecture = get(
    `SELECT * FROM lectures
      WHERE is_published = 1 AND show_in_upcoming = 1 AND lecture_date >= :t
      ORDER BY lecture_date ASC, lecture_time ASC LIMIT 1`,
    { t: today }
  );

  const lectures = all(
    `SELECT * FROM lectures WHERE is_published = 1
      ORDER BY (lecture_date >= :t) DESC,
               CASE WHEN lecture_date >= :t THEN lecture_date END ASC,
               CASE WHEN lecture_date <  :t THEN lecture_date END DESC
      LIMIT 6`,
    { t: today }
  );

  const events = all(
    `SELECT * FROM events WHERE is_published = 1 AND event_date >= :t
      ORDER BY event_date ASC LIMIT 6`,
    { t: today }
  );

  sendJson(res, 200, {
    ok: true,
    settings: { ...s, default_logo: detectDefaultLogo(), default_logo_raster: detectRasterLogo() },
    social: all('SELECT platform, label, url FROM social_links WHERE is_active = 1 ORDER BY sort_order, id'),
    upcoming_lecture: upcomingLecture ? withDates(upcomingLecture, 'lecture_date') : null,
    lectures: lectures.map((l) => withDates(l, 'lecture_date')),
    events: events.map((e) => withDates(e, 'event_date')),
    gallery: all('SELECT * FROM gallery ORDER BY is_cover DESC, sort_order, id DESC LIMIT 12'),
    ads: activeAds('home'),
    donation_campaigns: all('SELECT * FROM donation_campaigns WHERE is_active = 1 ORDER BY sort_order, id LIMIT 3'),
    lost_found_count: all(`SELECT id FROM lost_found WHERE is_published = 1 AND status = 'available'`).length,
  });
});

// ---------- مناسبات ومحاضرات الشهر (الحالي أو القادم فقط) ----------

publicRoutes.get('/calendar', async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const offset = url.searchParams.get('offset') === '1' ? 1 : 0;
  const today = todayISO();

  const current = displayWindow(today, 0);
  const next = displayWindow(today, 1);
  const win = offset === 1 ? next : current;

  const lectures = all(
    `SELECT * FROM lectures
      WHERE is_published = 1 AND show_in_calendar = 1
        AND lecture_date BETWEEN :from AND :to
      ORDER BY lecture_date ASC, lecture_time ASC`,
    { from: win.start, to: win.end }
  ).map((l) => ({ ...withDates(l, 'lecture_date'), kind: 'lecture' }));

  const events = all(
    `SELECT * FROM events
      WHERE is_published = 1 AND show_in_calendar = 1
        AND event_date BETWEEN :from AND :to
      ORDER BY event_date ASC, event_time ASC`,
    { from: win.start, to: win.end }
  ).map((e) => ({ ...withDates(e, 'event_date'), kind: 'event' }));

  const items = [...lectures, ...events].sort((a, b) => {
    if (a.date_iso !== b.date_iso) return a.date_iso.localeCompare(b.date_iso);
    return String(a.lecture_time || a.event_time || '').localeCompare(String(b.lecture_time || b.event_time || ''));
  });

  // المستخدم يرى القادم فقط ضمن الشهر الحالي
  const visible = offset === 0 ? items.filter((i) => i.date_iso >= today) : items;

  sendJson(res, 200, {
    ok: true,
    offset,
    window: win,
    months: { current: current.label, next: next.label },
    today,
    items: visible,
  });
});

// ---------- المحاضرات ----------

publicRoutes.get('/lectures', async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const q = (url.searchParams.get('q') || '').trim();
  const occasion = (url.searchParams.get('occasion') || '').trim();
  const speaker = (url.searchParams.get('speaker') || '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const perPage = 9;

  const where = ['is_published = 1'];
  const params = {};
  if (q) {
    where.push('(title LIKE :q OR speaker LIKE :q OR reciter LIKE :q OR description LIKE :q OR majlis_name LIKE :q)');
    params.q = `%${q}%`;
  }
  if (occasion) { where.push('occasion = :occ'); params.occ = occasion; }
  if (speaker) { where.push('speaker = :sp'); params.sp = speaker; }

  const clause = where.join(' AND ');
  const total = all(`SELECT id FROM lectures WHERE ${clause}`, params).length;
  const rows = all(
    `SELECT * FROM lectures WHERE ${clause}
      ORDER BY lecture_date DESC, id DESC LIMIT :lim OFFSET :off`,
    { ...params, lim: perPage, off: (page - 1) * perPage }
  );

  sendJson(res, 200, {
    ok: true,
    total,
    page,
    per_page: perPage,
    pages: Math.max(1, Math.ceil(total / perPage)),
    items: rows.map((l) => withDates(l, 'lecture_date')),
    occasions: all(`SELECT DISTINCT occasion FROM lectures WHERE occasion != '' AND is_published = 1 ORDER BY occasion`)
      .map((r) => r.occasion),
    speakers: all(`SELECT DISTINCT speaker FROM lectures WHERE speaker != '' AND is_published = 1 ORDER BY speaker`)
      .map((r) => r.speaker),
  });
});

publicRoutes.get('/lectures/:id', async (req, res, { params }) => {
  const row = get('SELECT * FROM lectures WHERE id = :id AND is_published = 1', { id: params.id });
  if (!row) throw notFound('المحاضرة غير موجودة');
  const related = all(
    `SELECT * FROM lectures
      WHERE is_published = 1 AND id != :id
        AND (occasion = :occ OR speaker = :sp OR (reciter != '' AND reciter = :rc))
      ORDER BY lecture_date DESC LIMIT 3`,
    { id: row.id, occ: row.occasion, sp: row.speaker, rc: row.reciter }
  );
  sendJson(res, 200, {
    ok: true,
    lecture: withDates(row, 'lecture_date'),
    related: related.map((l) => withDates(l, 'lecture_date')),
    settings: getSettings(),
  });
});

// ---------- المناسبات ----------

publicRoutes.get('/events', async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const q = (url.searchParams.get('q') || '').trim();
  const where = ['is_published = 1'];
  const params = {};
  if (q) {
    where.push('(title LIKE :q OR description LIKE :q OR speaker LIKE :q OR kind LIKE :q)');
    params.q = `%${q}%`;
  }
  const rows = all(
    `SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY event_date DESC LIMIT 60`,
    params
  );
  sendJson(res, 200, { ok: true, items: rows.map((e) => withDates(e, 'event_date')) });
});

publicRoutes.get('/events/:id', async (req, res, { params }) => {
  const row = get('SELECT * FROM events WHERE id = :id AND is_published = 1', { id: params.id });
  if (!row) throw notFound('المناسبة غير موجودة');
  sendJson(res, 200, { ok: true, event: withDates(row, 'event_date'), settings: getSettings() });
});

// ---------- معرض الصور ----------

publicRoutes.get('/gallery', async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const category = url.searchParams.get('category');
  const rows = category && category !== 'all'
    ? all('SELECT * FROM gallery WHERE category = :c ORDER BY sort_order, id DESC', { c: category })
    : all('SELECT * FROM gallery ORDER BY sort_order, id DESC');
  sendJson(res, 200, { ok: true, items: rows });
});

// ---------- المفقودات ----------

publicRoutes.get('/lost-found', async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const q = (url.searchParams.get('q') || '').trim();
  const status = (url.searchParams.get('status') || '').trim();

  const where = ['is_published = 1'];
  const params = {};
  if (q) { where.push('(item_name LIKE :q OR description LIKE :q)'); params.q = `%${q}%`; }
  if (status === 'available' || status === 'delivered') { where.push('status = :st'); params.st = status; }

  const rows = all(
    `SELECT id, item_name, description, image_path, found_place, show_place, found_date, status, delivered_at
       FROM lost_found WHERE ${where.join(' AND ')} ORDER BY found_date DESC, id DESC LIMIT 100`,
    params
  );

  // لا تُعرض بيانات داخلية، ومكان العثور يُخفى إذا اختار المشرف ذلك
  const items = rows.map((r) => ({
    ...r,
    found_place: r.show_place ? r.found_place : '',
    found_date_hijri: formatHijri(r.found_date, { withYear: false }),
    found_date_gregorian: formatGregorian(r.found_date),
  }));
  sendJson(res, 200, { ok: true, items });
});

// ---------- التبرعات ----------

publicRoutes.get('/donations', async (req, res) => {
  const s = getSettings();
  sendJson(res, 200, {
    ok: true,
    settings: {
      donation_title: s.donation_title,
      donation_text: s.donation_text,
      donation_image: s.donation_image,
      currency: s.currency,
    },
    campaigns: all('SELECT * FROM donation_campaigns WHERE is_active = 1 ORDER BY sort_order, id'),
    methods: publicPaymentMethods('donation'),
    ads: activeAds('donations'),
  });
});

// ---------- طرق دفع العربون ----------

publicRoutes.get('/payment-methods', async (req, res) => {
  sendJson(res, 200, {
    ok: true,
    methods: publicPaymentMethods('deposit'),
    instructions: getSettings().deposit_instructions,
  });
});

// ---------- خيارات نموذج الحجز ----------

publicRoutes.get('/booking-options', async (req, res) => {
  const s = getSettings();
  const today = todayISO();
  const horizon = new Date(today + 'T00:00:00Z');
  horizon.setUTCDate(horizon.getUTCDate() + 365);

  sendJson(res, 200, {
    ok: true,
    event_types: all('SELECT id, name, slug, allows_custom_text FROM event_types WHERE is_active = 1 ORDER BY sort_order, id'),
    food_options: all('SELECT id, slug, label, description, has_cost FROM food_options WHERE is_active = 1 ORDER BY sort_order, id'),
    attendees: {
      min: Number(s.attendees_min) || 1,
      max: Number(s.attendees_max) || 1000,
      default: Number(s.attendees_default) || Number(s.attendees_min) || 150,
    },
    limits: {
      max_days: Number(s.booking_max_days) || 10,
      min_lead_days: Number(s.booking_min_lead_days) || 0,
      today,
    },
    notice: s.booking_notice,
    unavailable: unavailableDates(today, horizon.toISOString().slice(0, 10)),
  });
});

// ---------- الإعلانات ----------

publicRoutes.get('/ads', async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const placement = url.searchParams.get('placement') === 'donations' ? 'donations' : 'home';
  sendJson(res, 200, { ok: true, items: activeAds(placement) });
});
