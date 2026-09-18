// الإعدادات العامة، طرق الدفع، روابط التواصل
import { api, fileToDataUrl } from '../core/api.js';
import {
  html, raw, esc, $, $$, toast, busy, errorState, emptyState,
  skeletonLines, modal, closeModal, confirmDialog,
} from '../core/ui.js';
import { setPage } from './shell.js';
import { rerender } from '../core/router.js';
import { patch } from '../core/store.js';

// ================= الإعدادات العامة =================

const GROUPS = [
  {
    title: 'هوية الحسينية',
    fields: [
      { key: 'site_name', label: 'اسم الحسينية' },
      { key: 'site_tagline', label: 'الوصف المختصر (تحت الاسم)' },
      { key: 'logo_path', label: 'شعار الحسينية', type: 'image' },
    ],
  },
  {
    title: 'القسم الرئيسي (Hero)',
    fields: [
      { key: 'hero_title', label: 'العنوان الرئيسي' },
      { key: 'hero_subtitle', label: 'الوصف الرئيسي', type: 'textarea' },
      { key: 'hero_image', label: 'صورة القسم الرئيسي', type: 'image' },
    ],
  },
  {
    title: 'نبذة وموقع الحسينية',
    fields: [
      { key: 'about_title', label: 'عنوان النبذة' },
      { key: 'about_text', label: 'نص النبذة', type: 'textarea' },
      { key: 'address', label: 'عنوان الحسينية' },
      { key: 'maps_url', label: 'رابط Google Maps', hint: 'يُستخدم في زر «فتح الموقع»' },
      { key: 'maps_embed_url', label: 'رابط الخريطة المضمّنة (Embed)', hint: 'رابط iframe من خرائط جوجل — اختياري' },
    ],
  },
  {
    title: 'وسائل الاتصال',
    fields: [
      { key: 'contact_phone', label: 'رقم الاتصال' },
      { key: 'whatsapp_number', label: 'رقم واتساب' },
      { key: 'contact_email', label: 'البريد الإلكتروني' },
    ],
  },
  {
    title: 'إعدادات الحجز',
    fields: [
      { key: 'currency', label: 'العملة', hint: 'مثال: د.ع' },
      { key: 'attendees_min', label: 'الحد الأدنى للحضور', type: 'number' },
      { key: 'attendees_max', label: 'الحد الأعلى للحضور', type: 'number' },
      { key: 'attendees_default', label: 'العدد المقترح افتراضياً', type: 'number' },
      { key: 'booking_max_days', label: 'أقصى عدد أيام للحجز', type: 'number' },
      { key: 'booking_min_lead_days', label: 'أقل عدد أيام قبل تاريخ الحجز', type: 'number' },
      { key: 'deposit_percent', label: 'نسبة العربون الافتراضية (%)', type: 'number' },
      { key: 'booking_notice', label: 'تنبيه يظهر في نموذج الحجز', type: 'textarea' },
      { key: 'deposit_instructions', label: 'تعليمات دفع العربون', type: 'textarea' },
    ],
  },
  {
    title: 'التبرعات',
    fields: [
      { key: 'donation_title', label: 'عنوان قسم التبرعات' },
      { key: 'donation_text', label: 'نص قسم التبرعات', type: 'textarea' },
      { key: 'donation_image', label: 'بنر التبرع (صفحة التبرعات)', type: 'image',
        hint: 'صورة عريضة تظهر أعلى صفحة التبرعات' },
      { key: 'donation_post', label: 'بوست التبرع (الصفحة الرئيسية)', type: 'image',
        hint: 'يظهر في قسم التبرعات بالصفحة الرئيسية — إن تُرك فارغاً يُستخدم البنر' },
    ],
  },
];

export async function settingsView() {
  setPage('الإعدادات العامة');
  const out = $('#admin-outlet');
  out.innerHTML = skeletonLines(10);

  let data;
  try {
    data = await api.get('/admin/settings');
  } catch (err) {
    out.innerHTML = errorState(err.message);
    return null;
  }

  const s = data.settings;
  const images = {};

  out.innerHTML = html`
    <div class="alert alert--info">
      كل ما يمكن أن يتغير مستقبلاً موجود هنا — لا يوجد أي رقم أو رابط مكتوب داخل الكود.
    </div>

    <form id="settings-form">
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));align-items:start">
        ${raw(GROUPS.map((g) => `
          <div class="card">
            <div class="card__head">${esc(g.title)}</div>
            <div class="card__body">
              ${g.fields.map((fd) => settingField(fd, s[fd.key] ?? '')).join('')}
            </div>
          </div>`).join(''))}
      </div>

      <div class="row mt-3" style="gap:.5rem">
        <button class="btn btn--lg" type="submit">حفظ الإعدادات</button>
        <a class="btn btn--lg btn--quiet" href="/" target="_blank">معاينة الموقع</a>
      </div>
    </form>`;

  // رفع الصور
  $$('#settings-form input[type=file]').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      const key = input.dataset.field;
      const box = $(`#preview-${key}`);
      if (!file) { delete images[key]; return; }
      try {
        images[key] = await fileToDataUrl(file);
        box.innerHTML = `<img src="${images[key]}" alt="">`;
      } catch (err) { toast(err.message, 'bad'); }
    });
  });

  $$('[data-clear-image]').forEach((btn) => btn.addEventListener('click', () => {
    const key = btn.dataset.clearImage;
    images[key] = '';
    $(`#preview-${key}`).innerHTML = '<span class="small muted">لا توجد صورة</span>';
  }));

  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const payload = {};
    for (const g of GROUPS) {
      for (const fd of g.fields) {
        if (fd.type === 'image') {
          if (images[fd.key] !== undefined) payload[fd.key] = images[fd.key];
          continue;
        }
        const el = e.target.querySelector(`[name="${fd.key}"]`);
        if (el) payload[fd.key] = el.value;
      }
    }
    busy(btn, true);
    try {
      const res = await api.put('/admin/settings', payload);
      patch({ settings: res.settings });
      toast('تم حفظ الإعدادات بنجاح', 'ok');
      rerender();
    } catch (err) {
      busy(btn, false);
      toast(err.message, 'bad', 5200);
    }
  });
  return null;
}

function settingField(fd, value) {
  const hint = fd.hint ? `<span class="field__hint">${esc(fd.hint)}</span>` : '';
  if (fd.type === 'image') {
    return `<div class="field">
      <label class="field__label">${esc(fd.label)}</label>
      <div class="img-picker">
        <div id="preview-${esc(fd.key)}">
          ${value ? `<img src="${esc(value)}" alt="">` : '<span class="small muted">لا توجد صورة</span>'}
        </div>
        <input type="file" accept="image/*" data-field="${esc(fd.key)}">
        ${value ? `<button class="btn btn--sm btn--quiet mt-1" type="button"
          data-clear-image="${esc(fd.key)}">إزالة</button>` : ''}
      </div>${hint}
    </div>`;
  }
  if (fd.type === 'textarea') {
    return `<div class="field">
      <label class="field__label">${esc(fd.label)}</label>
      <textarea class="textarea" name="${esc(fd.key)}" style="min-height:90px">${esc(value)}</textarea>${hint}
    </div>`;
  }
  return `<div class="field">
    <label class="field__label">${esc(fd.label)}</label>
    <input class="input ${fd.type === 'number' ? 'num' : ''}" type="${fd.type || 'text'}"
           name="${esc(fd.key)}" value="${esc(value)}">${hint}
  </div>`;
}

// ================= طرق الدفع =================

const SCOPES = [
  { value: 'both', label: 'العربون والتبرعات' },
  { value: 'deposit', label: 'العربون فقط' },
  { value: 'donation', label: 'التبرعات فقط' },
];

export async function paymentMethodsView() {
  setPage('طرق الدفع', '<button class="btn btn--sm" id="pm-add">إضافة طريقة دفع</button>');
  const out = $('#admin-outlet');
  out.innerHTML = skeletonLines(5);

  let items;
  try {
    items = (await api.get('/admin/payment-methods')).items;
  } catch (err) {
    out.innerHTML = errorState(err.message);
    return null;
  }

  out.innerHTML = html`
    <div class="alert alert--warn">
      أرقام الحسابات والأكواد تُدخل من هنا فقط، ولا يمكن للمستخدمين تعديلها إطلاقاً.
    </div>

    ${raw(items.length ? `
      <div class="table-wrap">
        <table class="table table--cards">
          <thead><tr>
            <th>الخدمة</th><th>الرقم / الكود</th><th>اسم الحساب</th>
            <th>الاستخدام</th><th>الترتيب</th><th>مُفعّلة</th><th></th>
          </tr></thead>
          <tbody>
            ${items.map((m) => `
              <tr>
                <td data-label="الخدمة"><strong>${esc(m.name)}</strong>
                  <div class="tiny faint">${esc(m.slug)}</div></td>
                <td data-label="الرقم / الكود">
                  <span style="font-family:'Courier New',monospace;direction:ltr;display:inline-block">
                    ${esc(m.account_number || '—')}</span></td>
                <td data-label="اسم الحساب">${esc(m.account_name || '—')}</td>
                <td data-label="الاستخدام">${esc(SCOPES.find((s) => s.value === m.usage_scope)?.label || m.usage_scope)}</td>
                <td data-label="الترتيب">${m.sort_order}</td>
                <td data-label="مُفعّلة">${m.is_active
                  ? '<span class="badge badge--ok">نعم</span>' : '<span class="badge">لا</span>'}</td>
                <td data-label="">
                  <div class="row" style="gap:.3rem;flex-wrap:nowrap">
                    <button class="btn btn--sm btn--ghost" data-pm-edit="${m.id}">تعديل</button>
                    <button class="btn btn--sm btn--danger" data-pm-del="${m.id}">حذف</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : emptyState('لم تُضَف طرق دفع بعد', 'أضف كي كارد وزين كاش وتحويل الرصيد.', '💳'))}`;

  const openPm = (item) => {
    modal({
      title: item ? `تعديل: ${item.name}` : 'إضافة طريقة دفع',
      body: html`
        <div class="admin-form-grid">
          <div class="field">
            <label class="field__label">اسم الخدمة <span class="field__req">*</span></label>
            <input class="input" id="pm-name" value="${item?.name || ''}" placeholder="كي كارد / زين كاش / تحويل رصيد">
          </div>
          <div class="field">
            <label class="field__label">المعرّف</label>
            <input class="input" id="pm-slug" value="${item?.slug || ''}" placeholder="qicard"
                   dir="ltr" style="text-align:right">
          </div>
          <div class="field">
            <label class="field__label">الرقم / الكود</label>
            <input class="input" id="pm-num" value="${item?.account_number || ''}"
                   dir="ltr" style="text-align:right;font-family:'Courier New',monospace">
          </div>
          <div class="field">
            <label class="field__label">اسم صاحب الحساب</label>
            <input class="input" id="pm-acc" value="${item?.account_name || ''}">
          </div>
          <div class="field">
            <label class="field__label">نطاق الاستخدام</label>
            <select class="select" id="pm-scope">
              ${raw(SCOPES.map((s) =>
                `<option value="${s.value}" ${item?.usage_scope === s.value ? 'selected' : ''}>
                  ${esc(s.label)}</option>`).join(''))}
            </select>
          </div>
          <div class="field">
            <label class="field__label">الترتيب</label>
            <input class="input num" id="pm-order" type="number" min="0" value="${item?.sort_order ?? 0}">
          </div>
          <div class="field field--full">
            <label class="field__label">تعليمات الدفع (تظهر للمستخدم)</label>
            <textarea class="textarea" id="pm-inst">${item?.instructions || ''}</textarea>
          </div>
          <div class="field field--full">
            <label class="switch"><input type="checkbox" id="pm-active" ${raw(item ? (item.is_active ? 'checked' : '') : 'checked')}>
              <span>مُفعّلة وتظهر للمستخدمين</span></label>
          </div>
        </div>`,
      footer: `<button class="btn" id="pm-save">حفظ</button>
               <button class="btn btn--quiet" id="pm-cancel">إلغاء</button>`,
      onOpen: (el) => {
        el.querySelector('#pm-cancel').addEventListener('click', closeModal);
        el.querySelector('#pm-save').addEventListener('click', async (ev) => {
          const payload = {
            name: el.querySelector('#pm-name').value,
            slug: el.querySelector('#pm-slug').value,
            account_number: el.querySelector('#pm-num').value,
            account_name: el.querySelector('#pm-acc').value,
            instructions: el.querySelector('#pm-inst').value,
            usage_scope: el.querySelector('#pm-scope').value,
            sort_order: el.querySelector('#pm-order').value,
            is_active: el.querySelector('#pm-active').checked,
          };
          busy(ev.target, true);
          try {
            if (item) await api.put(`/admin/payment-methods/${item.id}`, payload);
            else await api.post('/admin/payment-methods', payload);
            closeModal();
            toast('تم الحفظ', 'ok');
            rerender();
          } catch (err) {
            busy(ev.target, false);
            toast(err.message, 'bad', 5000);
          }
        });
      },
    });
  };

  $('#pm-add').addEventListener('click', () => openPm(null));
  $$('[data-pm-edit]').forEach((b) => b.addEventListener('click',
    () => openPm(items.find((x) => String(x.id) === b.dataset.pmEdit))));
  $$('[data-pm-del]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmDialog('حذف طريقة الدفع هذه؟', { title: 'تأكيد الحذف', okText: 'حذف' });
    if (!ok) return;
    try {
      await api.del(`/admin/payment-methods/${b.dataset.pmDel}`);
      toast('تم الحذف', 'ok');
      rerender();
    } catch (err) { toast(err.message, 'bad'); }
  }));
  return null;
}

// ================= روابط التواصل =================

const PLATFORM_LABELS = {
  instagram: 'إنستغرام', facebook: 'فيسبوك', whatsapp: 'واتساب',
  phone: 'الاتصال', email: 'البريد الإلكتروني', telegram: 'تيليغرام', youtube: 'يوتيوب',
};

const PLATFORM_HINTS = {
  instagram: 'رابط الحساب الكامل — https://instagram.com/...',
  facebook: 'رابط الصفحة الكامل — https://facebook.com/...',
  whatsapp: 'رقم الواتساب بصيغة دولية بدون + (يتحول تلقائياً إلى رابط wa.me)',
  phone: 'رقم الهاتف للاتصال المباشر',
  email: 'البريد الإلكتروني',
  telegram: 'رابط أو معرّف تيليغرام',
  youtube: 'رابط القناة',
};

export async function socialLinksView() {
  setPage('روابط التواصل');
  const out = $('#admin-outlet');
  out.innerHTML = skeletonLines(5);

  let data;
  try {
    data = await api.get('/admin/social-links');
  } catch (err) {
    out.innerHTML = errorState(err.message);
    return null;
  }

  const byPlatform = Object.fromEntries(data.items.map((i) => [i.platform, i]));

  out.innerHTML = html`
    <div class="alert alert--info">تظهر هذه الروابط في أسفل الموقع وفي صفحة «تواصل معنا».</div>
    <form id="social-form">
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
        ${raw(data.platforms.map((p) => {
          const item = byPlatform[p] || {};
          return `<div class="card"><div class="card__body" data-platform="${p}">
            <div class="row row--between mb-1">
              <strong>${esc(PLATFORM_LABELS[p] || p)}</strong>
              <label class="switch"><input type="checkbox" data-active
                ${item.is_active ?? 1 ? 'checked' : ''}><span class="small">مُفعّل</span></label>
            </div>
            <div class="field">
              <label class="field__label">الاسم الظاهر</label>
              <input class="input" data-label value="${esc(item.label || PLATFORM_LABELS[p] || p)}">
            </div>
            <div class="field" style="margin-bottom:0">
              <label class="field__label">الرابط / الرقم</label>
              <input class="input" data-url value="${esc(item.url || '')}"
                     dir="ltr" style="text-align:right">
              <span class="field__hint">${esc(PLATFORM_HINTS[p] || '')}</span>
            </div>
          </div></div>`;
        }).join(''))}
      </div>
      <button class="btn btn--lg mt-3" type="submit">حفظ روابط التواصل</button>
    </form>`;

  $('#social-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const items = $$('[data-platform]').map((box, idx) => ({
      platform: box.dataset.platform,
      label: box.querySelector('[data-label]').value,
      url: box.querySelector('[data-url]').value,
      is_active: box.querySelector('[data-active]').checked,
      sort_order: idx,
    }));
    busy(btn, true);
    try {
      await api.put('/admin/social-links', { items });
      toast('تم حفظ روابط التواصل', 'ok');
      busy(btn, false);
    } catch (err) {
      busy(btn, false);
      toast(err.message, 'bad');
    }
  });
  return null;
}
