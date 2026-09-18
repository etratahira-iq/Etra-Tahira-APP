// بيانات تجريبية — كلها وهمية، لا تحتوي أي أرقام أو حسابات حقيقية
import { db, migrate, run, get, all } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
import { ensureDefaults, setSettings } from '../lib/settings.js';
import { addDays, todayISO } from '../lib/validate.js';
import { recalcBooking, logBookingEvent, issueInvoice, generateBookingCode } from '../lib/booking.js';
import { notify } from '../lib/notify.js';

const RESET = process.argv.includes('--reset');

const TABLES = [
  'booking_events', 'booking_items', 'invoices', 'payments', 'bookings',
  'notifications', 'sessions', 'blocked_dates', 'lectures', 'events',
  'gallery', 'lost_found', 'advertisements', 'donations', 'donation_campaigns',
  'payment_methods', 'social_links', 'event_types', 'food_options',
  'rate_limits', 'settings', 'users',
];

migrate();

if (RESET) {
  db.exec('PRAGMA foreign_keys = OFF;');
  for (const t of TABLES) db.exec(`DELETE FROM ${t};`);
  db.exec(`DELETE FROM sqlite_sequence;`);
  db.exec('PRAGMA foreign_keys = ON;');
  console.log('• تم مسح البيانات السابقة');
}

ensureDefaults();

const today = todayISO();

// ============ المستخدمون ============

function createUser(name, phone, password, role = 'user') {
  const existing = get('SELECT * FROM users WHERE phone = :p', { p: phone });
  if (existing) return existing;
  const { hash, salt } = hashPassword(password);
  const r = run(
    `INSERT INTO users (phone, name, password_hash, password_salt, role) VALUES (:p, :n, :h, :s, :r)`,
    { p: phone, n: name, h: hash, s: salt, r: role }
  );
  return get('SELECT * FROM users WHERE id = :id', { id: Number(r.lastInsertRowid) });
}

const manager = createUser('مدير النظام', '07700000001', 'admin1234', 'manager');
const admin = createUser('مشرف الحسينية', '07700000002', 'admin1234', 'admin');
const user1 = createUser('أبو علي الموسوي', '07700000010', 'user1234', 'user');
const user2 = createUser('حيدر الكعبي', '07700000011', 'user1234', 'user');
const user3 = createUser('كاظم الجابري', '07700000012', 'user1234', 'user');

// ============ الإعدادات (Placeholder فقط) ============

setSettings({
  address: 'العنوان يُحدَّد من لوحة التحكم — الإعدادات العامة',
  maps_url: '',
  contact_phone: '',
  whatsapp_number: '',
  contact_email: '',
});

// ============ أنواع المناسبات ============

const EVENT_TYPES = [
  { name: 'مجلس', slug: 'majlis', allows_custom_text: 0, sort_order: 1 },
  { name: 'مولود', slug: 'mawlid', allows_custom_text: 0, sort_order: 2 },
  { name: 'فاتحة', slug: 'fatiha', allows_custom_text: 0, sort_order: 3 },
  { name: 'أخرى', slug: 'other', allows_custom_text: 1, sort_order: 4 },
];
for (const t of EVENT_TYPES) {
  run(
    `INSERT INTO event_types (name, slug, allows_custom_text, sort_order, is_active)
     VALUES (:name, :slug, :allows_custom_text, :sort_order, 1)
     ON CONFLICT(slug) DO UPDATE SET name = :name, sort_order = :sort_order`,
    t
  );
}

// ============ خيارات الطعام ============

const FOOD_OPTIONS = [
  {
    slug: 'host', label: 'الطعام على صاحب المجلس', has_cost: 0, sort_order: 1,
    description: 'يتولى صاحب المناسبة تجهيز الطعام وتوفيره بنفسه، ولا تُضاف أي تكلفة طعام إلى الفاتورة.',
  },
  {
    slug: 'kitchen', label: 'الطعام من مطبخ الحسينية', has_cost: 1, sort_order: 2,
    description: 'يتم إعداد وتجهيز الطعام من قبل القائمين على مطبخ الحسينية وفق الكمية المتفق عليها، وتُضاف تكلفته إلى الفاتورة.',
  },
];
for (const f of FOOD_OPTIONS) {
  run(
    `INSERT INTO food_options (slug, label, description, has_cost, sort_order, is_active)
     VALUES (:slug, :label, :description, :has_cost, :sort_order, 1)
     ON CONFLICT(slug) DO UPDATE SET label = :label, description = :description, has_cost = :has_cost`,
    f
  );
}

// ============ طرق الدفع (أرقام وهمية — تُعدَّل من لوحة التحكم) ============

const METHODS = [
  {
    name: 'كي كارد', slug: 'qicard', account_number: '0000-0000-0000-0000',
    account_name: 'اسم الحساب يُحدَّد من لوحة التحكم',
    instructions: 'يرجى التحويل إلى رقم البطاقة أعلاه ثم إرفاق صورة وصل التحويل.',
    usage_scope: 'both', sort_order: 1,
  },
  {
    name: 'زين كاش', slug: 'zaincash', account_number: '0000000000',
    account_name: 'اسم الحساب يُحدَّد من لوحة التحكم',
    instructions: 'أرسل المبلغ عبر تطبيق زين كاش إلى الرقم أعلاه ثم أرفق صورة الوصل.',
    usage_scope: 'both', sort_order: 2,
  },
  {
    name: 'تحويل رصيد', slug: 'balance', account_number: '0000000000',
    account_name: '',
    instructions: 'يمكن تحويل الرصيد إلى الرقم أعلاه، ثم إرفاق صورة رسالة التحويل.',
    usage_scope: 'both', sort_order: 3,
  },
];
for (const m of METHODS) {
  run(
    `INSERT INTO payment_methods (name, slug, account_number, account_name, instructions, usage_scope, sort_order, is_active)
     VALUES (:name, :slug, :account_number, :account_name, :instructions, :usage_scope, :sort_order, 1)
     ON CONFLICT(slug) DO UPDATE SET name = :name, instructions = :instructions`,
    m
  );
}

// ============ روابط التواصل (فارغة — تُملأ من لوحة التحكم) ============

const SOCIAL = [
  { platform: 'instagram', label: 'إنستغرام', url: '', sort_order: 1 },
  { platform: 'facebook', label: 'فيسبوك', url: '', sort_order: 2 },
  { platform: 'whatsapp', label: 'واتساب', url: '', sort_order: 3 },
  { platform: 'phone', label: 'اتصل بنا', url: '', sort_order: 4 },
];
for (const s of SOCIAL) {
  run(
    `INSERT INTO social_links (platform, label, url, is_active, sort_order)
     VALUES (:platform, :label, :url, 1, :sort_order)
     ON CONFLICT(platform) DO UPDATE SET label = :label`,
    s
  );
}

// ============ المحاضرات ============

const LECTURES = [
  {
    title: 'الشباب رؤية المستقبل', speaker: 'أم سيد محمد الشيرازي',
    reciter: 'الملا حوراء', majlis_name: 'مجلس عزاء عن أم البنين عليها السلام',
    occasion: 'جمادى الآخرة', date: addDays(today, 2), time: '20:00', upcoming: 1,
    description: 'محاضرة تتناول دور الشباب في بناء المستقبل، وأثر التربية الدينية في تكوين شخصية الشاب المسلم، مع وقفات من سيرة أهل البيت عليهم السلام. يليها مجلس عزاء عن أم البنين عليها السلام.',
  },
  {
    title: 'السبايا', speaker: 'أم علي الموسوي',
    reciter: 'الملا زينب', majlis_name: 'مجلس عزاء الإمام الحسين عليه السلام',
    occasion: 'محرم الحرام', date: addDays(today, 6), time: '20:30', upcoming: 0,
    description: 'مجلس يتناول مسيرة السبايا من كربلاء إلى الكوفة ثم الشام، وما جرى على عيال الإمام الحسين عليه السلام، مع وقفات في صبر العقيلة زينب عليها السلام وموقفها في مجلس يزيد.',
  },
  {
    title: 'الأخلاق في نهج البلاغة', speaker: 'أم حسن الأسدي',
    reciter: 'الملا فاطمة', majlis_name: 'مجلس أسبوعي',
    occasion: 'محاضرة أسبوعية', date: addDays(today, 11), time: '19:30', upcoming: 0,
    description: 'محاضرة أخلاقية تتناول وصايا أمير المؤمنين عليه السلام في نهج البلاغة وأثرها في بناء الأسرة والمجتمع.',
  },
  {
    title: 'فضل شهر رجب', speaker: 'أم كاظم العبادي',
    reciter: 'الملا رقية', majlis_name: 'مجلس رجب',
    occasion: 'رجب الأصب', date: addDays(today, 26), time: '20:00', upcoming: 0,
    description: 'حديث عن فضل شهر رجب وأعماله وما ورد فيه من أدعية عن أهل البيت عليهم السلام.',
  },
  {
    title: 'مجلس أربعينية الإمام الحسين عليه السلام', speaker: 'أم جعفر الحسيني',
    reciter: 'الملا زهراء', majlis_name: 'مجلس الأربعين',
    occasion: 'صفر الخير', date: addDays(today, -20), time: '20:00', upcoming: 0,
    description: 'مجلس أقيم بمناسبة زيارة الأربعين.',
  },
];
for (const l of LECTURES) {
  run(
    `INSERT INTO lectures (title, speaker, reciter, majlis_name, occasion, lecture_date, lecture_time,
                           description, show_in_upcoming, show_in_calendar, show_venue, is_published)
     VALUES (:t, :s, :r, :m, :o, :d, :tm, :desc, :up, 1, 1, 1)`,
    { t: l.title, s: l.speaker, r: l.reciter, m: l.majlis_name, o: l.occasion,
      d: l.date, tm: l.time, desc: l.description, up: l.upcoming }
  );
}

// ============ المناسبات ============

const EVENTS = [
  { title: 'مولد الإمام علي عليه السلام', kind: 'مولود', date: addDays(today, 4), time: '19:00',
    description: 'احتفالية بمناسبة ذكرى المولد، مع فقرات إنشادية وتوزيع الضيافة.' },
  { title: 'فاتحة المرحوم الحاج أبو حسن', kind: 'فاتحة', date: addDays(today, 8), time: '17:00',
    description: 'مجلس فاتحة على روح المرحوم، تُقام في الحسينية على مدى ثلاثة أيام.' },
  { title: 'ذكرى استشهاد الإمام الكاظم عليه السلام', kind: 'ذكرى', date: addDays(today, 19), time: '20:00',
    description: 'مجلس عزاء بمناسبة ذكرى الاستشهاد.' },
  { title: 'مجلس ليلة الجمعة', kind: 'مجلس', date: addDays(today, 34), time: '19:30',
    description: 'المجلس الأسبوعي المعتاد في ليلة الجمعة.' },
];
for (const e of EVENTS) {
  run(
    `INSERT INTO events (title, kind, event_date, event_time, description, show_in_upcoming, show_in_calendar, show_venue, is_published)
     VALUES (:t, :k, :d, :tm, :desc, 1, 1, 1, 1)`,
    { t: e.title, k: e.kind, d: e.date, tm: e.time, desc: e.description }
  );
}

// ============ معرض الصور (صور SVG مولّدة محلياً) ============

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UPLOADS_DIR } from '../lib/db.js';

/** ينشئ صورة SVG بسيطة كبديل مؤقت (Placeholder) */
function placeholder(name, label, tone = '#0f3b2e') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${tone}"/><stop offset="1" stop-color="#1c1c1c"/>
  </linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <g fill="none" stroke="#c9a227" stroke-width="3" opacity="0.5">
    <path d="M600 120 C 700 220, 700 320, 600 400 C 500 320, 500 220, 600 120 Z"/>
    <circle cx="600" cy="470" r="46"/>
    <path d="M120 660 H1080" /><path d="M120 690 H1080" opacity="0.4"/>
  </g>
  <text x="600" y="600" text-anchor="middle" font-family="Segoe UI, Tahoma, sans-serif"
        font-size="44" fill="#f5f1e6">${label}</text>
  <text x="600" y="650" text-anchor="middle" font-family="Segoe UI, Tahoma, sans-serif"
        font-size="24" fill="#c9a227">صورة تجريبية — تُستبدل من لوحة التحكم</text>
</svg>`;
  writeFileSync(join(UPLOADS_DIR, name), svg, 'utf8');
  return `/uploads/${name}`;
}

const GALLERY = [
  { file: 'sample-exterior-1.svg', title: 'واجهة الحسينية', category: 'exterior', cover: 1, tone: '#0f3b2e' },
  { file: 'sample-exterior-2.svg', title: 'المدخل الرئيسي', category: 'exterior', cover: 0, tone: '#123a34' },
  { file: 'sample-interior-1.svg', title: 'القاعة الرئيسية', category: 'interior', cover: 0, tone: '#1a2e2a' },
  { file: 'sample-interior-2.svg', title: 'المنبر الحسيني', category: 'interior', cover: 0, tone: '#14322b' },
  { file: 'sample-occasion-1.svg', title: 'من مجالس محرم', category: 'occasions', cover: 0, tone: '#221f1c' },
  { file: 'sample-occasion-2.svg', title: 'موكب العزاء', category: 'occasions', cover: 0, tone: '#1b1b1b' },
];
const galleryPaths = {};
GALLERY.forEach((g, i) => {
  const path = placeholder(g.file, g.title, g.tone);
  galleryPaths[g.file] = path;
  run(
    `INSERT INTO gallery (title, description, image_path, category, is_cover, sort_order)
     VALUES (:t, '', :p, :c, :cov, :o)`,
    { t: g.title, p: path, c: g.category, cov: g.cover, o: i + 1 }
  );
});

// صورة البطل (Hero) والتبرعات
setSettings({
  hero_image: galleryPaths['sample-exterior-1.svg'],
  donation_image: '/img/donation-banner.jpg',   // بنر عريض — صفحة التبرعات
  donation_post: '/img/donation-post.jpg',      // بوست 16:7 — الصفحة الرئيسية
});

// ============ المفقودات ============

const LOST = [
  { name: 'حقيبة نسائية سوداء', desc: 'حقيبة يد سوداء صغيرة عُثر عليها بعد انتهاء المجلس.', place: 'القاعة الرئيسية', date: addDays(today, -5), status: 'available' },
  { name: 'مفاتيح مع ميدالية', desc: 'مجموعة مفاتيح فيها ميدالية معدنية.', place: 'المدخل', date: addDays(today, -12), status: 'available' },
  { name: 'نظارة طبية', desc: 'نظارة طبية بإطار بني.', place: 'قسم النساء', date: addDays(today, -18), status: 'available' },
  { name: 'هاتف محمول', desc: 'هاتف محمول عُثر عليه وتم تسليمه لصاحبه.', place: 'الساحة الخارجية', date: addDays(today, -30), status: 'delivered' },
];
for (const l of LOST) {
  run(
    `INSERT INTO lost_found (item_name, description, image_path, found_place, show_place, found_date, status, delivered_at, is_published)
     VALUES (:n, :d, '', :p, 1, :dt, :st, :del, 1)`,
    { n: l.name, d: l.desc, p: l.place, dt: l.date, st: l.status, del: l.status === 'delivered' ? l.date : null }
  );
}

// ============ التبرعات والإعلانات ============

run(
  `INSERT INTO donation_campaigns (title, description, image_path, goal_amount, is_active, sort_order)
   VALUES (:t, :d, :img, 0, 1, 1)`,
  {
    t: 'دعم مجالس محرم الحرام',
    d: 'المساهمة في تجهيز مجالس العزاء وتوفير الضيافة والخدمات للزائرين خلال أيام محرم.',
    img: placeholder('sample-campaign.svg', 'دعم مجالس محرم', '#2a1f1a'),
  }
);

run(
  `INSERT INTO advertisements (title, description, image_path, link_url, placement, start_date, end_date, is_active, sort_order)
   VALUES (:t, :d, :img, '', 'home', :s, :e, 1, 1)`,
  {
    t: 'انطلاق مجالس محرم الحرام',
    d: 'تبدأ المجالس يومياً بعد صلاة المغرب في حسينية العترة الطاهرة.',
    img: placeholder('sample-ad.svg', 'إعلان تجريبي', '#101c18'),
    s: addDays(today, -3), e: addDays(today, 40),
  }
);

for (const d of [
  { donor: 'فاعل خير', amount: 250000, method: 'كي كارد', date: addDays(today, -3) },
  { donor: 'الحاج أبو زهراء', amount: 500000, method: 'زين كاش', date: addDays(today, -14) },
  { donor: 'فاعل خير', amount: 100000, method: 'تحويل رصيد', date: addDays(today, -25) },
]) {
  run(
    `INSERT INTO donations (campaign_id, donor_name, amount, method_name, note, donated_at)
     VALUES (1, :d, :a, :m, '', :dt)`,
    { d: d.donor, a: d.amount, m: d.method, dt: d.date }
  );
}

// ============ الأيام غير المتاحة ============

run(
  `INSERT INTO blocked_dates (date, reason, created_by) VALUES (:d, :r, :by)
   ON CONFLICT(date) DO NOTHING`,
  { d: addDays(today, 15), r: 'مناسبة خاصة بالحسينية', by: admin.id }
);

// ============ حجوزات تجريبية ============

function seedBooking({ user, start, days, typeSlug, attendees, foodSlug, status, dailyPrice = 0, foodCost = 0, deposit = 0, other = '' }) {
  const type = get('SELECT * FROM event_types WHERE slug = :s', { s: typeSlug });
  const food = get('SELECT * FROM food_options WHERE slug = :s', { s: foodSlug });
  const code = generateBookingCode();
  const r = run(
    `INSERT INTO bookings
      (code, user_id, start_date, days, end_date, event_type_id, event_type_name, event_type_other,
       attendees, food_option_id, food_option_slug, food_option_label, status,
       daily_price, food_cost, deposit_amount)
     VALUES (:code, :uid, :start, :days, :end, :etid, :etname, :other, :att,
             :fid, :fslug, :flabel, :st, :dp, :fc, :dep)`,
    {
      code, uid: user.id, start, days, end: addDays(start, days - 1),
      etid: type.id, etname: type.name, other,
      att: attendees, fid: food.id, fslug: food.slug, flabel: food.label,
      st: status, dp: dailyPrice, fc: foodSlug === 'kitchen' ? foodCost : 0, dep: deposit,
    }
  );
  const id = Number(r.lastInsertRowid);
  logBookingEvent(id, 'pending_review', 'تم إرسال طلب الحجز', { id: user.id, role: 'user' });
  if (status !== 'pending_review') {
    logBookingEvent(id, status, 'تحديث تجريبي للحالة', { id: admin.id, role: 'admin' });
  }
  const b = recalcBooking(id);
  if (dailyPrice > 0) issueInvoice(id);
  return b;
}

// 1) طلب جديد قيد المراجعة
const b1 = seedBooking({
  user: user1, start: addDays(today, 40), days: 3, typeSlug: 'fatiha',
  attendees: 180, foodSlug: 'kitchen', status: 'pending_review',
});
notify(user1.id, 'تم استلام طلب الحجز', `طلبك رقم ${b1.code} قيد المراجعة من قبل الإدارة.`, { type: 'booking', link: `#/booking/${b1.id}` });

// 2) بانتظار موافقة المستخدم (مُسعَّر)
const b2 = seedBooking({
  user: user2, start: addDays(today, 55), days: 2, typeSlug: 'majlis',
  attendees: 160, foodSlug: 'kitchen', status: 'awaiting_user_approval',
  dailyPrice: 100000, foodCost: 150000, deposit: 105000,
});
notify(user2.id, 'تم تحديد سعر الحجز', `تمت مراجعة طلب الحجز رقم ${b2.code}، يرجى الاطلاع على الفاتورة.`, { type: 'booking', link: `#/booking/${b2.id}` });

// 3) حجز مثبّت (تم دفع العربون)
const b3 = seedBooking({
  user: user3, start: addDays(today, 70), days: 1, typeSlug: 'mawlid',
  attendees: 150, foodSlug: 'host', status: 'deposit_paid',
  dailyPrice: 120000, deposit: 40000,
});
run(
  `INSERT INTO payments (booking_id, user_id, method_id, method_name, amount, reference, receipt_path, status, reviewed_at, reviewed_by)
   VALUES (:b, :u, 1, 'كي كارد', 40000, 'TRX-DEMO-001', :rp, 'accepted', datetime('now'), :by)`,
  { b: b3.id, u: user3.id, rp: placeholder('sample-receipt.svg', 'وصل دفع تجريبي', '#1d2b24'), by: admin.id }
);
recalcBooking(b3.id);
issueInvoice(b3.id);
notify(user3.id, 'تم تثبيت الحجز', `تم تأكيد العربون وتثبيت الحجز رقم ${b3.code}.`, { type: 'booking', link: `#/booking/${b3.id}` });

// 4) حجز مكتمل (للتقارير)
seedBooking({
  user: user1, start: addDays(today, -45), days: 3, typeSlug: 'majlis',
  attendees: 200, foodSlug: 'kitchen', status: 'completed',
  dailyPrice: 90000, foodCost: 120000, deposit: 100000,
});

// إشعار عام
run(
  `INSERT INTO notifications (user_id, title, body, type, link)
   VALUES (NULL, 'انطلاق مجالس محرم الحرام', 'تبدأ المجالس يومياً بعد صلاة المغرب في حسينية العترة الطاهرة.', 'announcement', '#/lectures')`
);

// ============ التقرير ============

console.log(`
✓ تمت تهيئة البيانات التجريبية

  الحسابات:
  ─────────────────────────────────────────────
  المدير    07700000001   admin1234
  المشرف    07700000002   admin1234
  مستخدم    07700000010   user1234   (أبو علي الموسوي)
  مستخدم    07700000011   user1234   (حيدر الكعبي)
  مستخدم    07700000012   user1234   (كاظم الجابري)

  المحتوى:  ${all('SELECT id FROM lectures').length} محاضرة · ${all('SELECT id FROM events').length} مناسبة · ${all('SELECT id FROM gallery').length} صورة · ${all('SELECT id FROM lost_found').length} مفقودات
  الحجوزات: ${all('SELECT id FROM bookings').length} حجز تجريبي

  شغّل الخادم:  npm start
`);
