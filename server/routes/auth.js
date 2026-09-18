// مسارات المصادقة: إنشاء حساب، دخول، خروج، الملف الشخصي
import { Router, readJson, sendJson, badRequest, unauthorized } from '../lib/http.js';
import { get, run } from '../lib/db.js';
import {
  hashPassword, verifyPassword, createSession, destroySession,
  currentUser, requireUser, rateLimit, resetRateLimit,
} from '../lib/auth.js';
import * as v from '../lib/validate.js';
import { unreadCount } from '../lib/notify.js';

export const authRoutes = new Router();

function publicUser(user) {
  return { id: user.id, name: user.name, phone: user.phone, role: user.role };
}

function clientKey(req, suffix) {
  const ip = req.socket?.remoteAddress || 'local';
  return `${suffix}:${ip}`;
}

// إنشاء حساب جديد
authRoutes.post('/register', async (req, res) => {
  rateLimit(clientKey(req, 'register'), 10, 3600);

  const body = await readJson(req);
  const name = v.str(body.name, 'الاسم', { min: 2, max: 80 });
  const ph = v.phone(body.phone);
  const pass = v.password(body.password);
  const confirm = String(body.password_confirm ?? body.password);
  if (pass !== confirm) throw badRequest('كلمتا المرور غير متطابقتين');

  const exists = get('SELECT id FROM users WHERE phone = :p', { p: ph });
  if (exists) throw badRequest('رقم الهاتف مسجّل مسبقاً، يمكنك تسجيل الدخول مباشرة');

  const { hash, salt } = hashPassword(pass);
  const result = run(
    `INSERT INTO users (phone, name, password_hash, password_salt, role)
     VALUES (:p, :n, :h, :s, 'user')`,
    { p: ph, n: name, h: hash, s: salt }
  );

  const id = Number(result.lastInsertRowid);
  createSession(res, id, req.headers['user-agent'] || '');
  const user = get('SELECT id, name, phone, role FROM users WHERE id = :id', { id });
  sendJson(res, 201, { ok: true, user: publicUser(user), unread: 0 });
});

// تسجيل الدخول
authRoutes.post('/login', async (req, res) => {
  const body = await readJson(req);
  const ph = v.phone(body.phone);
  const pass = String(body.password ?? '');

  rateLimit(`login:${ph}`, 8, 900);
  rateLimit(clientKey(req, 'login-ip'), 30, 900);

  const user = get('SELECT * FROM users WHERE phone = :p', { p: ph });
  if (!user || !verifyPassword(pass, user.password_hash, user.password_salt)) {
    throw unauthorized('رقم الهاتف أو كلمة المرور غير صحيحة');
  }
  if (!user.is_active) throw unauthorized('تم إيقاف هذا الحساب، يرجى التواصل مع الإدارة');

  resetRateLimit(`login:${ph}`);
  createSession(res, user.id, req.headers['user-agent'] || '');
  sendJson(res, 200, { ok: true, user: publicUser(user), unread: unreadCount(user.id) });
});

// تسجيل الخروج
authRoutes.post('/logout', async (req, res) => {
  destroySession(req, res);
  sendJson(res, 200, { ok: true });
});

// المستخدم الحالي
authRoutes.get('/me', async (req, res) => {
  const user = currentUser(req);
  if (!user) return sendJson(res, 200, { ok: true, user: null, unread: 0 });
  sendJson(res, 200, { ok: true, user: publicUser(user), unread: unreadCount(user.id) });
});

// تعديل بيانات الحساب
authRoutes.patch('/me', async (req, res) => {
  const user = requireUser(req);
  const body = await readJson(req);
  const name = v.str(body.name, 'الاسم', { min: 2, max: 80 });
  run(`UPDATE users SET name = :n, updated_at = datetime('now') WHERE id = :id`, { n: name, id: user.id });
  sendJson(res, 200, { ok: true, user: { ...user, name } });
});

// تغيير كلمة المرور
authRoutes.post('/change-password', async (req, res) => {
  const user = requireUser(req);
  const body = await readJson(req);
  const current = String(body.current_password ?? '');
  const next = v.password(body.new_password, 'كلمة المرور الجديدة');

  const row = get('SELECT password_hash, password_salt FROM users WHERE id = :id', { id: user.id });
  if (!verifyPassword(current, row.password_hash, row.password_salt)) {
    throw badRequest('كلمة المرور الحالية غير صحيحة');
  }
  const { hash, salt } = hashPassword(next);
  run(
    `UPDATE users SET password_hash = :h, password_salt = :s, updated_at = datetime('now') WHERE id = :id`,
    { h: hash, s: salt, id: user.id }
  );
  sendJson(res, 200, { ok: true, message: 'تم تغيير كلمة المرور بنجاح' });
});
