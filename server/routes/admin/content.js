// إدارة المحتوى: محاضرات، مناسبات، معرض، مفقودات، إعلانات، تبرعات، قوائم
import { Router, readJson, sendJson, notFound, badRequest } from '../../lib/http.js';
import { all, get, run } from '../../lib/db.js';
import { requireRole } from '../../lib/auth.js';
import * as v from '../../lib/validate.js';
import { resolveImageField, removeUpload } from '../../lib/uploads.js';

export const adminContentRoutes = new Router();

/**
 * مُنشئ مسارات CRUD عامة لجدول محتوى.
 * fields: { name: (value, row) => normalizedValue }
 */
function crud(router, path, table, fields, opts = {}) {
  const {
    orderBy = 'id DESC',
    searchFields = [],
    imageFields = [],
    afterWrite = null,
  } = opts;

  router.get(path, async (req, res) => {
    requireRole(req, 'admin');
    const url = new URL(req.url, 'http://x');
    const q = (url.searchParams.get('q') || '').trim();
    const where = [];
    const params = {};
    if (q && searchFields.length) {
      where.push('(' + searchFields.map((f) => `${f} LIKE :q`).join(' OR ') + ')');
      params.q = `%${q}%`;
    }
    for (const [key, value] of url.searchParams.entries()) {
      if (key === 'q' || !opts.filters?.includes(key) || !value) continue;
      where.push(`${key} = :f_${key}`);
      params[`f_${key}`] = value;
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    sendJson(res, 200, {
      ok: true,
      items: all(`SELECT * FROM ${table} ${clause} ORDER BY ${orderBy}`, params),
    });
  });

  router.get(`${path}/:id`, async (req, res, { params }) => {
    requireRole(req, 'admin');
    const row = get(`SELECT * FROM ${table} WHERE id = :id`, { id: params.id });
    if (!row) throw notFound('العنصر غير موجود');
    sendJson(res, 200, { ok: true, item: row });
  });

  router.post(path, async (req, res) => {
    requireRole(req, 'admin');
    const body = await readJson(req);
    const data = {};
    for (const [key, parse] of Object.entries(fields)) data[key] = parse(body[key], {}, body, key);

    const cols = Object.keys(data);
    const result = run(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => ':' + c).join(', ')})`,
      data
    );
    const id = Number(result.lastInsertRowid);
    if (afterWrite) afterWrite(id, data, body);
    sendJson(res, 201, { ok: true, item: get(`SELECT * FROM ${table} WHERE id = :id`, { id }) });
  });

  router.put(`${path}/:id`, async (req, res, { params }) => {
    requireRole(req, 'admin');
    const current = get(`SELECT * FROM ${table} WHERE id = :id`, { id: params.id });
    if (!current) throw notFound('العنصر غير موجود');
    const body = await readJson(req);

    // الحقول غير المرسلة تحتفظ بقيمتها الحالية
    const data = {};
    for (const [key, parse] of Object.entries(fields)) {
      const raw = body[key] !== undefined ? body[key] : current[key];
      data[key] = parse(raw, current, body, key);
    }
    data.id = current.id;

    const cols = Object.keys(fields);
    run(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = :${c}`).join(', ')} WHERE id = :id`,
      data
    );
    if (afterWrite) afterWrite(current.id, data, body);
    sendJson(res, 200, { ok: true, item: get(`SELECT * FROM ${table} WHERE id = :id`, { id: current.id }) });
  });

  router.delete(`${path}/:id`, async (req, res, { params }) => {
    requireRole(req, 'admin');
    const row = get(`SELECT * FROM ${table} WHERE id = :id`, { id: params.id });
    if (!row) throw notFound('العنصر غير موجود');
    for (const f of imageFields) removeUpload(row[f]);
    run(`DELETE FROM ${table} WHERE id = :id`, { id: row.id });
    sendJson(res, 200, { ok: true });
  });
}

// ---------- محوّلات حقول جاهزة ----------

const F = {
  text: (label, o = {}) => (val) => v.str(val ?? '', label, { required: false, max: 4000, ...o }),
  required: (label, o = {}) => (val) => v.str(val, label, { ...o }),
  date: (label, o = {}) => (val) => v.date(val, label, o),
  time: (label, o = {}) => (val) => v.time(val, label, o),
  num: (label, o = {}) => (val) => v.num(val, label, { required: false, min: 0, ...o }),
  bool: (def = 0) => (val) => (val === undefined ? def : (v.bool(val) ? 1 : 0)),
  choice: (label, options) => (val) => v.oneOf(val, options, label),
  url: (label) => (val) => v.url(val, label),
  image: (label, key) => (val, cur) => resolveImageField(val, cur?.[key] || '', label),
  keep: (fallback = '') => (val) => (val === undefined || val === null ? fallback : val),
};

// ---------- المحاضرات ----------

crud(adminContentRoutes, '/lectures', 'lectures', {
  title: F.required('عنوان المحاضرة', { min: 2, max: 160 }),
  speaker: F.text('تقديم المحاضرة', { max: 120 }),
  reciter: F.text('اسم القارئ / الملا', { max: 120 }),
  majlis_name: F.text('المجلس الذي يليها', { max: 160 }),
  occasion: F.text('المناسبة', { max: 120 }),
  lecture_date: F.date('تاريخ المحاضرة'),
  lecture_time: F.time('وقت المجلس'),
  description: F.text('الوصف', { max: 4000 }),
  image_path: F.image('صورة المحاضرة', 'image_path'),
  show_in_upcoming: F.bool(0),
  show_in_calendar: F.bool(1),
  show_venue: F.bool(1),
  is_published: F.bool(1),
  updated_at: () => new Date().toISOString().slice(0, 19).replace('T', ' '),
}, {
  orderBy: 'lecture_date DESC, id DESC',
  searchFields: ['title', 'speaker', 'reciter', 'occasion', 'majlis_name', 'description'],
  imageFields: ['image_path'],
  filters: ['occasion', 'speaker', 'is_published'],
});

// ---------- المناسبات ----------

crud(adminContentRoutes, '/events', 'events', {
  title: F.required('عنوان المناسبة', { min: 2, max: 160 }),
  kind: F.text('نوع المناسبة', { max: 60 }),
  event_date: F.date('تاريخ المناسبة'),
  event_time: F.time('وقت المناسبة'),
  speaker: F.text('اسم الملقي', { max: 120 }),
  description: F.text('الوصف', { max: 4000 }),
  image_path: F.image('صورة المناسبة', 'image_path'),
  show_in_upcoming: F.bool(1),
  show_in_calendar: F.bool(1),
  show_venue: F.bool(1),
  is_published: F.bool(1),
  updated_at: () => new Date().toISOString().slice(0, 19).replace('T', ' '),
}, {
  orderBy: 'event_date DESC, id DESC',
  searchFields: ['title', 'kind', 'speaker', 'description'],
  imageFields: ['image_path'],
  filters: ['kind', 'is_published'],
});

// ---------- معرض الصور ----------

crud(adminContentRoutes, '/gallery', 'gallery', {
  title: F.text('عنوان الصورة', { max: 160 }),
  description: F.text('وصف الصورة', { max: 600 }),
  image_path: (val, cur) => {
    const path = resolveImageField(val, cur?.image_path || '', 'الصورة');
    if (!path) throw badRequest('الصورة مطلوبة');
    return path;
  },
  category: F.choice('التصنيف', ['exterior', 'interior', 'occasions']),
  is_cover: F.bool(0),
  sort_order: F.num('الترتيب', { max: 9999, integer: true }),
}, {
  orderBy: 'sort_order, id DESC',
  searchFields: ['title', 'description'],
  imageFields: ['image_path'],
  filters: ['category'],
  afterWrite: (id, data) => {
    // صورة رئيسية واحدة فقط
    if (data.is_cover) run('UPDATE gallery SET is_cover = 0 WHERE id != :id', { id });
  },
});

// ---------- المفقودات ----------

crud(adminContentRoutes, '/lost-found', 'lost_found', {
  item_name: F.required('اسم الغرض', { min: 2, max: 120 }),
  description: F.text('الوصف', { max: 1000 }),
  image_path: F.image('صورة الغرض', 'image_path'),
  found_place: F.text('مكان العثور', { max: 160 }),
  show_place: F.bool(1),
  found_date: F.date('تاريخ العثور'),
  status: F.choice('الحالة', ['available', 'delivered']),
  delivered_at: (val, cur, body) => {
    const status = body?.status;
    if (status === 'delivered') return cur?.delivered_at || new Date().toISOString().slice(0, 10);
    return null;
  },
  internal_note: F.text('ملاحظة داخلية', { max: 600 }),
  is_published: F.bool(1),
  updated_at: () => new Date().toISOString().slice(0, 19).replace('T', ' '),
}, {
  orderBy: 'found_date DESC, id DESC',
  searchFields: ['item_name', 'description', 'found_place'],
  imageFields: ['image_path'],
  filters: ['status', 'is_published'],
});

// ---------- الإعلانات ----------

crud(adminContentRoutes, '/ads', 'advertisements', {
  title: F.required('عنوان الإعلان', { min: 2, max: 160 }),
  description: F.text('وصف الإعلان', { max: 1000 }),
  image_path: F.image('صورة الإعلان', 'image_path'),
  link_url: F.url('رابط الإعلان'),
  placement: F.choice('مكان الظهور', ['home', 'donations', 'both']),
  start_date: F.date('تاريخ البداية', { required: false }),
  end_date: F.date('تاريخ النهاية', { required: false }),
  is_active: F.bool(1),
  sort_order: F.num('الترتيب', { max: 9999, integer: true }),
}, {
  orderBy: 'sort_order, id DESC',
  searchFields: ['title', 'description'],
  imageFields: ['image_path'],
  filters: ['placement', 'is_active'],
});

// ---------- حملات التبرع ----------

crud(adminContentRoutes, '/donation-campaigns', 'donation_campaigns', {
  title: F.required('عنوان الحملة', { min: 2, max: 160 }),
  description: F.text('وصف الحملة', { max: 2000 }),
  image_path: F.image('صورة الحملة', 'image_path'),
  goal_amount: F.num('المبلغ المستهدف', { max: 1_000_000_000 }),
  is_active: F.bool(1),
  sort_order: F.num('الترتيب', { max: 9999, integer: true }),
}, {
  orderBy: 'sort_order, id DESC',
  searchFields: ['title', 'description'],
  imageFields: ['image_path'],
});

// ---------- سجل التبرعات ----------

crud(adminContentRoutes, '/donations', 'donations', {
  campaign_id: (val) => (val ? v.num(val, 'الحملة', { integer: true, min: 1 }) : null),
  donor_name: F.text('اسم المتبرع', { max: 120 }),
  amount: F.num('المبلغ', { min: 0, max: 1_000_000_000 }),
  method_name: F.text('طريقة التبرع', { max: 80 }),
  note: F.text('ملاحظة', { max: 600 }),
  donated_at: F.date('تاريخ التبرع'),
}, {
  orderBy: 'donated_at DESC, id DESC',
  searchFields: ['donor_name', 'note', 'method_name'],
  filters: ['campaign_id'],
});

// ---------- أنواع المناسبات ----------

crud(adminContentRoutes, '/event-types', 'event_types', {
  name: F.required('اسم النوع', { min: 2, max: 80 }),
  slug: (val, cur) => {
    const base = v.str(val || cur?.slug || '', 'المعرّف', { required: false, max: 60 });
    return base || `type-${Date.now().toString(36)}`;
  },
  allows_custom_text: F.bool(0),
  sort_order: F.num('الترتيب', { max: 999, integer: true }),
  is_active: F.bool(1),
}, { orderBy: 'sort_order, id', searchFields: ['name'] });

// ---------- خيارات الطعام ----------

crud(adminContentRoutes, '/food-options', 'food_options', {
  slug: (val, cur) => {
    const base = v.str(val || cur?.slug || '', 'المعرّف', { required: false, max: 60 });
    return base || `food-${Date.now().toString(36)}`;
  },
  label: F.required('عنوان الخيار', { min: 2, max: 120 }),
  description: F.text('الوصف', { max: 600 }),
  has_cost: F.bool(0),
  sort_order: F.num('الترتيب', { max: 999, integer: true }),
  is_active: F.bool(1),
}, { orderBy: 'sort_order, id', searchFields: ['label'] });
