// نقطة تشغيل الخادم — حسينية العترة الطاهرة
import { createServer } from 'node:http';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import { migrate, ROOT, UPLOADS_DIR } from './lib/db.js';
import { Router, sendJson, sendError, serveStatic, HttpError, notFound } from './lib/http.js';
import { purgeExpiredSessions } from './lib/auth.js';
import { ensureDefaults } from './lib/settings.js';

import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { bookingRoutes } from './routes/bookings.js';
import { paymentRoutes } from './routes/payments.js';
import { notificationRoutes } from './routes/notifications.js';
import { adminRoutes } from './routes/admin/index.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = join(ROOT, 'public');

// ---------- التهيئة ----------

migrate();
ensureDefaults();
purgeExpiredSessions();

// ---------- تجميع المسارات ----------

const api = new Router();
api.use('/auth', authRoutes);
api.use('/bookings', bookingRoutes);
api.use('/payments', paymentRoutes);
api.use('/notifications', notificationRoutes);
api.use('/admin', adminRoutes);
api.use('', publicRoutes);

api.get('/health', async (req, res) => {
  sendJson(res, 200, { ok: true, service: 'husseiniya-api', time: new Date().toISOString() });
});

// ---------- الخادم ----------

const server = createServer(async (req, res) => {
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

  try {
    // 1) واجهة برمجة التطبيقات
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const apiPath = pathname.slice(4) || '/';
      const match = api.match(req.method, apiPath);
      if (!match) throw notFound('المسار المطلوب غير موجود');
      await match.handler(req, res, { params: match.params });
      return;
    }

    // 2) الصور المرفوعة
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
});

server.listen(PORT, HOST, () => {
  const banner = [
    '',
    '  ╭──────────────────────────────────────────────╮',
    '  │        حسينية العترة الطاهرة — الخادم        │',
    '  ╰──────────────────────────────────────────────╯',
    '',
    `   الموقع        →  http://${HOST}:${PORT}/`,
    `   لوحة التحكم   →  http://${HOST}:${PORT}/admin`,
    `   واجهة API     →  http://${HOST}:${PORT}/api/health`,
    '',
  ].join('\n');
  console.log(banner);
  if (!existsSync(join(ROOT, 'data', 'husseiniya.db'))) {
    console.log('   تنبيه: قاعدة البيانات فارغة — نفّذ "npm run seed" لإضافة بيانات تجريبية.\n');
  }
});

// تنظيف دوري للجلسات المنتهية (كل 6 ساعات)
const cleanup = setInterval(purgeExpiredSessions, 6 * 3600_000);
cleanup.unref?.();

process.on('SIGINT', () => { console.log('\nإيقاف الخادم...'); server.close(() => process.exit(0)); });
