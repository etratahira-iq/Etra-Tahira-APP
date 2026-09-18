// نقطة بداية لوحة التحكم
import { $, html, raw, icon } from '../core/ui.js';
import { bootstrap, state, isStaff } from '../core/store.js';
import { route, setNotFound, startRouter, onNavigate } from '../core/router.js';
import { renderShell, renderLogin, renderSidebar, setPage } from './shell.js';
import { initBranding } from '../core/branding.js';

import { dashboardView } from './dashboard.js';
import { adminBookingsView, adminBookingDetailView, adminPaymentsView } from './bookings.js';
import {
  lecturesAdmin, eventsAdmin, galleryAdmin, lostFoundAdmin,
  adsAdmin, campaignsAdmin, donationsLogAdmin,
} from './content-pages.js';
import { settingsView, paymentMethodsView, socialLinksView } from './settings.js';
import {
  usersView, notificationsAdminView, availabilityView, reportsView, listsView, tabbedView,
} from './misc.js';

// ---------- المسارات ----------

const donationsView = tabbedView('/donations', 'التبرعات', [
  { key: 'campaigns', label: 'حملات التبرع', view: campaignsAdmin },
  { key: 'log', label: 'سجل التبرعات', view: donationsLogAdmin },
]);

const settingsTabs = tabbedView('/settings', 'الإعدادات', [
  { key: 'general', label: 'الإعدادات العامة', view: settingsView },
  { key: 'social', label: 'روابط التواصل', view: socialLinksView },
]);

route('/', dashboardView);
route('/bookings', adminBookingsView);
route('/bookings/:id', adminBookingDetailView);
route('/payments', adminPaymentsView);
route('/availability', availabilityView);
route('/reports', reportsView);

route('/lectures', lecturesAdmin);
route('/events', eventsAdmin);
route('/gallery', galleryAdmin);
route('/lost-found', lostFoundAdmin);
route('/ads', adsAdmin);
route('/donations', donationsView);

route('/users', usersView);
route('/notifications', notificationsAdminView);
route('/payment-methods', paymentMethodsView);
route('/lists', listsView);
route('/settings', settingsTabs);

setNotFound(() => {
  setPage('صفحة غير موجودة');
  $('#admin-outlet').innerHTML = html`
    <div class="empty">
      <div class="empty__icon">${raw(icon('info', 40))}</div>
      <div class="empty__title">الصفحة غير موجودة</div>
      <a class="btn mt-2" href="#/">العودة إلى لوحة التحكم</a>
    </div>`;
  return null;
});

// ---------- التشغيل ----------

(async function start() {
  await bootstrap();
  initBranding({ titleSuffix: 'لوحة التحكم' });

  if (!state.user) {
    renderLogin();
    return;
  }
  if (!isStaff()) {
    renderLogin('هذا الحساب لا يملك صلاحية الدخول إلى لوحة التحكم. يرجى الدخول بحساب مشرف.');
    return;
  }

  renderShell();
  startRouter($('#admin-outlet'));
  onNavigate(() => renderSidebar());
})();
