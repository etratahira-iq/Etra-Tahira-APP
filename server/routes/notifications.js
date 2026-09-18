// إشعارات المستخدم
import { Router, sendJson, readJson } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { listForUser, unreadCount, markRead, markAllRead } from '../lib/notify.js';

export const notificationRoutes = new Router();

notificationRoutes.get('/', async (req, res) => {
  const user = requireUser(req);
  sendJson(res, 200, {
    ok: true,
    items: listForUser(user.id),
    unread: unreadCount(user.id),
  });
});

notificationRoutes.post('/:id/read', async (req, res, { params }) => {
  const user = requireUser(req);
  markRead(user.id, Number(params.id));
  sendJson(res, 200, { ok: true, unread: unreadCount(user.id) });
});

notificationRoutes.post('/read-all', async (req, res) => {
  const user = requireUser(req);
  await readJson(req).catch(() => ({}));
  markAllRead(user.id);
  sendJson(res, 200, { ok: true, unread: 0 });
});
