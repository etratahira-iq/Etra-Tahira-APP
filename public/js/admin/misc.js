// المستخدمون، الإشعارات، التوفر، التقارير، القوائم
import { api } from '../core/api.js';
import {
  html, raw, esc, $, $$, toast, busy, errorState, emptyState,
  skeletonLines, modal, closeModal, confirmDialog,
} from '../core/ui.js';
import * as f from '../core/format.js';
import { setPage, roleLabel } from './shell.js';
import { rerender } from '../core/router.js';
import { state } from '../core/store.js';
import { eventTypesAdmin, foodOptionsAdmin } from './content-pages.js';

// ================= المستخدمون =================

export async function usersView({ query }) {
  const canManageRoles = state.user?.role === 'manager';
  setPage('المستخدمون', '<button class="btn btn--sm" id="u-add">إضافة مستخدم</button>');
  const out = $('#admin-outlet');
  out.innerHTML = skeletonLines(6);

  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.role) params.set('role', query.role);

  let items;
  try {
    items = (await api.get(`/admin/users?${params}`)).items;
  } catch (err) {
    out.innerHTML = errorState(err.message);
    return null;
  }

  out.innerHTML = html`
    <form class="toolbar" id="u-filters">
      <input class="input" name="q" type="search" placeholder="بحث بالاسم أو الهاتف" value="${query.q || ''}">
      <select class="select" name="role">
        <option value="">كل الصلاحيات</option>
        ${raw(['user', 'admin', 'manager'].map((r) =>
          `<option value="${r}" ${query.role === r ? 'selected' : ''}>${esc(roleLabel(r))}</option>`).join(''))}
      </select>
      <button class="btn btn--sm" type="submit">تطبيق</button>
      <a class="btn btn--sm btn--quiet" href="#/users">مسح</a>
    </form>

    ${raw(!canManageRoles ? '<div class="alert alert--info">تغيير الصلاحيات وحذف المستخدمين متاح للمدير فقط.</div>' : '')}

    ${raw(items.length ? `
      <div class="table-wrap">
        <table class="table table--cards">
          <thead><tr><th>الاسم</th><th>رقم الهاتف</th><th>الصلاحية</th>
            <th>الحجوزات</th><th>تاريخ التسجيل</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            ${items.map((u) => `
              <tr>
                <td data-label="الاسم"><strong>${esc(u.name)}</strong></td>
                <td data-label="رقم الهاتف"><span style="direction:ltr;display:inline-block">${esc(u.phone)}</span></td>
                <td data-label="الصلاحية"><span class="badge ${u.role === 'user' ? '' : 'badge--gold'}">
                  ${esc(roleLabel(u.role))}</span></td>
                <td data-label="الحجوزات" class="num">${u.bookings_count}</td>
                <td data-label="تاريخ التسجيل" class="num small">${esc(f.dateShort(u.created_at))}</td>
                <td data-label="الحالة">${u.is_active
                  ? '<span class="badge badge--ok">نشط</span>' : '<span class="badge badge--bad">موقوف</span>'}</td>
                <td data-label="">
                  <div class="row" style="gap:.3rem;flex-wrap:nowrap">
                    <button class="btn btn--sm btn--ghost" data-u-edit="${u.id}">تعديل</button>
                    <a class="btn btn--sm btn--quiet" href="#/bookings?user_id=${u.id}">حجوزاته</a>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : emptyState('لا يوجد مستخدمون مطابقون'))}`;

  $('#u-filters').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const p = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (String(v).trim()) p.set(k, v);
    location.hash = `#/users${p.toString() ? '?' + p : ''}`;
  });

  $('#u-add').addEventListener('click', () => openUserForm(null, canManageRoles));
  $$('[data-u-edit]').forEach((b) => b.addEventListener('click',
    () => openUserForm(items.find((x) => String(x.id) === b.dataset.uEdit), canManageRoles)));
  return null;
}

function openUserForm(user, canManageRoles) {
  const roleOptions = ['user', ...(canManageRoles ? ['admin', 'manager'] : [])];
  modal({
    title: user ? `تعديل: ${user.name}` : 'إضافة مستخدم',
    body: html`
      <div class="admin-form-grid">
        <div class="field">
          <label class="field__label">الاسم <span class="field__req">*</span></label>
          <input class="input" id="u-name" value="${user?.name || ''}">
        </div>
        <div class="field">
          <label class="field__label">رقم الهاتف <span class="field__req">*</span></label>
          <input class="input" id="u-phone" value="${user?.phone || ''}" dir="ltr"
                 style="text-align:right" ${raw(user ? 'disabled' : '')}>
          ${raw(user ? '<span class="field__hint">رقم الهاتف هو المعرّف ولا يمكن تغييره</span>' : '')}
        </div>
        <div class="field">
          <label class="field__label">${raw(user ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور <span class="field__req">*</span>')}</label>
          <input class="input" id="u-pass" type="password" autocomplete="new-password">
        </div>
        <div class="field">
          <label class="field__label">الصلاحية</label>
          <select class="select" id="u-role" ${raw(canManageRoles ? '' : 'disabled')}>
            ${raw(roleOptions.map((r) =>
              `<option value="${r}" ${(user?.role || 'user') === r ? 'selected' : ''}>${esc(roleLabel(r))}</option>`).join(''))}
          </select>
          ${raw(canManageRoles ? '' : '<span class="field__hint">متاح للمدير فقط</span>')}
        </div>
        ${raw(user ? `<div class="field field--full">
          <label class="switch"><input type="checkbox" id="u-active" ${user.is_active ? 'checked' : ''}>
            <span>الحساب نشط</span></label>
        </div>` : '')}
      </div>`,
    footer: `<button class="btn" id="u-save">حفظ</button>
             <button class="btn btn--quiet" id="u-cancel">إلغاء</button>`,
    onOpen: (el) => {
      el.querySelector('#u-cancel').addEventListener('click', closeModal);
      el.querySelector('#u-save').addEventListener('click', async (ev) => {
        busy(ev.target, true);
        try {
          if (user) {
            const payload = { name: el.querySelector('#u-name').value };
            const pass = el.querySelector('#u-pass').value;
            if (pass) payload.password = pass;
            if (canManageRoles) payload.role = el.querySelector('#u-role').value;
            const active = el.querySelector('#u-active');
            if (active) payload.is_active = active.checked;
            await api.patch(`/admin/users/${user.id}`, payload);
          } else {
            await api.post('/admin/users', {
              name: el.querySelector('#u-name').value,
              phone: el.querySelector('#u-phone').value,
              password: el.querySelector('#u-pass').value,
              role: el.querySelector('#u-role').value,
            });
          }
          closeModal();
          toast('تم الحفظ', 'ok');
          rerender();
        } catch (err) {
          busy(ev.target, false);
          toast(err.message, 'bad', 5200);
        }
      });
    },
  });
}

// ================= الإشعارات =================

export async function notificationsAdminView() {
  setPage('الإشعارات', '<button class="btn btn--sm" id="n-new">إرسال إشعار</button>');
  const out = $('#admin-outlet');
  out.innerHTML = skeletonLines(6);

  let items;
  let users = [];
  try {
    items = (await api.get('/admin/notifications')).items;
    users = (await api.get('/admin/users')).items;
  } catch (err) {
    out.innerHTML = errorState(err.message);
    return null;
  }

  out.innerHTML = html`
    ${raw(items.length ? `
      <div class="table-wrap">
        <table class="table table--cards">
          <thead><tr><th>العنوان</th><th>النص</th><th>المستلم</th><th>النوع</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>
            ${items.map((n) => `
              <tr>
                <td data-label="العنوان"><strong>${esc(n.title)}</strong></td>
                <td data-label="النص" class="small muted">${esc(n.body || '—')}</td>
                <td data-label="المستلم">${n.user_id
                  ? `${esc(n.user_name || '')}<div class="tiny faint" style="direction:ltr;text-align:right">${esc(n.user_phone || '')}</div>`
                  : '<span class="badge badge--gold">إشعار عام</span>'}</td>
                <td data-label="النوع"><span class="badge">${esc(n.type)}</span></td>
                <td data-label="التاريخ" class="small">${esc(f.relative(n.created_at))}</td>
                <td data-label=""><button class="btn btn--sm btn--danger" data-n-del="${n.id}">حذف</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : emptyState('لا توجد إشعارات'))}`;

  $('#n-new').addEventListener('click', () => {
    modal({
      title: 'إرسال إشعار',
      body: html`
        <div class="field">
          <label class="field__label">المستلم</label>
          <select class="select" id="n-user">
            <option value="">إشعار عام لجميع المستخدمين</option>
            ${raw(users.map((u) => `<option value="${u.id}">${esc(u.name)} — ${esc(u.phone)}</option>`).join(''))}
          </select>
        </div>
        <div class="field">
          <label class="field__label">عنوان الإشعار <span class="field__req">*</span></label>
          <input class="input" id="n-title">
        </div>
        <div class="field">
          <label class="field__label">نص الإشعار</label>
          <textarea class="textarea" id="n-body"></textarea>
        </div>
        <div class="field">
          <label class="field__label">رابط عند الضغط (اختياري)</label>
          <input class="input" id="n-link" placeholder="#/lectures" dir="ltr" style="text-align:right">
        </div>`,
      footer: `<button class="btn" id="n-send">إرسال</button>
               <button class="btn btn--quiet" id="n-cancel">إلغاء</button>`,
      onOpen: (el) => {
        el.querySelector('#n-cancel').addEventListener('click', closeModal);
        el.querySelector('#n-send').addEventListener('click', async (ev) => {
          busy(ev.target, true, 'جارٍ الإرسال...');
          try {
            await api.post('/admin/notifications', {
              user_id: el.querySelector('#n-user').value || null,
              title: el.querySelector('#n-title').value,
              body: el.querySelector('#n-body').value,
              link: el.querySelector('#n-link').value,
            });
            closeModal();
            toast('تم إرسال الإشعار', 'ok');
            rerender();
          } catch (err) {
            busy(ev.target, false);
            toast(err.message, 'bad');
          }
        });
      },
    });
  });

  $$('[data-n-del]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmDialog('حذف هذا الإشعار؟', { title: 'تأكيد', okText: 'حذف' });
    if (!ok) return;
    await api.del(`/admin/notifications/${b.dataset.nDel}`);
    toast('تم الحذف', 'ok');
    rerender();
  }));
  return null;
}

// ================= توفر الحسينية =================

export async function availabilityView() {
  setPage('توفر الحسينية');
  const out = $('#admin-outlet');
  out.innerHTML = skeletonLines(6);

  const today = f.todayISO();
  let data;
  try {
    data = await api.get(`/admin/bookings/availability/blocked?from=${today}&to=${f.addDays(today, 365)}`);
  } catch (err) {
    out.innerHTML = errorState(err.message);
    return null;
  }

  const booked = data.unavailable.filter((u) => u.reason === 'محجوز');

  out.innerHTML = html`
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));align-items:start">
      <div class="card">
        <div class="card__head">إغلاق تواريخ للحجز</div>
        <div class="card__body">
          <p class="small muted">عند محاولة المستخدم الحجز في تاريخ محجوب تظهر له رسالة:
            «هذا التاريخ غير متاح للحجز، يرجى اختيار تاريخ آخر».</p>
          <form id="blk-form">
            <div class="admin-form-grid">
              <div class="field">
                <label class="field__label">التاريخ <span class="field__req">*</span></label>
                <input class="input" id="blk-date" type="date" min="${today}" required>
              </div>
              <div class="field">
                <label class="field__label">عدد الأيام</label>
                <input class="input num" id="blk-days" type="number" min="1" value="1">
              </div>
              <div class="field field--full">
                <label class="field__label">السبب</label>
                <input class="input" id="blk-reason" placeholder="مثال: مناسبة خاصة بالحسينية / صيانة">
              </div>
            </div>
            <button class="btn btn--block" type="submit">إغلاق التواريخ</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card__head">الأيام المغلقة يدوياً (${data.blocked.length})</div>
        <div class="card__body" style="max-height:420px;overflow:auto">
          ${raw(data.blocked.length ? `<div class="grid" style="gap:.5rem">
            ${data.blocked.map((b) => `
              <div class="row row--between" style="padding-bottom:.45rem;border-bottom:1px dashed var(--line-soft)">
                <div>
                  <div class="bold num">${esc(f.dateShort(b.date))}</div>
                  <div class="small muted">${esc(f.dateHijriShort(b.date))} · ${esc(b.reason || 'غير متاح')}</div>
                </div>
                <button class="btn btn--sm btn--danger" data-blk-del="${b.id}">فتح</button>
              </div>`).join('')}
          </div>` : emptyState('لا توجد أيام مغلقة'))}
        </div>
      </div>

      <div class="card">
        <div class="card__head">التواريخ المحجوزة بطلبات (${booked.length})</div>
        <div class="card__body" style="max-height:420px;overflow:auto">
          ${raw(booked.length ? `<div class="row" style="gap:.35rem">
            ${booked.map((b) => `<span class="badge badge--info num">${esc(f.dateShort(b.date))}</span>`).join('')}
          </div>` : emptyState('لا توجد حجوزات قادمة'))}
        </div>
      </div>
    </div>`;

  $('#blk-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    busy(btn, true);
    try {
      await api.post('/admin/bookings/availability/blocked', {
        date: $('#blk-date').value,
        days: $('#blk-days').value,
        reason: $('#blk-reason').value,
      });
      toast('تم إغلاق التواريخ', 'ok');
      rerender();
    } catch (err) {
      busy(btn, false);
      toast(err.message, 'bad');
    }
  });

  $$('[data-blk-del]').forEach((b) => b.addEventListener('click', async () => {
    await api.del(`/admin/bookings/availability/blocked/${b.dataset.blkDel}`);
    toast('تم فتح التاريخ للحجز', 'ok');
    rerender();
  }));
  return null;
}

// ================= التقارير =================

export async function reportsView({ query }) {
  setPage('التقارير');
  const out = $('#admin-outlet');
  out.innerHTML = skeletonLines(8);

  const to = query.to || f.todayISO();
  const from = query.from || f.addDays(to, -365);

  let data;
  try {
    data = await api.get(`/admin/reports?from=${from}&to=${to}`);
  } catch (err) {
    out.innerHTML = errorState(err.message);
    return null;
  }

  const t = data.totals;
  const maxMonth = Math.max(1, ...data.by_month.map((m) => m.count));
  const maxType = Math.max(1, ...data.by_event_type.map((m) => m.count));

  out.innerHTML = html`
    <form class="toolbar" id="rp-form">
      <label class="small muted">من</label>
      <input class="input" name="from" type="date" value="${from}">
      <label class="small muted">إلى</label>
      <input class="input" name="to" type="date" value="${to}">
      <button class="btn btn--sm" type="submit">عرض التقرير</button>
      <button class="btn btn--sm btn--quiet" type="button" id="rp-print">طباعة</button>
    </form>

    <div class="stats-grid mb-3">
      <div class="stat"><div class="stat__label">إجمالي الطلبات في الفترة</div>
        <div class="stat__value">${t.all_bookings}</div></div>
      <div class="stat stat--ok"><div class="stat__label">الحجوزات المؤكدة</div>
        <div class="stat__value">${t.bookings}</div>
        <div class="stat__hint">${raw(esc(f.days(t.days || 0)))} إجمالاً</div></div>
      <div class="stat stat--gold"><div class="stat__label">الإيرادات</div>
        <div class="stat__value">${raw(esc(f.money(t.revenue)))}</div></div>
      <div class="stat stat--gold"><div class="stat__label">العربونات</div>
        <div class="stat__value">${raw(esc(f.money(t.deposits)))}</div></div>
      <div class="stat stat--bad"><div class="stat__label">المبالغ المتبقية</div>
        <div class="stat__value">${raw(esc(f.money(t.remaining)))}</div></div>
      <div class="stat"><div class="stat__label">تكلفة الطعام</div>
        <div class="stat__value">${raw(esc(f.money(t.food_cost)))}</div></div>
      <div class="stat stat--gold"><div class="stat__label">التبرعات</div>
        <div class="stat__value">${raw(esc(f.money(t.donations)))}</div>
        <div class="stat__hint">${t.donations_count} تبرع</div></div>
    </div>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));align-items:start">
      <div class="card">
        <div class="card__head">الحجوزات حسب الشهر</div>
        <div class="card__body">
          ${raw(data.by_month.length ? `<div class="bar-chart">
            ${data.by_month.map((m) => `
              <div class="bar-row">
                <span class="num small">${esc(m.month)}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${(m.count / maxMonth) * 100}%"></div></div>
                <span class="num small bold">${m.count}</span>
              </div>`).join('')}
          </div>` : emptyState('لا توجد بيانات في هذه الفترة'))}
        </div>
      </div>

      <div class="card">
        <div class="card__head">أكثر أنواع المناسبات حجزاً</div>
        <div class="card__body">
          ${raw(data.by_event_type.length ? `<div class="bar-chart">
            ${data.by_event_type.map((m) => `
              <div class="bar-row">
                <span class="small">${esc(m.type || '—')}</span>
                <div class="bar-track"><div class="bar-fill bar-fill--gold"
                  style="width:${(m.count / maxType) * 100}%"></div></div>
                <span class="num small bold">${m.count}</span>
              </div>`).join('')}
          </div>` : emptyState('لا توجد بيانات'))}
        </div>
      </div>

      <div class="card">
        <div class="card__head">الحجوزات حسب الحالة</div>
        <div class="card__body" style="padding:0">
          <div class="table-wrap" style="border:none">
            <table class="table table--cards">
              <thead><tr><th>الحالة</th><th>العدد</th><th>المبالغ</th></tr></thead>
              <tbody>
                ${raw(data.by_status.map((s) => `
                  <tr><td data-label="الحالة">${esc(s.label)}</td>
                  <td data-label="العدد" class="num">${s.count}</td>
                  <td data-label="المبالغ" class="num">${esc(f.money(s.total))}</td></tr>`).join(''))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__head">التفاصيل المالية بالشهر</div>
        <div class="card__body" style="padding:0">
          <div class="table-wrap" style="border:none">
            <table class="table table--cards">
              <thead><tr><th>الشهر</th><th>الحجوزات</th><th>الإجمالي</th>
                <th>العربون</th><th>المتبقي</th><th>الطعام</th></tr></thead>
              <tbody>
                ${raw(data.by_month.map((m) => `
                  <tr>
                    <td data-label="الشهر" class="num">${esc(m.month)}</td>
                    <td data-label="الحجوزات" class="num">${m.count}</td>
                    <td data-label="الإجمالي" class="num">${esc(f.money(m.total, { withCurrency: false }))}</td>
                    <td data-label="العربون" class="num">${esc(f.money(m.deposits, { withCurrency: false }))}</td>
                    <td data-label="المتبقي" class="num">${esc(f.money(m.remaining, { withCurrency: false }))}</td>
                    <td data-label="الطعام" class="num">${esc(f.money(m.food, { withCurrency: false }))}</td>
                  </tr>`).join(''))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  $('#rp-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    location.hash = `#/reports?from=${fd.get('from')}&to=${fd.get('to')}`;
  });
  $('#rp-print').addEventListener('click', () => window.print());
  return null;
}

// ================= صفحات بتبويبات =================

/**
 * يجمع عدة صفحات CRUD تحت تبويبات في مسار واحد.
 * tabs: [{ key, label, view }]
 */
export function tabbedView(route, title, tabs) {
  return async function view({ query }) {
    const active = tabs.find((t) => t.key === query.tab) || tabs[0];
    await active.view({ query: {} });

    const out = $('#admin-outlet');
    const bar = document.createElement('div');
    bar.className = 'tabs mb-2';
    bar.innerHTML = tabs.map((t) =>
      `<a class="tab ${t.key === active.key ? 'tab--on' : ''}" href="#${route}?tab=${t.key}">${esc(t.label)}</a>`
    ).join('');
    out.prepend(bar);

    // تغيير العنوان فقط — دون المساس بأزرار الشريط العلوي وأحداثها
    const titleEl = $('#page-title');
    if (titleEl) titleEl.textContent = `${title} — ${active.label}`;
    document.title = `${title} — لوحة التحكم`;
    return null;
  };
}

export const listsView = tabbedView('/lists', 'القوائم', [
  { key: 'event-types', label: 'أنواع المناسبات', view: eventTypesAdmin },
  { key: 'food-options', label: 'خيارات الطعام', view: foodOptionsAdmin },
]);
