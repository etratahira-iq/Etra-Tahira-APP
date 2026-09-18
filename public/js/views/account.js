// صفحة حسابي ومركز الإشعارات
import { api } from '../core/api.js';
import {
  html, raw, esc, icon, $, $$, toast, busy, errorState, emptyState,
  skeletonLines, modal, closeModal, confirmDialog,
} from '../core/ui.js';
import * as f from '../core/format.js';
import { state, logout, patch, refreshUnread } from '../core/store.js';
import { navigate, rerender } from '../core/router.js';
import { bookingRow } from './components.js';

export async function accountView({ query }) {
  if (!state.user) {
    navigate('/login?next=' + encodeURIComponent('/account'), { replace: true });
    return null;
  }

  const tab = query.tab || 'bookings';
  const app = $('#app');
  app.innerHTML = `<div class="container section">${skeletonLines(6)}</div>`;

  let bookings = [];
  let loadError = null;
  try {
    bookings = (await api.get('/bookings')).items;
  } catch (err) {
    loadError = err.message;
  }

  const u = state.user;
  const invoiced = bookings.filter((b) => b.invoice);
  const deposits = bookings.flatMap((b) =>
    (b.payments || []).map((p) => ({ ...p, booking_code: b.code, booking_id: b.id })));

  app.innerHTML = html`
    <div class="container section">
      <div class="account-head">
        <div class="account-head__avatar">${f.initials(u.name)}</div>
        <div style="min-width:0">
          <div class="account-head__name">${u.name}</div>
          <div class="account-head__phone">${u.phone}</div>
        </div>
        <div class="spacer"></div>
        <button class="btn btn--sm btn--ghost" id="btn-logout"
                style="color:#fff;border-color:rgba(255,255,255,.35)">
          ${raw(icon('logout', 17))} خروج
        </button>
      </div>

      ${raw(u.role !== 'user' ? `<div class="alert alert--info">
        لديك صلاحية ${u.role === 'manager' ? 'مدير' : 'مشرف'} —
        <a href="/admin"><strong>الانتقال إلى لوحة التحكم</strong></a></div>` : '')}

      <div class="tabs">
        ${raw([
          ['bookings', `حجوزاتي (${bookings.length})`],
          ['invoices', `الفواتير (${invoiced.length})`],
          ['deposits', `العربون (${deposits.length})`],
          ['profile', 'بياناتي'],
        ].map(([key, label]) =>
          `<a class="tab ${tab === key ? 'tab--on' : ''}" href="#/account?tab=${key}">${esc(label)}</a>`).join(''))}
      </div>

      <div id="tab-body">
        ${raw(loadError ? errorState(loadError) : renderTab(tab, { bookings, invoiced, deposits, u }))}
      </div>
    </div>`;

  $('#btn-logout').addEventListener('click', async () => {
    const ok = await confirmDialog('هل تريد تسجيل الخروج من حسابك؟', {
      title: 'تسجيل الخروج', okText: 'خروج',
    });
    if (!ok) return;
    await logout();
    toast('تم تسجيل الخروج', 'ok');
    navigate('/');
  });

  bindProfileForm();
  return null;
}

function renderTab(tab, ctx) {
  if (tab === 'bookings') {
    if (!ctx.bookings.length) {
      return html`
        ${raw(emptyState('لا توجد حجوزات', 'لم تقم بأي حجز بعد. يمكنك حجز الحسينية لمناسبتك من هنا.', '📋'))}
        <div class="center mt-2"><a class="btn" href="#/book">حجز الحسينية</a></div>`;
    }
    return html`
      <div class="row row--between mb-2">
        <span class="muted small">${ctx.bookings.length} طلب حجز</span>
        <a class="btn btn--sm" href="#/book">حجز جديد</a>
      </div>
      <div class="grid grid--2">${raw(ctx.bookings.map(bookingRow).join(''))}</div>`;
  }

  if (tab === 'invoices') {
    if (!ctx.invoiced.length) return emptyState('لا توجد فواتير', 'تصدر الفاتورة بعد تسعير الحجز من الإدارة.', '🧾');
    return html`
      <div class="grid grid--2">
        ${raw(ctx.invoiced.map((b) => `
          <div class="card"><div class="card__body">
            <div class="row row--between">
              <div>
                <div class="booking-code small muted">${esc(b.invoice.number)}</div>
                <h3 style="font-size:1.05rem;margin:.2rem 0">${esc(b.event_type_display)}</h3>
                <div class="small muted num">${esc(f.dateRangeLabel(b.start_date, b.end_date))}</div>
              </div>
              <span class="badge badge--${b.status_tone}">${esc(b.status_label)}</span>
            </div>
            <div class="dl mt-2">
              <div class="dl__row"><span class="dl__key">المجموع</span>
                <span class="dl__val num">${esc(f.money(b.total))}</span></div>
              <div class="dl__row"><span class="dl__key">المتبقي</span>
                <span class="dl__val num">${esc(f.money(b.remaining))}</span></div>
            </div>
            <a class="btn btn--sm btn--ghost btn--block mt-2" href="#/booking/${b.id}">عرض الحجز والفاتورة</a>
          </div></div>`).join(''))}
      </div>`;
  }

  if (tab === 'deposits') {
    if (!ctx.deposits.length) return emptyState('لا توجد عمليات دفع', 'ستظهر هنا وصولات العربون التي ترسلها.', '💳');
    const statusMap = {
      pending: ['بانتظار التأكيد', 'warn'], accepted: ['تم القبول', 'ok'],
      rejected: ['مرفوض', 'bad'], resend: ['يرجى إعادة الإرسال', 'warn'],
    };
    return html`
      <div class="grid grid--2">
        ${raw(ctx.deposits.map((p) => {
          const [label, tone] = statusMap[p.status] || [p.status, 'muted'];
          return `<div class="card"><div class="card__body">
            <div class="row row--between">
              <div>
                <div class="bold num" style="font-size:1.1rem">${esc(f.money(p.amount))}</div>
                <div class="small muted">${esc(p.method_name)} · ${esc(p.booking_code)}</div>
                <div class="tiny faint">${esc(f.relative(p.created_at))}</div>
              </div>
              <span class="badge badge--${tone}">${esc(label)}</span>
            </div>
            ${p.admin_note ? `<div class="small muted mt-1">${esc(p.admin_note)}</div>` : ''}
            <a class="btn btn--sm btn--quiet mt-2" href="#/booking/${p.booking_id}">عرض الحجز</a>
          </div></div>`;
        }).join(''))}
      </div>`;
  }

  // بياناتي
  return html`
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start">
      <div class="card">
        <div class="card__head">بياناتي</div>
        <div class="card__body">
          <form id="profile-form">
            <div class="field">
              <label class="field__label" for="pf-name">الاسم</label>
              <input class="input" id="pf-name" value="${ctx.u.name}" required>
            </div>
            <div class="field">
              <label class="field__label" for="pf-phone">رقم الهاتف</label>
              <input class="input" id="pf-phone" value="${ctx.u.phone}" dir="ltr" style="text-align:right" disabled>
              <span class="field__hint">رقم الهاتف هو معرّف الحساب ولا يمكن تغييره</span>
            </div>
            <button class="btn" type="submit">حفظ التعديلات</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card__head">تغيير كلمة المرور</div>
        <div class="card__body">
          <form id="pass-form">
            <div class="field">
              <label class="field__label" for="pf-cur">كلمة المرور الحالية</label>
              <input class="input" id="pf-cur" type="password" autocomplete="current-password" required>
            </div>
            <div class="field">
              <label class="field__label" for="pf-new">كلمة المرور الجديدة</label>
              <input class="input" id="pf-new" type="password" autocomplete="new-password" required>
            </div>
            <button class="btn" type="submit">تغيير كلمة المرور</button>
          </form>
        </div>
      </div>
    </div>`;
}

function bindProfileForm() {
  $('#profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    busy(btn, true);
    try {
      const res = await api.patch('/auth/me', { name: $('#pf-name').value });
      patch({ user: res.user });
      toast('تم حفظ التعديلات', 'ok');
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      busy(btn, false);
    }
  });

  $('#pass-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    busy(btn, true);
    try {
      await api.post('/auth/change-password', {
        current_password: $('#pf-cur').value,
        new_password: $('#pf-new').value,
      });
      toast('تم تغيير كلمة المرور بنجاح', 'ok');
      e.target.reset();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      busy(btn, false);
    }
  });
}

// ================= مركز الإشعارات =================

export async function notificationsView() {
  if (!state.user) {
    navigate('/login?next=' + encodeURIComponent('/notifications'), { replace: true });
    return null;
  }

  const app = $('#app');
  app.innerHTML = `<div class="container section">${skeletonLines(6)}</div>`;

  let data;
  try {
    data = await api.get('/notifications');
  } catch (err) {
    app.innerHTML = `<div class="container section">${errorState(err.message)}</div>`;
    return null;
  }

  app.innerHTML = html`
    <div class="container section">
      <div class="section-head">
        <div>
          <h1 class="section-title">الإشعارات</h1>
          <p class="section-sub">${data.unread > 0 ? `${data.unread} إشعار غير مقروء` : 'كل الإشعارات مقروءة'}</p>
        </div>
        ${raw(data.unread > 0 ? '<button class="btn btn--sm btn--ghost" id="read-all">تعليم الكل كمقروء</button>' : '')}
      </div>

      ${raw(data.items.length ? `
        <div class="card">
          ${data.items.map((n) => `
            <div class="notif-item ${n.is_read ? '' : 'notif-item--unread'}" data-id="${n.id}"
                 data-link="${esc(n.link || '')}">
              ${n.is_read ? '<span style="width:9px;flex:none"></span>' : '<span class="notif-item__dot"></span>'}
              <div style="min-width:0;flex:1">
                <div class="notif-item__title">${esc(n.title)}</div>
                ${n.body ? `<div class="notif-item__body">${esc(n.body)}</div>` : ''}
                <div class="notif-item__time">${esc(f.relative(n.created_at))}</div>
              </div>
            </div>`).join('')}
        </div>` : emptyState('لا توجد إشعارات', 'ستصلك هنا تحديثات حجوزاتك وإعلانات الحسينية.', '🔔'))}
    </div>`;

  $('#read-all')?.addEventListener('click', async () => {
    await api.post('/notifications/read-all');
    await refreshUnread();
    rerender();
  });

  $$('.notif-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.id;
      const link = el.dataset.link;
      try { await api.post(`/notifications/${id}/read`); } catch { /* تجاهل */ }
      await refreshUnread();
      if (link) location.hash = link;
      else rerender();
    });
  });
  return null;
}

export { modal, closeModal };
