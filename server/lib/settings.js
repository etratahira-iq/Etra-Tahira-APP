// الإعدادات العامة — كل ما يمكن أن يتغير مستقبلاً يُخزَّن هنا لا في الكود
import { all, run, get, ROOT } from './db.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const IMG_DIR = join(ROOT, 'public', 'img');
const hasImg = (name) => existsSync(join(IMG_DIR, name));

/**
 * يكتشف شعار الحسينية من مجلد public/img.
 * ضع ملفك باسم logo.svg أو logo.png وسيُستخدم تلقائياً في كل التطبيق:
 * الهيدر، لوحة التحكم، أيقونة التبويب، وأيقونة الشاشة الرئيسية على الهاتف.
 * تُفضَّل صيغة SVG للعرض لأنها تبقى حادة في كل الأحجام.
 */
export function detectDefaultLogo() {
  for (const ext of ['svg', 'png', 'webp', 'jpg', 'jpeg']) {
    if (hasImg(`logo.${ext}`)) return `/img/logo.${ext}`;
  }
  return '';
}

/**
 * نسخة نقطية من الشعار — لازمة لأيقونة الشاشة الرئيسية على iOS
 * لأن نظام آبل لا يدعم SVG في apple-touch-icon.
 */
export function detectRasterLogo() {
  for (const ext of ['png', 'webp', 'jpg', 'jpeg']) {
    if (hasImg(`logo.${ext}`)) return `/img/logo.${ext}`;
  }
  return detectDefaultLogo();
}

/**
 * القيم الافتراضية. كلها Placeholder قابلة للتعديل من لوحة التحكم،
 * ولا تحتوي على أي بيانات حقيقية (أرقام حسابات، روابط، أسعار).
 */
export const DEFAULT_SETTINGS = {
  // الهوية
  site_name: 'حسينية العترة الطاهرة',
  site_tagline: 'منبر لأهل البيت عليهم السلام',
  logo_path: '',
  hero_image: '',
  hero_title: 'حسينية العترة الطاهرة',
  hero_subtitle: 'بيتٌ من بيوت الله، تُقام فيه مجالس أهل البيت عليهم السلام، ويستقبل أهالي المنطقة في مناسباتهم ومجالسهم.',

  // نبذة وموقع
  about_title: 'نبذة عن الحسينية',
  about_text: 'حسينية العترة الطاهرة منبرٌ لإحياء ذكر أهل البيت عليهم السلام، تُقام فيها المجالس الحسينية والمحاضرات الدينية على مدار السنة، وتفتح أبوابها لاستقبال مناسبات الأهالي من مجالس وفواتح وموالد.',
  address: 'يُحدَّد العنوان من لوحة التحكم',
  maps_url: '',
  maps_embed_url: '',

  // التواصل (تُملأ من لوحة التحكم)
  contact_phone: '',
  whatsapp_number: '',
  contact_email: '',

  // الحجز
  currency: 'د.ع',
  attendees_min: '150',
  attendees_max: '200',
  attendees_default: '180',
  booking_max_days: '10',
  booking_min_lead_days: '1',
  booking_notice: 'الحجز لا يُعتبر مؤكداً إلا بعد مراجعة الإدارة وتحديد السعر ودفع العربون.',
  deposit_percent: '30',
  deposit_instructions: 'يتم تثبيت الحجز بعد دفع العربون المحدد من الإدارة وإرفاق صورة وصل الدفع.',

  // التبرعات
  donation_title: 'ساهم في دعم الحسينية',
  donation_text: 'تبرعاتكم تُصرف في خدمة المجالس الحسينية وصيانة الحسينية وتجهيز المواكب.',
  donation_image: '/img/donation-banner.jpg',   // بنر عريض — صفحة التبرعات
  donation_post: '/img/donation-post.jpg',      // بوست 16:7 — الصفحة الرئيسية

  // أقسام تظهر/تُخفى
  show_lectures_section: '1',
  show_events_section: '1',
  show_gallery_section: '1',
  show_lost_found_section: '1',
  show_donations_section: '1',
  show_ads_section: '1',
};

/** يعيد كل الإعدادات ككائن */
export function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function getSetting(key, fallback = '') {
  const row = get('SELECT value FROM settings WHERE key = :k', { k: key });
  if (row) return row.value;
  return DEFAULT_SETTINGS[key] ?? fallback;
}

export function getNumberSetting(key, fallback = 0) {
  const n = Number(getSetting(key, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}

export function setSetting(key, value) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (:k, :v, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = :v, updated_at = datetime('now')`,
    { k: String(key), v: String(value ?? '') }
  );
}

export function setSettings(obj) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof k !== 'string' || k.length > 80) continue;
    setSetting(k, v);
  }
}

/** يزرع القيم الافتراضية الناقصة */
export function ensureDefaults() {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    const exists = get('SELECT 1 AS x FROM settings WHERE key = :k', { k });
    if (!exists) setSetting(k, v);
  }
}
