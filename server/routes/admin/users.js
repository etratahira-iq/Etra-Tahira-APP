// إدارة المستخدمين والصلاحيات والإشعارات العامة
import { Router, readJson, sendJson, badRequest, notFound, forbidden } from '../../lib/http.js';
import { all, get, run, scalar } from '../../lib/db.js';
import { requireRole, hashPassword } from '../../lib/auth.js';
import * as v from '../../lib/validate.js';
import { notify, broadcast } from '../../lib/notify.js';

export const adminUserRoutes = new Router();

adminUserRoutes.get('/users', async (req, res) => {
  requireRole(req, 'admin');
  const url = new URL(req.url, 'http://x');
  const q = (url.searchParams.get('q') || '').trim();
  const role = url.searchParams.get('role') || '';

  const where = ['1=1'];
  const params = {};
  if (q) { where.push('(name LIKE :q OR phone LIKE :q)'); params.q = `%${q}%`; }
  if (['user', 'admin', 'manager'].includes(role)) { where.push('role = :r'); params.r = role; }

  const rows = all(
    `SELECT id, phone, name, role, is_active, created_at,
            (SELECT COUNT(*) FROM bookings b WHERE b.user_id = users.id) AS bookings_count
       FROM users WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 300`,
    params
  );
  sendJson(res, 200, { ok: true, items: rows });
});

adminUserRoutes.get('/users/:id', async (req, res, { params }) => {
  requireRole(req, 'admin');
  const user = get('SELECT id, phone, name, role, is_active, created_at FROM users WHERE id = :id', { id: params.id });
  if (!user) throw notFound('المستخدم غير موجود');
  sendJson(res, 200, {
    ok: true,
    user,
    bookings: all('SELECT id, code, start_date, end_date, status, total FROM bookings WHERE user_id = :id ORDER BY id DESC', { id: user.id }),
  });
});

// إنشاء حساب (مشرف أو مستخدم) من لوحة التحكم
adminUserRoutes.post('/users', async (req, res) => {
  const actor = requireRole(req, 'admin');
  const body = await readJson(req);
  const name = v.str(body.name, 'الاسم', { min: 2, max: 80 });
  const phone = v.phone(body.phone);
  const password = v.password(body.password);
  const role = v.oneOf(body.role || 'user', ['user', 'admin', 'manager'], 'الصلاحية');

  if (role !== 'user' && actor.role !== 'manager') {
    throw forbidden('إنشاء حسابات المشرفين متاح للمدير فقط');
  }
  if (get('SELECT id FROM users WHERE phone = :p', { p: phone })) {
    throw badRequest('رقم الهاتف مسجّل مسبقاً');
  }

  const { hash, salt } = hashPassword(password);
  const r = run(
    `INSERT INTO users (phone, name, password_hash, password_salt, role) VALUES (:p, :n, :h, :s, :r)`,
    { p: phone, n: name, h: hash, s: salt, r: role }
  );
  sendJson(res, 201, {
    ok: true,
    user: get('SELECT id, phone, name, role, is_active, created_at FROM users WHERE id = :id', { id: Number(r.lastInsertRowid) }),
  });
});

// تعديل مستخدم
adminUserRoutes.patch('/users/:id', async (req, res, { params }) => {
  const actor = requireRole(req, 'admin');
  const user = get('SELECT * FROM users WHERE id = :id', { id: params.id });
  if (!user) throw notFound('المستخدم غير موجود');
  const body = await readJson(req);

  const updates = {};
  if (body.name !== undefined) updates.name = v.str(body.name, 'الاسم', { min: 2, max: 80 });
  if (body.is_active !== undefined) updates.is_active = v.bool(body.is_active) ? 1 : 0;

  if (body.role !== undefined) {
    const role = v.oneOf(body.role, ['user', 'admin', 'manager'], 'الصلاحية');
    if (actor.role !== 'manager') throw forbidden('تغيير الصلاحيات متاح للمدير فقط');
    if (user.id === actor.id && role !== 'manager') {
      throw badRequest('لا يمكنك تخفيض صلاحيتك بنفسك');
    }
    if (user.role === 'manager' && role !== 'manager') {
      const managers = scalar(`SELECT COUNT(*) FROM users WHERE role = 'manager' AND is_active = 1`);
      if (managers <= 1) throw badRequest('لا يمكن إزالة آخر مدير في النظام');
    }
    updates.role = role;
  }

  if (body.password) {
    if (actor.role !== 'manager' && actor.id !== user.id) throw forbidden('تغيير كلمة مرور مستخدم آخر متاح للمدير فقط');
    const pass = v.password(body.password, 'كلمة المرور الجديدة');
    const { hash, salt } = hashPassword(pass);
    updates.password_hash = hash;
    updates.password_salt = salt;
  }

  if (user.id === actor.id && updates.is_active === 0) throw badRequest('لا يمكنك إيقاف حسابك بنفسك');
  if (!Object.keys(updates).length) throw badRequest('لا توجد بيانات للتعديل');

  const sets = Object.keys(updates).map((k) => `${k} = :${k}`).join(', ');
  run(`UPDATE users SET ${sets}, updated_at = datetime('now') WHERE id = :id`, { ...updates, id: user.id });

  sendJson(res, 200, {
    ok: true,
    user: get('SELECT id, phone, name, role, is_active, created_at FROM users WHERE id = :id', { id: user.id }),
  });
});

adminUserRoutes.delete('/users/:id', async (req, res, { params }) => {
  const actor = requireRole(req, 'manager');
  const user = get('SELECT * FROM users WHERE id = :id', { id: params.id });
  if (!user) throw notFound('المستخدم غير موجود');
  if (user.id === actor.id) throw badRequest('لا يمكنك حذف حسابك بنفسك');
  const bookings = scalar('SELECT COUNT(*) FROM bookings WHERE user_id = :id', { id: user.id });
  if (bookings > 0) throw badRequest('لا يمكن حذف مستخدم لديه حجوزات، يمكنك إيقاف الحساب بدلاً من ذلك');
  run('DELETE FROM users WHERE id = :id', { id: user.id });
  sendJson(res, 200, { ok: true });
});

// ---------- الإشعارات من الإدارة ----------

adminUserRoutes.get('/notifications', async (req, res) => {
  requireRole(req, 'admin');
  sendJson(res, 200, {
    ok: true,
    items: all(
      `SELECT n.*, u.name AS user_name, u.phone AS user_phone
         FROM notifications n LEFT JOIN users u ON u.id = n.user_id
        ORDER BY n.id DESC LIMIT 200`
    ),
  });
});

adminUserRoutes.post('/notifications', async (req, res) => {
  requireRole(req, 'admin');
  const body = await readJson(req);
  const title = v.str(body.title, 'عنوان الإشعار', { min: 2, max: 120 });
  const text = v.str(body.body, 'نص الإشعار', { required: false, max: 1000 });
  const link = v.str(body.link, 'الرابط', { required: false, max: 200 });

  if (body.user_id) {
    const userId = v.num(body.user_id, 'المستخدم', { integer: true, min: 1 });
    if (!get('SELECT id FROM users WHERE id = :id', { id: userId })) throw notFound('المستخدم غير موجود');
    notify(userId, title, text, { type: 'admin', link });
  } else {
    broadcast(title, text, { link });
  }
  sendJson(res, 201, { ok: true, message: 'تم إرسال الإشعار بنجاح' });
});

adminUserRoutes.delete('/notifications/:id', async (req, res, { params }) => {
  requireRole(req, 'admin');
  run('DELETE FROM notifications WHERE id = :id', { id: params.id });
  sendJson(res, 200, { ok: true });
});
