// التقويم الهجري (أم القرى) — وحدة مشتركة بين الخادم والمتصفح
// تعتمد على Intl المدمج، بدون أي مكتبة خارجية.

export const HIJRI_MONTHS = [
  'محرم الحرام', 'صفر الخير', 'ربيع الأول', 'ربيع الثاني',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب الأصب', 'شعبان المعظم',
  'رمضان المبارك', 'شوال المكرّم', 'ذو القعدة', 'ذو الحجة',
];

export const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const GREGORIAN_MONTHS_AR = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

let _fmt = null;
function hijriFormatter() {
  if (!_fmt) {
    _fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
    });
  }
  return _fmt;
}

function toUTC(iso) {
  return new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
}

/** يحوّل تاريخاً ميلادياً (YYYY-MM-DD) إلى { year, month, day } هجري */
export function toHijri(iso) {
  const parts = hijriFormatter().formatToParts(toUTC(iso));
  const pick = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/** "12 محرم الحرام 1448 هـ" */
export function formatHijri(iso, { withYear = true } = {}) {
  const h = toHijri(iso);
  const name = HIJRI_MONTHS[h.month - 1] || '';
  return withYear ? `${h.day} ${name} ${h.year} هـ` : `${h.day} ${name}`;
}

/** "18 أيلول 2026" */
export function formatGregorian(iso) {
  const d = toUTC(iso);
  return `${d.getUTCDate()} ${GREGORIAN_MONTHS_AR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** اسم اليوم بالعربية */
export function weekdayAr(iso) {
  return WEEKDAYS_AR[toUTC(iso).getUTCDay()];
}

function addDaysISO(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function sameHijriMonth(a, b) {
  return a.year === b.year && a.month === b.month;
}

/**
 * يعيد نطاق الشهر الهجري الذي يقع فيه التاريخ:
 * { start, end, year, month, name, label }
 */
export function hijriMonthRange(iso) {
  const base = String(iso).slice(0, 10);
  const h = toHijri(base);
  const start = addDaysISO(base, -(h.day - 1));

  let end = start;
  for (let i = 1; i <= 31; i++) {
    const candidate = addDaysISO(start, i);
    if (!sameHijriMonth(toHijri(candidate), h)) break;
    end = candidate;
  }
  const name = HIJRI_MONTHS[h.month - 1] || '';
  return { start, end, year: h.year, month: h.month, name, label: `${name} ${h.year} هـ` };
}

/** نطاق الشهر الهجري التالي */
export function nextHijriMonthRange(iso) {
  const cur = hijriMonthRange(iso);
  return hijriMonthRange(addDaysISO(cur.end, 1));
}

/**
 * النافذة المسموح عرضها للمستخدم: الشهر الحالي والشهر القادم فقط.
 * offset = 0 (الحالي) أو 1 (القادم).
 */
export function displayWindow(todayISO, offset = 0) {
  const clamped = offset === 1 ? 1 : 0;
  return clamped === 0 ? hijriMonthRange(todayISO) : nextHijriMonthRange(todayISO);
}
