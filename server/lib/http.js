// أدوات HTTP: توجيه، استقبال JSON، كوكيز، ملفات ثابتة، أخطاء
import { createReadStream, statSync, existsSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

/** خطأ يحمل رمز حالة HTTP ورسالة عربية للمستخدم */
export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (m, d) => new HttpError(400, m, d);
export const unauthorized = (m = 'يجب تسجيل الدخول للمتابعة') => new HttpError(401, m);
export const forbidden = (m = 'لا تملك صلاحية للقيام بهذا الإجراء') => new HttpError(403, m);
export const notFound = (m = 'العنصر المطلوب غير موجود') => new HttpError(404, m);
export const conflict = (m, d) => new HttpError(409, m, d);

const MAX_BODY = 6 * 1024 * 1024; // 6MB (يكفي لصورة وصل الدفع بصيغة base64)

/** يقرأ جسم الطلب ويحوّله من JSON */
export async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw badRequest('حجم البيانات المرسلة كبير جداً');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw badRequest('صيغة البيانات المرسلة غير صحيحة');
  }
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

export function sendError(res, err) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error('[خطأ في الخادم]', err);
  sendJson(res, status, {
    ok: false,
    error: status >= 500 ? 'حدث خطأ غير متوقع في الخادم، يرجى المحاولة لاحقاً' : err.message,
    details: err.details ?? null,
  });
}

// ---------- الكوكيز ----------

export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, { maxAge, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Strict'];
  if (httpOnly) parts.push('HttpOnly');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  appendHeader(res, 'Set-Cookie', parts.join('; '));
}

export function clearCookie(res, name) {
  appendHeader(res, 'Set-Cookie', `${name}=; Path=/; Max-Age=0; SameSite=Strict; HttpOnly`);
}

function appendHeader(res, name, value) {
  const prev = res.getHeader(name);
  if (!prev) res.setHeader(name, value);
  else res.setHeader(name, Array.isArray(prev) ? [...prev, value] : [prev, value]);
}

// ---------- الموجّه (Router) ----------

/**
 * موجّه بسيط يدعم المعاملات على شكل :name
 * الاستخدام: router.get('/api/bookings/:id', handler)
 */
export class Router {
  constructor() { this.routes = []; }

  add(method, pattern, handler) {
    const keys = [];
    const regexSrc = pattern
      .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
      .replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)'; });
    this.routes.push({ method, regex: new RegExp(`^${regexSrc}$`), keys, handler });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  /** يدمج موجّهاً آخر تحت بادئة */
  use(prefix, other) {
    for (const r of other.routes) {
      this.routes.push({ ...r, regex: prefixRegex(prefix, r.regex) });
    }
    return this;
  }

  match(method, pathname) {
    let pathExists = false;
    for (const route of this.routes) {
      const m = route.regex.exec(pathname);
      if (!m) continue;
      pathExists = true;
      if (route.method !== method) continue;
      const params = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: route.handler, params };
    }
    if (pathExists) throw new HttpError(405, 'طريقة الطلب غير مدعومة لهذا المسار');
    return null;
  }
}

function prefixRegex(prefix, regex) {
  const src = regex.source.replace(/^\^/, '');
  const escaped = prefix.replace(/[.+*?^${}()|[\]\\]/g, '\\$&');
  // مسار الجذر داخل موجّه فرعي: /bookings و /bookings/ كلاهما صحيح
  if (src === '\\/$' || src === '/$') return new RegExp(`^${escaped}\\/?$`);
  return new RegExp(`^${escaped}${src}`);
}

// ---------- الملفات الثابتة ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

/** يخدم ملفاً ثابتاً بأمان (حماية من Path Traversal) */
export function serveStatic(res, rootDir, urlPath, { cache = false } = {}) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  if (clean.includes('..') || clean.startsWith(sep + '..')) return false;
  const filePath = join(rootDir, clean);
  if (!filePath.startsWith(rootDir)) return false;
  if (!existsSync(filePath)) return false;
  const stat = statSync(filePath);
  if (!stat.isFile()) return false;

  const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(filePath).pipe(res);
  return true;
}
