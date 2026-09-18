// تهيئة أول تشغيل في السحابة — بيانات حقيقية فقط، بلا بيانات تجريبية
import { get, run, scalar } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';

/** أنواع المناسبات الأساسية */
const EVENT_TYPES = [
  { name: 'مجلس', slug: 'majlis', allows_custom_text: 0, sort_order: 1 },
  { name: 'مولود', slug: 'mawlid', allows_custom_text: 0, sort_order: 2 },
  { name: 'فاتحة', slug: 'fatiha', allows_custom_text: 0, sort_order: 3 },
  { name: 'أخرى', slug: 'other', allows_custom_text: 1, sort_order: 4 },
];

/** خيارا الطعام */
const FOOD_OPTIONS = [
  {
    slug: 'host', label: 'الطعام على صاحب المجلس', has_cost: 0, sort_order: 1,
    description: 'يتولى صاحب المناسبة تجهيز الطعام وتوفيره بنفسه، ولا تُضاف أي تكلفة طعام إلى الفاتورة.',
  },
  {
    slug: 'kitchen', label: 'الطعام من مطبخ الحسينية', has_cost: 1, sort_order: 2,
    description: 'يتم إعداد وتجهيز الطعام من قبل القائمين على مطبخ الحسينية وفق الكمية المتفق عليها، وتُضاف تكلفته إلى الفاتورة.',
  },
];

/** طرق الدفع — الأرقام تُدخل من لوحة التحكم */
const PAYMENT_METHODS = [
  { name: 'كي كارد', slug: 'qicard', sort_order: 1,
    instructions: 'يرجى التحويل إلى رقم البطاقة أعلاه ثم إرفاق صورة وصل التحويل.' },
  { name: 'زين كاش', slug: 'zaincash', sort_order: 2,
    instructions: 'أرسل المبلغ عبر تطبيق زين كاش إلى الرقم أعلاه ثم أرفق صورة الوصل.' },
  { name: 'تحويل رصيد', slug: 'balance', sort_order: 3,
    instructions: 'يمكن تحويل الرصيد إلى الرقم أعلاه، ثم إرفاق صورة رسالة التحويل.' },
];

const SOCIAL = [
  { platform: 'instagram', label: 'إنستغرام', sort_order: 1 },
  { platform: 'facebook', label: 'فيسبوك', sort_order: 2 },
  { platform: 'whatsapp', label: 'واتساب', sort_order: 3 },
  { platform: 'phone', label: 'اتصل بنا', sort_order: 4 },
];

/**
 * ينشئ القوائم الأساسية وحساب المدير الأول عند أول تشغيل على الاستضافة.
 * بيانات الدخول تُؤخذ من متغيرات البيئة ADMIN_PHONE و ADMIN_PASSWORD.
 */
export function ensureFirstAdmin() {
  for (const t of EVENT_TYPES) {
    run(
      `INSERT INTO event_types (name, slug, allows_custom_text, sort_order, is_active)
       VALUES (:name, :slug, :allows_custom_text, :sort_order, 1)
       ON CONFLICT(slug) DO NOTHING`, t
    );
  }

  for (const f of FOOD_OPTIONS) {
    run(
      `INSERT INTO food_options (slug, label, description, has_cost, sort_order, is_active)
       VALUES (:slug, :label, :description, :has_cost, :sort_order, 1)
       ON CONFLICT(slug) DO NOTHING`, f
    );
  }

  for (const m of PAYMENT_METHODS) {
    run(
      `INSERT INTO payment_methods (name, slug, account_number, account_name, instructions, usage_scope, sort_order, is_active)
       VALUES (:name, :slug, '', '', :instructions, 'both', :sort_order, 1)
       ON CONFLICT(slug) DO NOTHING`, m
    );
  }

  for (const s of SOCIAL) {
    run(
      `INSERT INTO social_links (platform, label, url, is_active, sort_order)
       VALUES (:platform, :label, '', 1, :sort_order)
       ON CONFLICT(platform) DO NOTHING`, s
    );
  }

  // حساب المدير الأول
  const staff = scalar(`SELECT COUNT(*) FROM users WHERE role IN ('admin','manager')`) || 0;
  if (staff > 0) return null;

  const phone = (process.env.ADMIN_PHONE || '07700000001').replace(/[^\d+]/g, '');
  const password = process.env.ADMIN_PASSWORD || 'admin1234';
  const name = process.env.ADMIN_NAME || 'مدير النظام';

  if (get('SELECT id FROM users WHERE phone = :p', { p: phone })) return null;

  const { hash, salt } = hashPassword(password);
  run(
    `INSERT INTO users (phone, name, password_hash, password_salt, role)
     VALUES (:p, :n, :h, :s, 'manager')`,
    { p: phone, n: name, h: hash, s: salt }
  );

  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      `تنبيه أمني: أُنشئ حساب المدير بكلمة مرور افتراضية (${phone} / ${password}). ` +
      'غيّرها فوراً من لوحة التحكم، أو اضبط ADMIN_PASSWORD في متغيرات البيئة.'
    );
  }
  return phone;
}
