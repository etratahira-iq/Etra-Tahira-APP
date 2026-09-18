// موجّه بسيط قائم على الـ hash — يدعم :params
const routes = [];
let notFoundView = () => '<div class="container section">الصفحة غير موجودة</div>';
let outlet = null;
let currentPath = '';
const afterHooks = new Set();

export function route(pattern, view) {
  const keys = [];
  const src = pattern
    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  routes.push({ regex: new RegExp(`^${src}$`), keys, view });
}

export function setNotFound(view) { notFoundView = view; }
export function onNavigate(fn) { afterHooks.add(fn); return () => afterHooks.delete(fn); }

export function currentRoute() { return currentPath; }

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (replace) location.replace(target);
  else location.hash = target;
}

function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, queryString] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryString || ''));
  return { path: path || '/', query };
}

async function render() {
  const { path, query } = parse();
  currentPath = path;

  let match = null;
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      match = { view: r.view, params };
      break;
    }
  }

  const view = match ? match.view : notFoundView;
  const ctx = { params: match?.params || {}, query, path };

  try {
    const result = await view(ctx);
    if (typeof result === 'string') outlet.innerHTML = result;
  } catch (err) {
    console.error(err);
    outlet.innerHTML = `<div class="container section"><div class="alert alert--bad">
      تعذّر عرض الصفحة: ${err.message || 'خطأ غير معروف'}</div></div>`;
  }

  for (const fn of afterHooks) {
    try { fn(ctx); } catch (e) { console.error(e); }
  }
}

export function startRouter(outletEl) {
  outlet = outletEl;
  window.addEventListener('hashchange', () => {
    render();
    // العودة لأعلى الصفحة عند كل تنقل (سلوك متوقع للمستخدم)
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  });
  render();
}

export function rerender() { return render(); }
