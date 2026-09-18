// تنسيق الأرقام والتواريخ والنصوص
import { formatHijri, formatGregorian, weekdayAr } from './hijri.js';

let CURRENCY = 'د.ع';
export function setCurrency(c) { CURRENCY = c || 'د.ع'; }
export function currency() { return CURRENCY; }

/** 450000 → "450,000 د.ع" */
export function money(value, { withCurrency = true } = {}) {
  const n = Number(value) || 0;
  const s = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return withCurrency ? `${s} ${CURRENCY}` : s;
}

/** 3 → "3 أيام" (تصريف عربي صحيح) */
export function days(n) {
  const c = Number(n) || 0;
  if (c === 1) return 'يوم واحد';
  if (c === 2) return 'يومان';
  if (c >= 3 && c <= 10) return `${c} أيام`;
  return `${c} يوماً`;
}

export function persons(n) {
  const c = Number(n) || 0;
  if (c === 1) return 'شخص واحد';
  if (c === 2) return 'شخصان';
  if (c >= 3 && c <= 10) return `${c} أشخاص`;
  return `${c} شخصاً`;
}

/** 2026-10-15 → "15/10/2026" */
export function dateShort(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export const dateHijri = (iso) => (iso ? formatHijri(iso) : '—');
export const dateHijriShort = (iso) => (iso ? formatHijri(iso, { withYear: false }) : '—');
export const dateGregorian = (iso) => (iso ? formatGregorian(iso) : '—');
export const weekday = (iso) => (iso ? weekdayAr(iso) : '');

/** "20:00" → "8:00 مساءً" */
export function time12(hhmm) {
  if (!hhmm) return '';
  const [hStr, m] = String(hhmm).split(':');
  const h = Number(hStr);
  if (!Number.isFinite(h)) return hhmm;
  const period = h < 12 ? 'صباحاً' : 'مساءً';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m || '00'} ${period}`;
}

/** تاريخ ووقت الإنشاء → "منذ 3 ساعات" */
export function relative(datetime) {
  if (!datetime) return '';
  const iso = String(datetime).includes('T') ? datetime : String(datetime).replace(' ', 'T') + 'Z';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 60) return 'قبل قليل';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 2592000) return `منذ ${Math.floor(diff / 86400)} يوم`;
  return dateShort(String(datetime).slice(0, 10));
}

/** نطاق التاريخ: "15/10/2026 → 17/10/2026" */
export function dateRangeLabel(start, end) {
  if (!start) return '—';
  if (!end || start === end) return dateShort(start);
  return `${dateShort(start)} ← ${dateShort(end)}`;
}

export function addDays(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** يقتطع نصاً طويلاً */
export function truncate(text, max = 120) {
  const s = String(text ?? '').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return (parts[0]?.[0] || '؟') + (parts[1]?.[0] || '');
}
