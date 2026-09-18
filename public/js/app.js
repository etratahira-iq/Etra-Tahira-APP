// نقطة بداية تطبيق الواجهة العامة
import { $, html, raw, icon } from './core/ui.js';
import { bootstrap, state } from './core/store.js';
import { route, setNotFound, startRouter, onNavigate } from './core/router.js';
import { renderChrome } from './core/chrome.js';
import { initBranding } from './core/branding.js';

import { homeView } from './views/home.js';
import {
  lecturesView, lectureDetailView, eventsView, eventDetailView,
  galleryView, lostFoundView, donationsView, contactView,
} from './views/content.js';
import { loginView, registerView } from './views/auth.js';
import { bookingFormView } from './views/booking-form.js';
import { bookingDetailView } from './views/booking-detail.js';
import { accountView, notificationsView } from './views/account.js';

// ---------- المسارات ----------

route('/', homeView);
route('/lectures', lecturesView);
route('/lectures/:id', lectureDetailView);
route('/events', eventsView);
route('/events/:id', eventDetailView);
route('/gallery', galleryView);
route('/lost-found', lostFoundView);
route('/donations', donationsView);
route('/contact', contactView);
route('/login', loginView);
route('/register', registerView);
route('/book', bookingFormView);
route('/booking/:id', bookingDetailView);
route('/account', accountView);
route('/notifications', notificationsView);

setNotFound(() => html`
  <div class="container section">
    <div class="empty">
      <div class="empty__icon">${raw(icon('info', 40))}</div>
      <div class="empty__title">الصفحة غير موجودة</div>
      <p class="small">تأكد من صحة الرابط أو عد إلى الصفحة الرئيسية.</p>
      <a class="btn mt-2" href="#/">العودة للرئيسية</a>
    </div>
  </div>`);

// ---------- التشغيل ----------

(async function start() {
  await bootstrap();
  initBranding();
  renderChrome();
  startRouter($('#app'));
  onNavigate(() => renderChrome());
})();
