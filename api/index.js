/* نقطة الدخول على Vercel — تمرّر كل الطلبات إلى تطبيق الحسينية */
import { handleRequest } from '../server/app.js';

export default function handler(req, res) {
  return handleRequest(req, res);
}
