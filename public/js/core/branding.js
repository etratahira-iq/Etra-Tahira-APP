// الهوية البصرية: أيقونة التبويب واسم التطبيق — تُشتق من الإعدادات
import { state, subscribe } from './store.js';

/** الشعار الافتراضي إن لم يرفع المشرف شعاراً من لوحة التحكم */
export const DEFAULT_LOGO = '/img/logo.svg';

/** أيقونة الشاشة الرئيسية على iOS — نقطية دائماً (آبل لا تدعم SVG هنا) */
export const rasterLogoSrc = () =>
  state.settings?.logo_path || state.settings?.default_logo_raster || '/img/logo.png';

/**
 * الأولوية: الشعار المرفوع من لوحة التحكم ← ملف logo.* في public/img ← النسخة المؤقتة.
 */
export const logoSrc = () =>
  state.settings?.logo_path || state.settings?.default_logo || DEFAULT_LOGO;

/** يحدّث أيقونة تبويب المتصفح وأيقونة الشاشة الرئيسية على الهاتف */
export function applyFavicon(src = logoSrc()) {
  const rels = [
    { rel: 'icon', id: 'fav-icon', href: src },
    { rel: 'apple-touch-icon', id: 'fav-apple', href: rasterLogoSrc() },
  ];
  for (const { rel, id, href } of rels) {
    let link = document.getElementById(id);
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
  }

  // لون شريط المتصفح على الهاتف
  let theme = document.querySelector('meta[name="theme-color"]');
  if (!theme) {
    theme = document.createElement('meta');
    theme.name = 'theme-color';
    document.head.appendChild(theme);
  }
  theme.content = '#12483a';
}

/** يضبط اسم التبويب من إعدادات الحسينية */
export function applyTitle(suffix = '') {
  const name = state.settings?.site_name || 'حسينية العترة الطاهرة';
  document.title = suffix ? `${suffix} — ${name}` : name;
}

/** يطبّق الهوية ويعيد تطبيقها كلما تغيّرت الإعدادات من لوحة التحكم */
export function initBranding({ titleSuffix = '' } = {}) {
  applyFavicon();
  applyTitle(titleSuffix);
  subscribe(() => applyFavicon());
}
