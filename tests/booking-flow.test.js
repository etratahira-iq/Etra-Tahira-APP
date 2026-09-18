// اختبار سيناريو الحجز الكامل من التسجيل حتى تثبيت الحجز وإصدار الفاتورة
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TEST_PORT) || 3222;
const BASE = `http://127.0.0.1:${PORT}/api`;
// قاعدة بيانات معزولة للاختبار حتى لا تتأثر بيانات التطوير
const TEST_DB = join(ROOT, 'data', 'test.db');
const TEST_ENV = { ...process.env, DB_PATH: TEST_DB, PORT: String(PORT), HOST: '127.0.0.1' };
let server;

/** عميل HTTP بسيط يحتفظ بالكوكيز لكل مستخدم */
function client() {
  let cookie = '';
  return async function call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    for (const c of setCookie) {
      const pair = c.split(';')[0];
      if (pair.startsWith('hst_session=')) cookie = pair;
    }
    let json = null;
    try { json = await res.json(); } catch { /* لا شيء */ }
    return { status: res.status, body: json };
  };
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// صورة PNG صغيرة صالحة (1×1) لاستخدامها كوصل دفع
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

before(async () => {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(TEST_DB + suffix, { force: true });
  }
  const seed = spawnSync(process.execPath, ['server/db/seed.js', '--reset'], {
    cwd: ROOT, env: TEST_ENV, stdio: 'ignore',
  });
  if (seed.status !== 0) throw new Error('تعذّر تهيئة قاعدة بيانات الاختبار');

  server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT, env: TEST_ENV, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* انتظار */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('تعذّر تشغيل الخادم للاختبار');
});

after(() => { server?.kill(); });

test('سيناريو الحجز الكامل', async (t) => {
  const user = client();
  const admin = client();
  const phone = '0770' + String(Date.now()).slice(-7);
  const today = new Date().toISOString().slice(0, 10);
  const startDate = addDays(today, 120 + Math.floor(Math.random() * 200));

  await t.test('1) إنشاء حساب برقم هاتف وكلمة مرور', async () => {
    const r = await user('POST', '/auth/register', {
      name: 'مستخدم الاختبار', phone, password: 'test1234', password_confirm: 'test1234',
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.phone, phone);
    assert.equal(r.body.user.role, 'user');
  });

  await t.test('2) رفض كلمة مرور قصيرة', async () => {
    const r = await client()('POST', '/auth/register', { name: 'خطأ', phone: '07701234567', password: '12' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /6 خانات/);
  });

  let bookingId;
  let bookingCode;

  await t.test('3) إرسال طلب حجز: 3 أيام، فاتحة، 180 شخص، طعام من مطبخ الحسينية', async () => {
    const opts = await user('GET', '/booking-options');
    assert.equal(opts.status, 200);
    const fatiha = opts.body.event_types.find((e) => e.slug === 'fatiha');
    const kitchen = opts.body.food_options.find((f) => f.slug === 'kitchen');
    assert.ok(fatiha && kitchen);

    const r = await user('POST', '/bookings', {
      start_date: startDate, days: 3,
      event_type_id: fatiha.id, attendees: 180, food_option_id: kitchen.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const b = r.body.booking;
    bookingId = b.id;
    bookingCode = b.code;
    assert.equal(b.status, 'pending_review');
    assert.equal(b.status_label, 'قيد المراجعة');
    assert.equal(b.days, 3);
    assert.equal(b.end_date, addDays(startDate, 2), 'تاريخ النهاية = البداية + عدد الأيام - 1');
    assert.equal(b.attendees, 180);
    assert.equal(b.food_option_slug, 'kitchen');
  });

  await t.test('4) منع الحجز المتعارض على نفس التواريخ', async () => {
    const r = await user('POST', '/bookings', {
      start_date: addDays(startDate, 1), days: 2,
      event_type_id: 1, attendees: 180, food_option_id: 1,
    });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /هذا التاريخ غير متاح للحجز/);
  });

  await t.test('5) فحص التوفر يعيد available=false للتواريخ المحجوزة', async () => {
    const r = await user('POST', '/bookings/check-availability', { start_date: startDate, days: 1 });
    assert.equal(r.status, 200);
    assert.equal(r.body.available, false);
  });

  await t.test('6) وصول إشعار "تم استلام طلب الحجز" للمستخدم', async () => {
    const r = await user('GET', '/notifications');
    assert.equal(r.status, 200);
    assert.ok(r.body.items.some((n) => n.title === 'تم استلام طلب الحجز'));
  });

  await t.test('7) منع المستخدم العادي من دخول لوحة التحكم', async () => {
    const r = await user('GET', '/admin/stats');
    assert.equal(r.status, 403);
  });

  await t.test('8) دخول المشرف', async () => {
    const r = await admin('POST', '/auth/login', { phone: '07700000002', password: 'admin1234' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.user.role, 'admin');
  });

  await t.test('9) المشرف يحدد سعر اليوم وتكلفة الطعام → يُحسب المجموع', async () => {
    const r = await admin('POST', `/admin/bookings/${bookingId}/price`, {
      daily_price: 100000, food_cost: 150000, deposit_amount: 150000,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const b = r.body.booking;
    assert.equal(b.subtotal, 300000, '100000 × 3 أيام');
    assert.equal(b.food_cost, 150000);
    assert.equal(b.total, 450000, '300000 + 150000');
    assert.equal(b.deposit_amount, 150000);
    assert.equal(b.remaining, 450000, 'لم يُدفع عربون بعد');
    assert.equal(b.status, 'awaiting_user_approval');
  });

  await t.test('10) المستخدم يرى الفاتورة بالأرقام الصحيحة', async () => {
    const r = await user('GET', `/bookings/${bookingId}/invoice`);
    assert.equal(r.status, 200);
    const snap = r.body.invoice.snapshot;
    assert.match(r.body.invoice.number, /^INV-\d{4}-\d{4}$/);
    assert.equal(snap.totals.total, 450000);
    assert.equal(snap.booking.days, 3);
    assert.equal(snap.booking.attendees, 180);
    assert.equal(snap.items.length, 2, 'بند الحجز + بند الطعام');
  });

  await t.test('11) مستخدم آخر لا يستطيع رؤية الحجز', async () => {
    const other = client();
    await other('POST', '/auth/login', { phone: '07700000012', password: 'user1234' });
    const r = await other('GET', `/bookings/${bookingId}`);
    assert.equal(r.status, 403);
  });

  await t.test('12) المستخدم يوافق على السعر → بانتظار العربون', async () => {
    const r = await user('POST', `/bookings/${bookingId}/approve`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.booking.status, 'awaiting_deposit');
    assert.equal(r.body.booking.status_label, 'بانتظار العربون');
    assert.equal(r.body.booking.can_pay_deposit, true);
  });

  await t.test('13) المستخدم لا يستطيع تغيير حالة الحجز بنفسه', async () => {
    const r = await user('POST', `/admin/bookings/${bookingId}/status`, { status: 'confirmed' });
    assert.equal(r.status, 403);
  });

  await t.test('14) رفض وصل دفع بصيغة غير صورة', async () => {
    const methods = await user('GET', '/payment-methods');
    const r = await user('POST', '/payments/deposit', {
      booking_id: bookingId, method_id: methods.body.methods[0].id,
      amount: 150000, receipt: 'data:text/plain;base64,aGVsbG8=',
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /الصور فقط|غير مدعوم/);
  });

  await t.test('15) المستخدم يرسل العربون مع صورة الوصل', async () => {
    const methods = await user('GET', '/payment-methods');
    assert.ok(methods.body.methods.length >= 1);
    const r = await user('POST', '/payments/deposit', {
      booking_id: bookingId,
      method_id: methods.body.methods[0].id,
      amount: 150000,
      reference: 'TRX-TEST-1',
      receipt: PNG_1PX,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.booking.status, 'deposit_submitted');
    assert.equal(r.body.booking.status_label, 'بانتظار تأكيد العربون');
  });

  await t.test('16) المشرف يؤكد العربون → تم تثبيت الحجز', async () => {
    const detail = await admin('GET', `/admin/bookings/${bookingId}`);
    const payment = detail.body.payments[0];
    assert.equal(payment.status, 'pending');

    const r = await admin('POST', `/admin/bookings/payments/${payment.id}/review`, { action: 'accept' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const b = r.body.booking;
    assert.equal(b.status, 'deposit_paid');
    assert.equal(b.deposit_paid, 150000);
    assert.equal(b.remaining, 300000, '450000 − 150000');
  });

  await t.test('17) الخط الزمني يعكس المراحل المنجزة', async () => {
    const r = await user('GET', `/bookings/${bookingId}`);
    const timeline = r.body.booking.timeline;
    assert.equal(timeline.length, 6);
    assert.equal(timeline[timeline.length - 1].state, 'current', 'آخر مرحلة: تم تثبيت الحجز');
    assert.ok(r.body.booking.history.length >= 4);
  });

  await t.test('18) الفاتورة النهائية تعرض المتبقي بعد العربون', async () => {
    const r = await user('GET', `/bookings/${bookingId}/invoice`);
    const t_ = r.body.invoice.snapshot.totals;
    assert.equal(t_.total, 450000);
    assert.equal(t_.deposit_paid, 150000);
    assert.equal(t_.remaining, 300000);
  });

  await t.test('19) إشعار "تم تثبيت الحجز" وصل للمستخدم', async () => {
    const r = await user('GET', '/notifications');
    assert.ok(r.body.items.some((n) => n.title === 'تم تثبيت الحجز'));
  });

  await t.test('20) لا يمكن إلغاء الحجز بعد تثبيته من قبل المستخدم', async () => {
    const r = await user('POST', `/bookings/${bookingId}/cancel`, { reason: 'تجربة' });
    assert.equal(r.status, 400);
  });

  await t.test('21) الحجز يظهر في إحصائيات لوحة التحكم', async () => {
    const r = await admin('GET', '/admin/stats');
    assert.equal(r.status, 200);
    assert.ok(r.body.stats.bookings_total >= 1);
    assert.ok(r.body.stats.deposits_total >= 150000);
  });

  await t.test('22) البحث في حجوزات لوحة التحكم برقم الطلب', async () => {
    const r = await admin('GET', `/admin/bookings?q=${bookingCode}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 1);
    assert.equal(r.body.items[0].code, bookingCode);
  });
});

test('قواعد التوفر والتواريخ المحجوبة', async (t) => {
  const admin = client();
  await admin('POST', '/auth/login', { phone: '07700000002', password: 'admin1234' });
  const today = new Date().toISOString().slice(0, 10);
  const blockDate = addDays(today, 700);

  await t.test('المشرف يحجب تاريخاً', async () => {
    const r = await admin('POST', '/admin/bookings/availability/blocked', {
      date: blockDate, days: 2, reason: 'صيانة',
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.added.length, 2);
  });

  await t.test('المستخدم لا يستطيع الحجز في تاريخ محجوب', async () => {
    const user = client();
    await user('POST', '/auth/login', { phone: '07700000010', password: 'user1234' });
    const r = await user('POST', '/bookings', {
      start_date: blockDate, days: 1, event_type_id: 1, attendees: 180, food_option_id: 1,
    });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /غير متاح للحجز/);
  });
});

test('صلاحيات لوحة التحكم', async (t) => {
  await t.test('غير المسجّل يُمنع', async () => {
    const r = await client()('GET', '/admin/stats');
    assert.equal(r.status, 401);
  });

  await t.test('المشرف لا يستطيع تغيير الصلاحيات (للمدير فقط)', async () => {
    const admin = client();
    await admin('POST', '/auth/login', { phone: '07700000002', password: 'admin1234' });
    const r = await admin('PATCH', '/admin/users/3', { role: 'manager' });
    assert.equal(r.status, 403);
  });

  await t.test('المدير يستطيع تغيير الصلاحيات', async () => {
    const mgr = client();
    await mgr('POST', '/auth/login', { phone: '07700000001', password: 'admin1234' });
    const users = await mgr('GET', '/admin/users?role=user');
    const target = users.body.items[0];
    const r = await mgr('PATCH', `/admin/users/${target.id}`, { role: 'admin' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.role, 'admin');
    await mgr('PATCH', `/admin/users/${target.id}`, { role: 'user' });
  });

  await t.test('كلمة المرور لا تُعاد أبداً في الاستجابات', async () => {
    const mgr = client();
    await mgr('POST', '/auth/login', { phone: '07700000001', password: 'admin1234' });
    const r = await mgr('GET', '/admin/users');
    const raw = JSON.stringify(r.body);
    assert.ok(!raw.includes('password_hash'));
    assert.ok(!raw.includes('password_salt'));
  });
});

test('حماية أرقام الدفع من التعديل بواسطة المستخدم', async () => {
  const user = client();
  await user('POST', '/auth/login', { phone: '07700000010', password: 'user1234' });
  const r = await user('PUT', '/admin/payment-methods/1', { name: 'اختراق', account_number: '999' });
  assert.equal(r.status, 403);
});

test('نطاق عرض المناسبات لا يتجاوز شهرين هجريين', async () => {
  const c = client();
  const cur = await c('GET', '/calendar?offset=0');
  const next = await c('GET', '/calendar?offset=1');
  const beyond = await c('GET', '/calendar?offset=5');
  assert.equal(cur.body.offset, 0);
  assert.equal(next.body.offset, 1);
  assert.equal(beyond.body.offset, 0, 'أي قيمة غير 1 تُعامل كالشهر الحالي');
  assert.notEqual(cur.body.window.label, next.body.window.label);
  assert.ok(next.body.window.start > cur.body.window.end);
});
