// النسخ الاحتياطي — مهمة يومية على Vercel، وإدارة يدوية من لوحة التحكم
import { Router, sendJson, readJson, badRequest, forbidden, notFound } from '../lib/http.js';
import { dbBytes, dbSize, replaceDb, flushToCloud } from '../lib/db.js';
import { requireRole } from '../lib/auth.js';
import { isCloud, backupCloud, listBackupsCloud, readBackupCloud } from '../lib/storage.js';
import { ROOT } from '../lib/db.js';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const backupRoutes = new Router();

const LOCAL_DIR = join(ROOT, 'data', 'backups');
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/** ينشئ نسخة احتياطية في المكان المناسب حسب وضع التخزين */
async function createBackup() {
  const bytes = dbBytes();
  if (isCloud) return backupCloud(bytes);

  mkdirSync(LOCAL_DIR, { recursive: true });
  const file = join(LOCAL_DIR, `husseiniya-${stamp()}.db`);
  writeFileSync(file, bytes);

  // الاحتفاظ بآخر 14 نسخة فقط
  const old = readdirSync(LOCAL_DIR).filter((f) => f.endsWith('.db')).sort();
  while (old.length > 14) unlinkSync(join(LOCAL_DIR, old.shift()));

  return { target: file, size: bytes.length };
}

async function listBackups() {
  if (isCloud) return listBackupsCloud();
  if (!existsSync(LOCAL_DIR)) return [];
  return readdirSync(LOCAL_DIR)
    .filter((f) => f.endsWith('.db')).sort().reverse()
    .map((f) => ({ id: f, at: f.replace('husseiniya-', '').replace('.db', '') }));
}

// ---------- مهمة Vercel اليومية ----------

backupRoutes.get('/backup', async (req, res) => {
  // Vercel يرسل ترويسة التفويض تلقائياً لمهام Cron
  const secret = process.env.CRON_SECRET || '';
  if (secret) {
    const auth = req.headers.authorization || '';
    const url = new URL(req.url, 'http://x');
    const provided = auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || '';
    if (provided !== secret) throw forbidden('رمز المهمة غير صحيح');
  }

  const result = await createBackup();
  sendJson(res, 200, {
    ok: true,
    message: 'تم إنشاء نسخة احتياطية',
    target: String(result.target),
    size: result.size,
    at: new Date().toISOString(),
  });
});

// ---------- إدارة من لوحة التحكم ----------

backupRoutes.get('/backups', async (req, res) => {
  requireRole(req, 'admin');
  sendJson(res, 200, {
    ok: true,
    storage: isCloud ? 'cloud' : 'file',
    db_size: dbSize(),
    items: await listBackups(),
  });
});

backupRoutes.post('/backups', async (req, res) => {
  requireRole(req, 'admin');
  const result = await createBackup();
  sendJson(res, 201, {
    ok: true,
    message: 'تم إنشاء نسخة احتياطية',
    size: result.size,
    items: await listBackups(),
  });
});

backupRoutes.post('/backups/restore', async (req, res) => {
  requireRole(req, 'manager');   // الاستعادة للمدير فقط
  const body = await readJson(req);
  const id = String(body.id || '').trim();
  if (!id) throw badRequest('يرجى تحديد النسخة المطلوبة');

  let bytes = null;
  if (isCloud) {
    bytes = await readBackupCloud(id);
  } else {
    const file = join(LOCAL_DIR, id.replace(/[\\/]/g, ''));
    if (file.startsWith(LOCAL_DIR) && existsSync(file)) bytes = readFileSync(file);
  }
  if (!bytes) throw notFound('النسخة الاحتياطية غير موجودة');

  replaceDb(bytes);
  await flushToCloud();
  sendJson(res, 200, { ok: true, message: 'تمت استعادة النسخة الاحتياطية بنجاح' });
});
