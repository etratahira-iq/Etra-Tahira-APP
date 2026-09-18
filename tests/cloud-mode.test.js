/**
 * يتحقق أن وضع التخزين السحابي (Vercel) يعمل فعلياً:
 * يشغّل خادم Upstash Redis وهمياً محلياً، ثم يشغّل التطبيق بوضع cloud،
 * ويتأكد أن البيانات تُحفظ في «السحابة» وتبقى بعد إعادة تشغيل الخادم —
 * وهو بالضبط ما يحدث على Vercel عند كل نشر أو بدء نسخة جديدة.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KV_PORT = Number(process.env.KV_TEST_PORT) || 3411;
const APP_PORT = Number(process.env.CLOUD_TEST_PORT) || 3412;
const BASE = `http://127.0.0.1:${APP_PORT}`;

/** مخزن Redis وهمي في الذاكرة يفهم الأوامر التي يستخدمها التطبيق */
const store = new Map();
const lists = new Map();
let kvServer;
let app;

function runCommand(cmd) {
  const [op, ...args] = cmd;
  switch (String(op).toUpperCase()) {
    case 'GET':
      return store.has(args[0]) ? store.get(args[0]) : null;
    case 'SET': {
      const [key, value, ...rest] = args;
      const flags = rest.map((x) => String(x).toUpperCase());
      if (flags.includes('NX') && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }
    case 'DEL':
      return store.delete(args[0]) ? 1 : 0;
    case 'LPUSH': {
      const [key, ...vals] = args;
      const list = lists.get(key) || [];
      list.unshift(...vals);
      lists.set(key, list);
      return list.length;
    }
    case 'LRANGE': {
      const [key, start, stop] = args;
      const list = lists.get(key) || [];
      const end = Number(stop) < 0 ? list.length + Number(stop) + 1 : Number(stop) + 1;
      return list.slice(Number(start), end);
    }
    case 'LTRIM': {
      const [key, start, stop] = args;
      const list = lists.get(key) || [];
      const end = Number(stop) < 0 ? list.length + Number(stop) + 1 : Number(stop) + 1;
      lists.set(key, list.slice(Number(start), end));
      return 'OK';
    }
    default:
      return null;
  }
}

function startKv() {
  return new Promise((resolve) => {
    kvServer = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let result = null;
        try { result = runCommand(JSON.parse(body)); } catch { /* تجاهل */ }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result }));
      });
    });
    kvServer.listen(KV_PORT, '127.0.0.1', resolve);
  });
}

function cloudEnv() {
  return {
    ...process.env,
    PORT: String(APP_PORT),
    HOST: '127.0.0.1',
    KV_REST_API_URL: `http://127.0.0.1:${KV_PORT}`,
    KV_REST_API_TOKEN: 'test-token',
    ADMIN_PHONE: '07701234567',
    ADMIN_PASSWORD: 'cloud-admin-pass',
    ADMIN_NAME: 'مدير الاختبار',
    DB_PATH: '',
  };
}

async function startApp() {
  app = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT, env: cloudEnv(), stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return r.json();
    } catch { /* انتظار */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('تعذّر تشغيل التطبيق بوضع السحابة');
}

async function stopApp() {
  if (!app) return;
  app.kill();
  await new Promise((r) => setTimeout(r, 400));
  app = null;
}

before(async () => { await startKv(); });
after(async () => { await stopApp(); kvServer?.close(); });

test('التطبيق يعمل بوضع التخزين السحابي', async (t) => {
  let health;

  await t.test('1) يبدأ بوضع cloud لا file', async () => {
    health = await startApp();
    assert.equal(health.storage, 'cloud');
  });

  await t.test('2) يُنشئ قاعدة بيانات في السحابة عند أول تشغيل', async () => {
    assert.ok(store.has('hst:db'), 'يجب أن تُحفظ القاعدة في Redis');
    assert.ok(String(store.get('hst:db')).length > 1000, 'حجم القاعدة غير منطقي');
  });

  await t.test('3) حساب المدير الأول يعمل بالبيانات من متغيرات البيئة', async () => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '07701234567', password: 'cloud-admin-pass' }),
    });
    const j = await r.json();
    assert.equal(r.status, 200, JSON.stringify(j));
    assert.equal(j.user.role, 'manager');
  });

  await t.test('4) لا توجد بيانات تجريبية في النسخة السحابية', async () => {
    const j = await (await fetch(`${BASE}/api/home`)).json();
    assert.equal(j.lectures.length, 0, 'يجب ألا تُزرع محاضرات تجريبية في الإنتاج');
    assert.equal(j.upcoming_lecture, null);
  });

  let cookie;
  await t.test('5) الكتابة تُحفظ في السحابة', async () => {
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '07701234567', password: 'cloud-admin-pass' }),
    });
    cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

    const before = store.get('hst:db');
    const r = await fetch(`${BASE}/api/admin/lectures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        title: 'محاضرة سحابية', speaker: 'أم تجريبية', reciter: 'الملا تجريبية',
        lecture_date: '2027-03-01', is_published: 1,
      }),
    });
    assert.equal(r.status, 201, JSON.stringify(await r.json()));

    // ننتظر رفع القاعدة بعد انتهاء الطلب
    await new Promise((res) => setTimeout(res, 900));
    assert.notEqual(store.get('hst:db'), before, 'يجب أن تتغيّر القاعدة المحفوظة في Redis');
  });

  await t.test('6) البيانات تبقى بعد إعادة تشغيل الخادم (نشر جديد)', async () => {
    await stopApp();
    await startApp();

    const j = await (await fetch(`${BASE}/api/lectures`)).json();
    assert.equal(j.total, 1, 'يجب أن تبقى المحاضرة بعد إعادة التشغيل');
    assert.equal(j.items[0].title, 'محاضرة سحابية');
    assert.equal(j.items[0].reciter, 'الملا تجريبية');
  });

  await t.test('7) النسخ الاحتياطي يعمل في السحابة', async () => {
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '07701234567', password: 'cloud-admin-pass' }),
    });
    const c = login.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');

    const mk = await (await fetch(`${BASE}/api/cron/backups`, { method: 'POST', headers: { Cookie: c } })).json();
    assert.equal(mk.ok, true);

    const ls = await (await fetch(`${BASE}/api/cron/backups`, { headers: { Cookie: c } })).json();
    assert.equal(ls.storage, 'cloud');
    assert.ok(ls.items.length >= 1, 'يجب أن تظهر النسخة الاحتياطية');
    assert.ok(String(ls.items[0].id).startsWith('hst:backup:'));
  });

  await t.test('8) رفع صورة بلا مخزن صور يُرفض برسالة واضحة', async () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '07701234567', password: 'cloud-admin-pass' }),
    });
    const c = login.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');

    const r = await fetch(`${BASE}/api/admin/gallery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c },
      body: JSON.stringify({ image_path: PNG, category: 'interior', title: 'اختبار' }),
    });
    const j = await r.json();
    assert.equal(r.status, 400);
    assert.match(j.error, /تخزين الصور/);
  });
});
