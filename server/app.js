// تطبيق الحسينية — معالج الطلبات المشترك بين التشغيل المحلي و Vercel
import { join } from 'node:path';

import { migrate, ROOT, UPLOADS_DIR, bootFromCloud, flushToCloud } from './lib/db.js';
import { Router, sendJson, sendError, serveStatic, HttpError, notFound } from './lib/http.js';
import { purgeExpiredSessions } from './lib/auth.js';
import { ensureDefaults } from './lib/settings.js';
import { isCloud, MODE, hasImageStore, storageEnvNames } from './lib/storage.js';
import { ensureFirstAdmin } from './db/bootstrap.js';

import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { bookingRoutes } from './routes/bookings.js';
import { paymentRoutes } from './routes/payments.js';
import { notificationRoutes } from './routes/notifications.js';
import { adminRoutes } from './routes/admin/index.js';
import { backupRoutes } from './routes/backup.js';

const PUBLIC_DIR = join(ROOT, 'public');

// ---------- تجميع المسارات ----------

const api = new Router();
api.use('/auth', authRoutes);
api.use('/bookings', bookingRoutes);
api.use('/payments', paymentRoutes);
api.use('/notifications', notificationRoutes);
api.use('/admin', adminRoutes);
api.use('/cron', backupRoutes);
api.use('', publicRoutes);

api.get('/health', async (req, res) => {
  sendJson(res, 200, {
    ok: true,
    service: 'husseiniya-api',
    storage: MODE,
    image_store: hasImageStore,
    storage_env: storageEnvNames(),
    time: new Date().toISOString(),
  });
});

// ---------- التهيئة ----------

let bootPromise = null;

/**
 * تهيئة تُنفَّذ مرة واحدة لكل نسخة من الخادم.
 * سحابياً: تُنزّل القاعدة من Redis أولاً، ثم تُنشأ الجداول إن كانت جديدة.
 */
export function boot() {
  bootPromise ??= (async () => {
    const isFresh = await bootFromCloud();
    migrate();
    ensureDefaults();
    if (isCloud && isFresh) {
      ensureFirstAdmin();
      await flushToCloud();
      console.log('تم إنشاء قاعدة بيانات جديدة في التخزين السحابي');
    }
    purgeExpiredSessions();
  })();
  return bootPromise;
}

// ---------- معالج الطلبات ----------

/** الطرق التي قد تُعدّل البيانات وتستوجب رفع القاعدة بعد الرد */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function handleRequest(req, res) {
  await boot();

  let pathname;
  try {
    pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  } catch {
    return sendError(res, new HttpError(400, 'طلب غير صالح'));
  }

  // رؤوس أمان أساسية
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');

  // سحابياً: ارفع القاعدة بعد انتهاء أي طلب كتابة
  if (isCloud && WRITE_METHODS.has(req.method)) {
    const done = new Promise((resolve) => res.on('finish', resolve));
    done.then(() => flushToCloud()).catch(() => {});
  }

  try {
    // 1) واجهة برمجة التطبيقات
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const apiPath = pathname.slice(4) || '/';
      const match = api.match(req.method, apiPath);
      if (!match) throw notFound('المسار المطلوب غير موجود');
      await match.handler(req, res, { params: match.params });
      return;
    }

    // 2) الصور المرفوعة (الوضع المحلي فقط — سحابياً تُخدَم من Blob مباشرة)
    if (pathname.startsWith('/uploads/')) {
      if (serveStatic(res, UPLOADS_DIR, pathname.slice('/uploads'.length), { cache: true })) return;
      throw notFound('الصورة غير موجودة');
    }

    // 3) لوحة التحكم
    if (pathname === '/admin' || pathname === '/admin/') {
      if (serveStatic(res, PUBLIC_DIR, '/admin.html')) return;
    }

    // 4) الملفات الثابتة
    if (pathname !== '/' && serveStatic(res, PUBLIC_DIR, pathname)) return;

    // 5) تطبيق الصفحة الواحدة
    if (serveStatic(res, PUBLIC_DIR, '/index.html')) return;

    throw notFound('الصفحة غير موجودة');
  } catch (err) {
    if (res.headersSent) return res.end();
    sendError(res, err);
  }
}

export default handleRequest;
