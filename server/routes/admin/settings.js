// الإعدادات العامة، طرق الدفع، روابط التواصل
import { Router, readJson, sendJson, notFound, badRequest } from '../../lib/http.js';
import { all, get, run } from '../../lib/db.js';
import { requireRole } from '../../lib/auth.js';
import * as v from '../../lib/validate.js';
import { getSettings, setSettings, DEFAULT_SETTINGS } from '../../lib/settings.js';
import { resolveImageField } from '../../lib/uploads.js';

export const adminSettingsRoutes = new Router();

// الحقول التي تحمل صوراً
const IMAGE_SETTINGS = ['logo_path', 'hero_image', 'donation_image', 'donation_post'];

// ---------- الإعدادات العامة ----------

adminSettingsRoutes.get('/settings', async (req, res) => {
  requireRole(req, 'admin');
  sendJson(res, 200, { ok: true, settings: getSettings(), defaults: DEFAULT_SETTINGS });
});

adminSettingsRoutes.put('/settings', async (req, res) => {
  requireRole(req, 'admin');
  const body = await readJson(req);
  const current = getSettings();
  const out = {};

  for (const [key, value] of Object.entries(body)) {
    if (!/^[a-z0-9_]{2,60}$/.test(key)) continue;
    if (IMAGE_SETTINGS.includes(key)) {
      out[key] = resolveImageField(value, current[key] || '', 'الصورة');
      continue;
    }
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const str = String(value);
    if (str.length > 4000) throw badRequest(`قيمة الحقل "${key}" طويلة جداً`);
    out[key] = str;
  }

  // تحقق منطقي على الحدود الرقمية
  if (out.attendees_min && out.attendees_max) {
    const min = Number(out.attendees_min);
    const max = Number(out.attendees_max);
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
      throw badRequest('الحد الأدنى للحضور لا يمكن أن يكون أكبر من الحد الأعلى');
    }
  }

  setSettings(out);
  sendJson(res, 200, { ok: true, settings: getSettings() });
});

// ---------- طرق الدفع ----------

adminSettingsRoutes.get('/payment-methods', async (req, res) => {
  requireRole(req, 'admin');
  sendJson(res, 200, {
    ok: true,
    items: all('SELECT * FROM payment_methods ORDER BY sort_order, id'),
  });
});

function paymentPayload(body, current = {}) {
  return {
    name: v.str(body.name ?? current.name, 'اسم الخدمة', { min: 2, max: 80 }),
    slug: v.str(body.slug ?? current.slug ?? '', 'المعرّف', { required: false, max: 60 })
      || `pm-${Date.now().toString(36)}`,
    account_number: v.str(body.account_number ?? current.account_number, 'الرقم / الكود', { required: false, max: 80 }),
    account_name: v.str(body.account_name ?? current.account_name, 'اسم الحساب', { required: false, max: 120 }),
    instructions: v.str(body.instructions ?? current.instructions, 'تعليمات الدفع', { required: false, max: 1000 }),
    usage_scope: v.oneOf(body.usage_scope ?? current.usage_scope ?? 'both', ['deposit', 'donation', 'both'], 'نطاق الاستخدام'),
    sort_order: v.num(body.sort_order ?? current.sort_order ?? 0, 'الترتيب', { required: false, min: 0, max: 999, integer: true }),
    is_active: v.bool(body.is_active ?? current.is_active ?? 1) ? 1 : 0,
  };
}

adminSettingsRoutes.post('/payment-methods', async (req, res) => {
  requireRole(req, 'admin');
  const data = paymentPayload(await readJson(req));
  const exists = get('SELECT id FROM payment_methods WHERE slug = :s', { s: data.slug });
  if (exists) throw badRequest('المعرّف مستخدم مسبقاً');
  const r = run(
    `INSERT INTO payment_methods (name, slug, account_number, account_name, instructions, usage_scope, sort_order, is_active)
     VALUES (:name, :slug, :account_number, :account_name, :instructions, :usage_scope, :sort_order, :is_active)`,
    data
  );
  sendJson(res, 201, { ok: true, item: get('SELECT * FROM payment_methods WHERE id = :id', { id: Number(r.lastInsertRowid) }) });
});

adminSettingsRoutes.put('/payment-methods/:id', async (req, res, { params }) => {
  requireRole(req, 'admin');
  const current = get('SELECT * FROM payment_methods WHERE id = :id', { id: params.id });
  if (!current) throw notFound('طريقة الدفع غير موجودة');
  const data = paymentPayload(await readJson(req), current);
  run(
    `UPDATE payment_methods SET name = :name, slug = :slug, account_number = :account_number,
            account_name = :account_name, instructions = :instructions, usage_scope = :usage_scope,
            sort_order = :sort_order, is_active = :is_active, updated_at = datetime('now')
      WHERE id = :id`,
    { ...data, id: current.id }
  );
  sendJson(res, 200, { ok: true, item: get('SELECT * FROM payment_methods WHERE id = :id', { id: current.id }) });
});

adminSettingsRoutes.delete('/payment-methods/:id', async (req, res, { params }) => {
  requireRole(req, 'manager');
  run('DELETE FROM payment_methods WHERE id = :id', { id: params.id });
  sendJson(res, 200, { ok: true });
});

// ---------- روابط التواصل ----------

const PLATFORMS = ['instagram', 'facebook', 'whatsapp', 'phone', 'email', 'telegram', 'youtube'];

adminSettingsRoutes.get('/social-links', async (req, res) => {
  requireRole(req, 'admin');
  sendJson(res, 200, {
    ok: true,
    items: all('SELECT * FROM social_links ORDER BY sort_order, id'),
    platforms: PLATFORMS,
  });
});

adminSettingsRoutes.put('/social-links', async (req, res) => {
  requireRole(req, 'admin');
  const body = await readJson(req);
  const items = Array.isArray(body.items) ? body.items : [];

  for (const item of items) {
    const platform = v.oneOf(item.platform, PLATFORMS, 'المنصة');
    const label = v.str(item.label, 'الاسم الظاهر', { required: false, max: 80 });
    const raw = String(item.url ?? '').trim().slice(0, 600);
    const active = v.bool(item.is_active) ? 1 : 0;
    const order = v.num(item.sort_order ?? 0, 'الترتيب', { required: false, min: 0, max: 99, integer: true });

    run(
      `INSERT INTO social_links (platform, label, url, is_active, sort_order)
       VALUES (:p, :l, :u, :a, :o)
       ON CONFLICT(platform) DO UPDATE SET label = :l, url = :u, is_active = :a, sort_order = :o`,
      { p: platform, l: label, u: raw, a: active, o: order }
    );
  }
  sendJson(res, 200, { ok: true, items: all('SELECT * FROM social_links ORDER BY sort_order, id') });
});
