// تشغيل الخادم محلياً / على أي استضافة تدعم Node
import { createServer } from 'node:http';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import { handleRequest, boot } from './app.js';
import { ROOT } from './lib/db.js';
import { purgeExpiredSessions } from './lib/auth.js';
import { MODE } from './lib/storage.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

await boot();

const server = createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log([
    '',
    '  ╭──────────────────────────────────────────────╮',
    '  │        حسينية العترة الطاهرة — الخادم        │',
    '  ╰──────────────────────────────────────────────╯',
    '',
    `   الموقع        →  http://${HOST}:${PORT}/`,
    `   لوحة التحكم   →  http://${HOST}:${PORT}/admin`,
    `   واجهة API     →  http://${HOST}:${PORT}/api/health`,
    `   التخزين       →  ${MODE === 'cloud' ? 'سحابي (Upstash Redis)' : 'ملفات محلية'}`,
    '',
  ].join('\n'));

  if (MODE === 'file' && !existsSync(join(ROOT, 'data', 'husseiniya.db'))) {
    console.log('   تنبيه: قاعدة البيانات فارغة — نفّذ "npm run seed" لإضافة بيانات تجريبية.\n');
  }
});

// تنظيف دوري للجلسات المنتهية (كل 6 ساعات)
const cleanup = setInterval(purgeExpiredSessions, 6 * 3600_000);
cleanup.unref?.();

process.on('SIGINT', () => {
  console.log('\nإيقاف الخادم...');
  server.close(() => process.exit(0));
});
