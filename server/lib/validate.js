// طبقة التحقق من المدخلات — رسائل عربية واضحة
import { badRequest } from './http.js';

const AR_DIGITS = /[٠-٩۰-۹]/g;

/** يحوّل الأرقام العربية/الفارسية إلى أرقام إنجليزية */
export function normalizeDigits(value) {
  if (typeof value !== 'string') return value;
  return value.replace(AR_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

export function str(value, label, { required = true, min = 0, max = 2000, trim = true } = {}) {
  let v = value ?? '';
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') throw badRequest(`${label}: القيمة غير صحيحة`);
  if (trim) v = v.trim();
  if (!v) {
    if (required) throw badRequest(`${label}: هذا الحقل مطلوب`);
    return '';
  }
  if (v.length < min) throw badRequest(`${label}: يجب ألا يقل عن ${min} حرفاً`);
  if (v.length > max) throw badRequest(`${label}: يجب ألا يزيد عن ${max} حرفاً`);
  return v;
}

export function num(value, label, { required = true, min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === '' || value === null || value === undefined) {
    if (required) throw badRequest(`${label}: هذا الحقل مطلوب`);
    return 0;
  }
  const n = Number(normalizeDigits(String(value)));
  if (!Number.isFinite(n)) throw badRequest(`${label}: يجب أن يكون رقماً`);
  if (integer && !Number.isInteger(n)) throw badRequest(`${label}: يجب أن يكون رقماً صحيحاً`);
  if (n < min) throw badRequest(`${label}: يجب ألا يقل عن ${min}`);
  if (n > max) throw badRequest(`${label}: يجب ألا يزيد عن ${max}`);
  return n;
}

export function bool(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

/** رقم هاتف: أرقام فقط (مع + اختيارية)، 7–15 خانة */
export function phone(value, label = 'رقم الهاتف') {
  let v = normalizeDigits(String(value ?? '')).trim().replace(/[\s\-()]/g, '');
  if (!v) throw badRequest(`${label}: هذا الحقل مطلوب`);
  if (!/^\+?\d{7,15}$/.test(v)) throw badRequest(`${label}: الرجاء إدخال رقم هاتف صحيح`);
  return v;
}

export function password(value, label = 'كلمة المرور') {
  const v = String(value ?? '');
  if (!v) throw badRequest(`${label}: هذا الحقل مطلوب`);
  if (v.length < 6) throw badRequest(`${label}: يجب ألا تقل عن 6 خانات`);
  if (v.length > 128) throw badRequest(`${label}: طويلة جداً`);
  return v;
}

/** تاريخ بصيغة YYYY-MM-DD */
export function date(value, label, { required = true } = {}) {
  const v = normalizeDigits(String(value ?? '')).trim();
  if (!v) {
    if (required) throw badRequest(`${label}: هذا الحقل مطلوب`);
    return '';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw badRequest(`${label}: صيغة التاريخ غير صحيحة`);
  const d = new Date(v + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) throw badRequest(`${label}: تاريخ غير صالح`);
  return v;
}

/** وقت بصيغة HH:MM */
export function time(value, label, { required = false } = {}) {
  const v = normalizeDigits(String(value ?? '')).trim();
  if (!v) {
    if (required) throw badRequest(`${label}: هذا الحقل مطلوب`);
    return '';
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw badRequest(`${label}: صيغة الوقت غير صحيحة (مثال 20:00)`);
  return v;
}

export function oneOf(value, options, label) {
  const v = String(value ?? '').trim();
  if (!options.includes(v)) throw badRequest(`${label}: الخيار المحدد غير صالح`);
  return v;
}

export function url(value, label, { required = false } = {}) {
  const v = String(value ?? '').trim();
  if (!v) {
    if (required) throw badRequest(`${label}: هذا الحقل مطلوب`);
    return '';
  }
  if (!/^https?:\/\/.+/i.test(v) && !v.startsWith('/')) {
    throw badRequest(`${label}: يجب أن يبدأ الرابط بـ http:// أو https://`);
  }
  if (v.length > 600) throw badRequest(`${label}: الرابط طويل جداً`);
  return v;
}

/** يضيف أياماً إلى تاريخ YYYY-MM-DD */
export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayISO() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

/** يعيد قائمة التواريخ بين تاريخين (شاملة) */
export function dateRange(start, end) {
  const out = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
