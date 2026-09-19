/**
 * طبقة التخزين — تعمل بوضعين تلقائياً حسب متغيرات البيئة:
 *
 *  • file  : محلياً على جهازك/سيرفرك
 *            قاعدة البيانات في data/husseiniya.db والصور في uploads/
 *
 *  • cloud : على Vercel (لا يوفّر قرصاً دائماً)
 *            ملف قاعدة البيانات محفوظ في Upstash Redis، والصور في Vercel Blob.
 *            عند بدء كل نسخة من الدالة تُنزَّل القاعدة إلى /tmp وتُرفع بعد كل تعديل.
 *
 * نفس الكود يعمل في الوضعين — لا تتغيّر أي استعلامات SQL.
 */
import { randomBytes } from 'node:crypto';

/**
 * يبحث عن متغيّر البيئة بأي من الأسماء المعروفة، وكذلك بأي بادئة
 * قد تضيفها منصة الاستضافة (مثل STORAGE_KV_REST_API_URL على Vercel).
 */
function findEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value && names.some((n) => key.endsWith('_' + n))) return value;
  }
  return '';
}

const KV_URL = findEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
const KV_TOKEN = findEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
// Vercel قد يسمّيه BLOB_READ_WRITE_TOKEN أو — عند استخدام بادئة —
// STORAGE_READ_WRITE_TOKEN حيث تحلّ البادئة محل كلمة BLOB
const BLOB_TOKEN = findEnv('BLOB_READ_WRITE_TOKEN', 'READ_WRITE_TOKEN');
const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || '';

export const MODE = KV_URL && KV_TOKEN ? 'cloud' : 'file';
export const isCloud = MODE === 'cloud';

const DB_KEY = process.env.HST_DB_KEY || 'hst:db';
const LOCK_KEY = DB_KEY + ':lock';
const BACKUP_LIST = 'hst:backups';

/** هل يوجد مخزن صور صالح؟ (محلياً دائماً، سحابياً يحتاج Blob أو Cloudinary) */
export const hasImageStore =
  MODE === 'file' || !!BLOB_TOKEN || !!(CLOUDINARY_CLOUD && CLOUDINARY_PRESET);

/**
 * أسماء متغيرات التخزين الموجودة فعلياً (أسماء فقط بلا قيم) —
 * تساعد على معرفة سبب عدم التقاط الرمز عند إعداد الاستضافة.
 */
export function storageEnvNames() {
  const pattern = /(KV_REST|UPSTASH_REDIS|READ_WRITE_TOKEN|STORE_ID|WEBHOOK_PUBLIC_KEY|CLOUDINARY)/;
  return Object.keys(process.env)
    .filter((k) => pattern.test(k))
    .map((k) => (process.env[k] ? k : k + ' (فارغ)'))
    .sort();
}

// ---------------------------- Upstash REST ----------------------------

async function kv(cmd) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error('KV: ' + (j.error || res.status));
  return j.result;
}

// ---------------------------- قفل الكتابة ----------------------------

/**
 * يمنع نسختين من الدالة من الكتابة في نفس اللحظة فتضيع تعديلات إحداهما.
 * عند تعذّر الحصول على القفل نكمل بدونه بدل تعطيل الطلب على المستخدم.
 */
export async function acquireLock(ms = 4000) {
  if (!isCloud) return null;
  const id = randomBytes(8).toString('hex');
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ok = await kv(['SET', LOCK_KEY, id, 'NX', 'PX', '8000']).catch(() => null);
    if (ok === 'OK') return id;
    await new Promise((r) => setTimeout(r, 90));
  }
  return null;
}

export async function releaseLock(id) {
  if (!isCloud || !id) return;
  try {
    const cur = await kv(['GET', LOCK_KEY]);
    if (cur === id) await kv(['DEL', LOCK_KEY]);
  } catch { /* تجاهل */ }
}

// ------------------------ قاعدة البيانات في السحابة ------------------------

/** ينزّل ملف قاعدة البيانات من Redis، أو null إن لم تكن موجودة بعد */
export async function loadDbBytes() {
  if (!isCloud) return null;
  const raw = await kv(['GET', DB_KEY]).catch(() => null);
  if (!raw) return null;
  try {
    return Buffer.from(String(raw), 'base64');
  } catch {
    return null;
  }
}

/** يرفع ملف قاعدة البيانات إلى Redis */
export async function saveDbBytes(buf) {
  if (!isCloud) return;
  await kv(['SET', DB_KEY, Buffer.from(buf).toString('base64')]);
}

// ---------------------------- رفع الصور ----------------------------

/**
 * يرفع صورة إلى المخزن السحابي ويعيد رابطها العام.
 * يعيد null في الوضع المحلي ليتولى الاستدعاء حفظها على القرص.
 */
export async function saveImageCloud(buf, { ext, mime, dataUrl }) {
  if (!isCloud) return null;

  const name = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`;

  if (CLOUDINARY_CLOUD && CLOUDINARY_PRESET) {
    const form = new FormData();
    form.append('file', dataUrl);
    form.append('upload_preset', CLOUDINARY_PRESET);
    const r = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
      { method: 'POST', body: form }
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.secure_url) throw new Error('فشل رفع الصورة (Cloudinary)');
    return j.secure_url;
  }

  if (BLOB_TOKEN) {
    let lastErr = '';
    for (const version of ['7', '6', '11', '4']) {
      const r = await fetch('https://blob.vercel-storage.com/hst/' + name, {
        method: 'PUT',
        headers: {
          authorization: 'Bearer ' + BLOB_TOKEN,
          'x-api-version': version,
          'x-content-type': mime,
          'x-add-random-suffix': '1',
          'x-cache-control-max-age': '31536000',
        },
        body: buf,
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        if (j?.url) return j.url;
      }
      lastErr = await r.text().catch(() => String(r.status));
    }
    throw new Error('فشل رفع الصورة إلى Blob: ' + lastErr.slice(0, 120));
  }

  throw new Error('لم يتم إعداد تخزين الصور — أضف Vercel Blob أو Cloudinary في إعدادات الاستضافة');
}

// ---------------------------- النسخ الاحتياطي ----------------------------

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/** ينشئ نسخة احتياطية سحابية ويحتفظ بآخر 14 نسخة */
export async function backupCloud(buf) {
  const key = 'hst:backup:' + stamp();
  await kv(['SET', key, Buffer.from(buf).toString('base64'), 'EX', String(60 * 60 * 24 * 30)]);
  await kv(['LPUSH', BACKUP_LIST, key]);
  await kv(['LTRIM', BACKUP_LIST, '0', '13']);
  return { target: key, size: buf.length };
}

export async function listBackupsCloud() {
  const keys = await kv(['LRANGE', BACKUP_LIST, '0', '13']).catch(() => []);
  return (keys || []).map((k) => ({ id: k, at: String(k).replace('hst:backup:', '') }));
}

export async function readBackupCloud(id) {
  const raw = await kv(['GET', id]).catch(() => null);
  return raw ? Buffer.from(String(raw), 'base64') : null;
}
