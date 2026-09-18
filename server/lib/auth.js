// المصادقة: تشفير كلمات المرور، الجلسات، الصلاحيات
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { get, run, all } from './db.js';
import { parseCookies, setCookie, clearCookie, unauthorized, forbidden, HttpError } from './http.js';

const SESSION_COOKIE = 'hst_session';
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

// ---------- كلمات المرور ----------

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  try {
    const candidate = scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
    const stored = Buffer.from(hash, 'hex');
    if (candidate.length !== stored.length) return false;
    return timingSafeEqual(candidate, stored);
  } catch {
    return false;
  }
}

// ---------- الجلسات ----------

export function createSession(res, userId, userAgent = '') {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  run(
    `INSERT INTO sessions (token, user_id, user_agent, expires_at)
     VALUES (:token, :user_id, :ua, :exp)`,
    { token, user_id: userId, ua: String(userAgent).slice(0, 200), exp: expires }
  );
  setCookie(res, SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 });
  return token;
}

export function destroySession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) run('DELETE FROM sessions WHERE token = :t', { t: token });
  clearCookie(res, SESSION_COOKIE);
}

/** يعيد المستخدم الحالي أو null */
export function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const row = get(
    `SELECT u.id, u.phone, u.name, u.role, u.is_active, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = :t`,
    { t: token }
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    run('DELETE FROM sessions WHERE token = :t', { t: token });
    return null;
  }
  if (!row.is_active) return null;
  return { id: row.id, phone: row.phone, name: row.name, role: row.role };
}

export function requireUser(req) {
  const user = currentUser(req);
  if (!user) throw unauthorized();
  return user;
}

const RANK = { user: 1, admin: 2, manager: 3 };

export function requireRole(req, minRole) {
  const user = requireUser(req);
  if ((RANK[user.role] || 0) < (RANK[minRole] || 99)) throw forbidden();
  return user;
}

export const isStaff = (user) => !!user && (user.role === 'admin' || user.role === 'manager');

/** تنظيف الجلسات المنتهية */
export function purgeExpiredSessions() {
  run(`DELETE FROM sessions WHERE expires_at < datetime('now')`);
}

// ---------- تحديد معدل المحاولات ----------

/**
 * يسمح بـ max محاولة خلال windowSec لكل bucket، وإلا يرمي خطأ 429.
 */
export function rateLimit(bucket, max, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const row = get('SELECT hits, reset_at FROM rate_limits WHERE bucket = :b', { b: bucket });
  if (!row || row.reset_at <= now) {
    run(
      `INSERT INTO rate_limits (bucket, hits, reset_at) VALUES (:b, 1, :r)
       ON CONFLICT(bucket) DO UPDATE SET hits = 1, reset_at = :r`,
      { b: bucket, r: now + windowSec }
    );
    return;
  }
  if (row.hits >= max) {
    const wait = Math.max(1, Math.ceil((row.reset_at - now) / 60));
    throw new HttpError(429, `عدد المحاولات كبير جداً، يرجى المحاولة بعد ${wait} دقيقة`);
  }
  run('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = :b', { b: bucket });
}

export function resetRateLimit(bucket) {
  run('DELETE FROM rate_limits WHERE bucket = :b', { b: bucket });
}

export function listSessions(userId) {
  return all('SELECT token, user_agent, created_at, expires_at FROM sessions WHERE user_id = :u', { u: userId });
}

export { SESSION_COOKIE };
