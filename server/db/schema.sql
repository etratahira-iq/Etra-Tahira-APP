-- ============================================================
--  حسينية العترة الطاهرة — مخطط قاعدة البيانات
--  SQLite (node:sqlite)
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- المستخدمون والجلسات ----------

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT    NOT NULL UNIQUE,          -- المعرّف الأساسي للمستخدم
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,                 -- scrypt
  password_salt TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user'
                CHECK (role IN ('user','admin','manager')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------- الإعدادات العامة (key/value) ----------

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- قوائم قابلة للإدارة ----------

CREATE TABLE IF NOT EXISTS event_types (           -- أنواع المناسبات
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  slug       TEXT    NOT NULL UNIQUE,
  allows_custom_text INTEGER NOT NULL DEFAULT 0,   -- خيار "أخرى" يفتح حقلاً نصياً
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS food_options (          -- خيارات الطعام
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,             -- host | kitchen
  label       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  has_cost    INTEGER NOT NULL DEFAULT 0,          -- هل يضيف تكلفة للفاتورة
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);

-- ---------- توفر الحسينية ----------

CREATE TABLE IF NOT EXISTS blocked_dates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL UNIQUE,              -- YYYY-MM-DD
  reason     TEXT    NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الحجوزات ----------

CREATE TABLE IF NOT EXISTS bookings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT    NOT NULL UNIQUE,       -- رقم الطلب المعروض
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  start_date        TEXT    NOT NULL,              -- YYYY-MM-DD
  days              INTEGER NOT NULL CHECK (days >= 1),
  end_date          TEXT    NOT NULL,              -- محسوب: start + days - 1

  event_type_id     INTEGER REFERENCES event_types(id) ON DELETE SET NULL,
  event_type_name   TEXT    NOT NULL DEFAULT '',   -- نسخة ثابتة للأرشفة
  event_type_other  TEXT    NOT NULL DEFAULT '',   -- عند اختيار "أخرى"

  attendees         INTEGER NOT NULL,
  food_option_id    INTEGER REFERENCES food_options(id) ON DELETE SET NULL,
  food_option_slug  TEXT    NOT NULL DEFAULT '',
  food_option_label TEXT    NOT NULL DEFAULT '',

  user_note         TEXT    NOT NULL DEFAULT '',
  admin_note        TEXT    NOT NULL DEFAULT '',

  status            TEXT    NOT NULL DEFAULT 'pending_review'
                    CHECK (status IN (
                      'pending_review','pricing','awaiting_user_approval',
                      'awaiting_deposit','deposit_submitted','deposit_paid',
                      'confirmed','completed','cancelled','rejected')),

  daily_price       REAL    NOT NULL DEFAULT 0,
  food_cost         REAL    NOT NULL DEFAULT 0,
  subtotal          REAL    NOT NULL DEFAULT 0,    -- daily_price * days
  total             REAL    NOT NULL DEFAULT 0,    -- subtotal + food_cost
  deposit_amount    REAL    NOT NULL DEFAULT 0,    -- العربون المطلوب
  deposit_paid      REAL    NOT NULL DEFAULT 0,    -- المدفوع فعلياً والمقبول
  remaining         REAL    NOT NULL DEFAULT 0,    -- total - deposit_paid

  priced_at         TEXT,
  approved_at       TEXT,
  confirmed_at      TEXT,
  reviewed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_user   ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_dates  ON bookings(start_date, end_date);

-- سجل الحالات (Timeline)
CREATE TABLE IF NOT EXISTS booking_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  status     TEXT    NOT NULL,
  note       TEXT    NOT NULL DEFAULT '',
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT    NOT NULL DEFAULT 'system',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bevents_booking ON booking_events(booking_id);

-- بنود الفاتورة (قابلة للتوسع: خدمات إضافية مستقبلاً)
CREATE TABLE IF NOT EXISTS booking_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL,
  qty         REAL    NOT NULL DEFAULT 1,
  unit_price  REAL    NOT NULL DEFAULT 0,
  amount      REAL    NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bitems_booking ON booking_items(booking_id);

-- ---------- الفواتير ----------

CREATE TABLE IF NOT EXISTS invoices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  number     TEXT    NOT NULL UNIQUE,
  issued_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  snapshot   TEXT    NOT NULL DEFAULT '{}'        -- JSON: نسخة مجمدة وقت الإصدار
);

-- ---------- طرق الدفع والعربون ----------

CREATE TABLE IF NOT EXISTS payment_methods (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,                -- كي كارد / زين كاش / تحويل رصيد
  slug           TEXT    NOT NULL UNIQUE,
  account_number TEXT    NOT NULL DEFAULT '',     -- يُدخل من لوحة التحكم فقط
  account_name   TEXT    NOT NULL DEFAULT '',
  instructions   TEXT    NOT NULL DEFAULT '',
  usage_scope    TEXT    NOT NULL DEFAULT 'both'
                 CHECK (usage_scope IN ('deposit','donation','both')),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1,
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method_id    INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
  method_name  TEXT    NOT NULL DEFAULT '',
  amount       REAL    NOT NULL DEFAULT 0,
  reference    TEXT    NOT NULL DEFAULT '',        -- رقم العملية إن وجد
  receipt_path TEXT    NOT NULL DEFAULT '',        -- صورة الوصل
  status       TEXT    NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','rejected','resend')),
  admin_note   TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  reviewed_at  TEXT,
  reviewed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status  ON payments(status);

-- ---------- المحاضرات والمجالس ----------

CREATE TABLE IF NOT EXISTS lectures (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,                -- عنوان المحاضرة
  speaker         TEXT    NOT NULL DEFAULT '',     -- تقديم المحاضرة (المحاضِر)
  reciter         TEXT    NOT NULL DEFAULT '',     -- اسم القارئ / الملا لمجلس العزاء
  majlis_name     TEXT    NOT NULL DEFAULT '',     -- المجلس الذي يلي المحاضرة
  occasion        TEXT    NOT NULL DEFAULT '',     -- المناسبة
  lecture_date    TEXT    NOT NULL,                -- YYYY-MM-DD
  lecture_time    TEXT    NOT NULL DEFAULT '',     -- HH:MM
  description     TEXT    NOT NULL DEFAULT '',
  image_path      TEXT    NOT NULL DEFAULT '',
  show_in_upcoming INTEGER NOT NULL DEFAULT 0,     -- يظهر في "المحاضرة القادمة"
  show_in_calendar INTEGER NOT NULL DEFAULT 1,
  show_venue      INTEGER NOT NULL DEFAULT 1,      -- إظهار عنوان الحسينية
  is_published    INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lectures_date ON lectures(lecture_date);

-- ---------- المناسبات ----------

CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  kind            TEXT    NOT NULL DEFAULT 'مناسبة', -- مجلس/مولود/فاتحة/ذكرى/أخرى
  event_date      TEXT    NOT NULL,
  event_time      TEXT    NOT NULL DEFAULT '',
  speaker         TEXT    NOT NULL DEFAULT '',
  description     TEXT    NOT NULL DEFAULT '',
  image_path      TEXT    NOT NULL DEFAULT '',
  show_in_upcoming INTEGER NOT NULL DEFAULT 1,
  show_in_calendar INTEGER NOT NULL DEFAULT 1,
  show_venue      INTEGER NOT NULL DEFAULT 1,
  is_published    INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);

-- ---------- معرض الصور ----------

CREATE TABLE IF NOT EXISTS gallery (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL DEFAULT '',
  description TEXT    NOT NULL DEFAULT '',
  image_path  TEXT    NOT NULL,
  category    TEXT    NOT NULL DEFAULT 'exterior'
              CHECK (category IN ('exterior','interior','occasions')),
  is_cover    INTEGER NOT NULL DEFAULT 0,          -- الصورة الرئيسية
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- المفقودات ----------

CREATE TABLE IF NOT EXISTS lost_found (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name   TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  image_path  TEXT    NOT NULL DEFAULT '',
  found_place TEXT    NOT NULL DEFAULT '',
  show_place  INTEGER NOT NULL DEFAULT 1,
  found_date  TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'available'
              CHECK (status IN ('available','delivered')),
  delivered_at TEXT,
  internal_note TEXT  NOT NULL DEFAULT '',         -- لا يظهر للعامة
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lost_status ON lost_found(status);

-- ---------- الإعلانات ----------

CREATE TABLE IF NOT EXISTS advertisements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  image_path  TEXT    NOT NULL DEFAULT '',
  link_url    TEXT    NOT NULL DEFAULT '',
  placement   TEXT    NOT NULL DEFAULT 'home'
              CHECK (placement IN ('home','donations','both')),
  start_date  TEXT,
  end_date    TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- حملات التبرع ----------

CREATE TABLE IF NOT EXISTS donation_campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  image_path  TEXT    NOT NULL DEFAULT '',
  goal_amount REAL    NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- سجل التبرعات المعلنة (يُدخلها المشرف — للتقارير)
CREATE TABLE IF NOT EXISTS donations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES donation_campaigns(id) ON DELETE SET NULL,
  donor_name  TEXT    NOT NULL DEFAULT 'فاعل خير',
  amount      REAL    NOT NULL DEFAULT 0,
  method_name TEXT    NOT NULL DEFAULT '',
  note        TEXT    NOT NULL DEFAULT '',
  donated_at  TEXT    NOT NULL DEFAULT (date('now')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الإشعارات ----------

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL = إشعار عام
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',
  type       TEXT    NOT NULL DEFAULT 'general',
  link       TEXT    NOT NULL DEFAULT '',
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);

-- ---------- روابط التواصل ----------

CREATE TABLE IF NOT EXISTS social_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  platform   TEXT    NOT NULL UNIQUE,   -- instagram | facebook | whatsapp | phone | email
  label      TEXT    NOT NULL DEFAULT '',
  url        TEXT    NOT NULL DEFAULT '',
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ---------- تحديد معدل المحاولات ----------

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket     TEXT PRIMARY KEY,
  hits       INTEGER NOT NULL DEFAULT 0,
  reset_at   INTEGER NOT NULL
);
