// عميل واجهة برمجة التطبيقات
const BASE = '/api';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body, { raw = false } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'تعذّر الاتصال بالخادم، تحقق من الاتصال بالإنترنت');
  }

  let data = null;
  try { data = await res.json(); } catch { /* استجابة بلا محتوى */ }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || 'حدث خطأ غير متوقع', data?.details);
  }
  return raw ? res : (data ?? {});
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b ?? {}),
  del: (p) => request('DELETE', p),
};

/** يحوّل ملفاً من <input type="file"> إلى Data URL مع فحص الحجم والنوع */
export function fileToDataUrl(file, { maxMB = 4 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('لم يتم اختيار ملف'));
    if (!file.type.startsWith('image/')) return reject(new Error('يُسمح برفع الصور فقط'));
    if (file.size > maxMB * 1024 * 1024) return reject(new Error(`حجم الصورة يجب ألا يتجاوز ${maxMB} ميغابايت`));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('تعذّر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}
