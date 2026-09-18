// اتصال قاعدة البيانات — SQLite المدمجة في Node (node:sqlite)
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..', '..');
export const DATA_DIR = join(ROOT, 'data');
export const UPLOADS_DIR = join(ROOT, 'uploads');

for (const dir of [DATA_DIR, UPLOADS_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || join(DATA_DIR, 'husseiniya.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

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
  return db.prepare(sql).run(normalize(params));
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
