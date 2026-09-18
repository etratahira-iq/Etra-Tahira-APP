// رفع الصور بشكل آمن — استقبال Data URL والتحقق منها ثم الحفظ على القرص
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { UPLOADS_DIR } from './db.js';
import { badRequest } from './http.js';

const MAX_BYTES = 4 * 1024 * 1024; // 4MB

/** التوقيع الثنائي للصور المسموحة (magic bytes) */
const SIGNATURES = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'gif', mime: 'image/gif', test: (b) => b.slice(0, 3).toString('ascii') === 'GIF' },
  {
    ext: 'webp', mime: 'image/webp',
    test: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP',
  },
];

/**
 * يحفظ صورة مرسلة كـ Data URL ويعيد المسار العام (/uploads/xxx.jpg).
 * يتحقق من: الصيغة، الحجم، والتوقيع الثنائي الفعلي للملف.
 */
export function saveDataUrlImage(dataUrl, { label = 'الصورة' } = {}) {
  if (!dataUrl || typeof dataUrl !== 'string') throw badRequest(`${label}: لم يتم إرسال ملف`);

  const match = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) throw badRequest(`${label}: صيغة الملف المرسل غير مدعومة`);

  const declaredMime = match[1].toLowerCase();
  if (!declaredMime.startsWith('image/')) {
    throw badRequest(`${label}: يُسمح برفع الصور فقط`);
  }

  let buf;
  try {
    buf = Buffer.from(match[2], 'base64');
  } catch {
    throw badRequest(`${label}: تعذّر قراءة الملف`);
  }

  if (buf.length === 0) throw badRequest(`${label}: الملف فارغ`);
  if (buf.length > MAX_BYTES) {
    throw badRequest(`${label}: حجم الصورة يجب ألا يتجاوز 4 ميغابايت`);
  }

  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig) throw badRequest(`${label}: نوع الصورة غير مدعوم (المسموح: JPG, PNG, WEBP, GIF)`);

  const name = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${sig.ext}`;
  writeFileSync(join(UPLOADS_DIR, name), buf);
  return `/uploads/${name}`;
}

/**
 * يعالج حقل صورة قادماً من النموذج:
 * - Data URL جديد  → يُحفظ ويعيد المسار الجديد
 * - مسار /uploads/ موجود → يُبقى كما هو
 * - سلسلة فارغة → يمسح الصورة
 */
export function resolveImageField(value, currentPath = '', label = 'الصورة') {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v === '') return '';
  if (v.startsWith('data:')) {
    const path = saveDataUrlImage(v, { label });
    if (currentPath) removeUpload(currentPath);
    return path;
  }
  if (v.startsWith('/uploads/')) return v;
  if (/^https?:\/\//i.test(v)) return v.slice(0, 600);
  return currentPath || '';
}

/** يحذف ملفاً مرفوعاً (يتجاهل أي مسار خارج مجلد المرفوعات) */
export function removeUpload(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return;
  const file = join(UPLOADS_DIR, basename(publicPath));
  if (!file.startsWith(UPLOADS_DIR)) return;
  try {
    if (existsSync(file)) unlinkSync(file);
  } catch { /* تجاهل */ }
}

export { MAX_BYTES };
