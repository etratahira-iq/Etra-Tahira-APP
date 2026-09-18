// اتصال قاعدة البيانات — SQLite المدمجة في Node (node:sqlite)
//
// الوضع المحلي : ملف القاعدة في data/husseiniya.db
// الوضع السحابي: يُنزَّل الملف من Upstash Redis إلى /tmp عند بدء كل نسخة،
//                ويُرفع بعد كل تعديل. كل استعلامات SQL تبقى كما هي دون تغيير.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { isCloud, loadDbBytes, saveDbBytes, acquireLock, releaseLock } from './storage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..', '..');
export const DATA_DIR = isCloud ? join(tmpdir(), 'hst-data') : join(ROOT, 'data');
export const UPLOADS_DIR = isCloud ? join(tmpdir(), 'hst-uploads') : join(ROOT, 'uploads');

for (const dir of [DATA_DIR, UPLOADS_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || join(DATA_DIR, 'husseiniya.db');

/**
 * الاتصال الفعلي — متغيّر داخلي حتى نتمكن من استبدال ملف القاعدة
 * (تنزيلها من السحابة أو استعادة نسخة احتياطية) دون كسر أي استيراد.
 */
let conn = openConnection();

function openConnection() {
  const c = new DatabaseSync(DB_PATH);
  // WAL يوزّع البيانات على ملفات جانبية — غير مناسب للوضع السحابي الذي يرفع ملفاً واحداً
  c.exec(isCloud ? 'PRAGMA journal_mode = DELETE;' : 'PRAGMA journal_mode = WAL;');
  c.exec('PRAGMA foreign_keys = ON;');
  return c;
}

/** واجهة ثابتة تُمرّر الاستدعاءات إلى الاتصال الحالي */
export const db = {
  exec: (sql) => conn.exec(sql),
  prepare: (sql) => conn.prepare(sql),
  close: () => conn.close(),
};

// ---------------------------- التزامن مع السحابة ----------------------------

let dirty = false;
let booted = false;

/** يُعلِم الطبقة أن القاعدة تغيّرت وتحتاج رفعاً بعد انتهاء الطلب */
export function markDirty() { dirty = true; }
export const isDirty = () => dirty;

/**
 * يُنزّل القاعدة من السحابة إلى القرص المؤقت — يُنفَّذ مرة واحدة لكل نسخة.
 * يعيد true إذا كانت القاعدة جديدة تماماً (تحتاج تهيئة أولى).
 */
export async function bootFromCloud() {
  if (!isCloud || booted) return false;
  booted = true;
  const bytes = await loadDbBytes();

  if (!bytes || bytes.length === 0) {
    // لا توجد قاعدة في السحابة — ابدأ من ملف نظيف.
    // مجلد /tmp قد يحتوي بقايا نسخة سابقة على نفس الجهاز، ولو استُخدمت
    // لظهرت بيانات قديمة بدل قاعدة جديدة.
    resetDatabaseFile();
    return true;
  }

  swapDatabaseFile(bytes);
  return false;
}

/** يرفع القاعدة إلى السحابة إن تغيّرت — يُستدعى بعد كل طلب كتابة */
export async function flushToCloud() {
  if (!isCloud || !dirty) return;
  const lock = await acquireLock();
  try {
    checkpoint();
    await saveDbBytes(readFileSync(DB_PATH));
    dirty = false;
  } catch (err) {
    console.error('[تعذّر رفع قاعدة البيانات]', err);
  } finally {
    await releaseLock(lock);
  }
}

/** يحذف ملف القاعدة ويفتح قاعدة فارغة تماماً */
function resetDatabaseFile() {
  try { conn.close(); } catch { /* تجاهل */ }
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { rmSync(DB_PATH + suffix, { force: true }); } catch { /* تجاهل */ }
  }
  conn = openConnection();
}

/** يستبدل ملف القاعدة على القرص ويعيد فتح الاتصال عليه */
function swapDatabaseFile(bytes) {
  try { conn.close(); } catch { /* تجاهل */ }
  writeFileSync(DB_PATH, bytes);
  conn = openConnection();
}

/** يفرّغ سجل WAL داخل الملف الرئيسي قبل قراءته */
function checkpoint() {
  try { conn.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* الوضع DELETE لا يحتاجها */ }
}

/** حجم ملف القاعدة الحالي بالبايت */
export function dbSize() {
  try { return statSync(DB_PATH).size; } catch { return 0; }
}

/** نسخة من ملف القاعدة (للنسخ الاحتياطي) */
export function dbBytes() {
  checkpoint();
  return readFileSync(DB_PATH);
}

/** يستبدل القاعدة كاملة (استعادة نسخة احتياطية) */
export function replaceDb(bytes) {
  swapDatabaseFile(bytes);
  markDirty();
}

/** ينشئ الجداول إن لم تكن موجودة */
export function migrate() {
  const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  db.exec(schema);
  applyColumnMigrations();
}

/**
 * أعمدة أُضيفت بعد إنشاء قاعدة البيانات أول مرة.
 * CREATE TABLE IF NOT EXISTS لا يضيف أعمدة جديدة للجداول الموجودة،
 * لذا نضيفها هنا حتى لا تُفقد البيانات الحالية عند التحديث.
 */
const COLUMN_MIGRATIONS = [
  { table: 'lectures', column: 'reciter', def: `TEXT NOT NULL DEFAULT ''` },
];

function applyColumnMigrations() {
  for (const { table, column, def } of COLUMN_MIGRATIONS) {
    const exists = db.prepare(`PRAGMA table_info(${table})`).all()
      .some((c) => c.name === column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
  }
}

// ---------- مساعدات استعلام مختصرة ----------

/** صفوف متعددة */
export function all(sql, params = {}) {
  return db.prepare(sql).all(normalize(params));
}

/** صف واحد أو undefined */
export function get(sql, params = {}) {
  return db.prepare(sql).get(normalize(params));
}

/** تنفيذ (INSERT/UPDATE/DELETE) — يعيد { changes, lastInsertRowid } */
export function run(sql, params = {}) {
  const result = db.prepare(sql).run(normalize(params));
  markDirty();   // ليُرفع الملف إلى السحابة بعد انتهاء الطلب
  return result;
}

/** قيمة مفردة من أول عمود */
export function scalar(sql, params = {}) {
  const row = get(sql, params);
  if (!row) return null;
  return Object.values(row)[0];
}

/** تنفيذ مجموعة عمليات داخل معاملة واحدة */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* تجاهل */ }
    throw err;
  }
}

/**
 * node:sqlite لا يقبل القيم المنطقية أو undefined أو null ضمن كائن المعاملات
 * بشكل مباشر في كل الإصدارات، لذا نحوّلها إلى أنواع مدعومة.
 */
function normalize(params) {
  if (Array.isArray(params)) return params.map(normalizeValue);
  if (params === null || typeof params !== 'object') return params;
  const out = {};
  for (const [k, v] of Object.entries(params)) out[k] = normalizeValue(v);
  return out;
}

function normalizeValue(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

export { DB_PATH };
