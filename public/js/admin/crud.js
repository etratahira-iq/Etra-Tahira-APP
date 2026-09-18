// مُنشئ صفحات إدارة المحتوى (قائمة + نموذج إضافة/تعديل/حذف)
import { api, fileToDataUrl } from '../core/api.js';
import {
  html, raw, esc, $, $$, toast, busy, errorState, emptyState,
  skeletonLines, modal, closeModal, confirmDialog,
} from '../core/ui.js';
import * as f from '../core/format.js';
import { setPage } from './shell.js';
import { rerender } from '../core/router.js';

/**
 * يبني صفحة إدارة لمورد.
 * fields: [{ name, label, type, options?, hint?, required?, full?, default? }]
 * columns: [{ key, label, render? }]
 */
export function makeCrudView({ title, endpoint, fields, columns, filters = [], searchable = true, addLabel }) {
  return async function view({ query }) {
    setPage(title, `<button class="btn btn--sm" id="crud-add">${esc(addLabel || 'إضافة جديد')}</button>`);
    const out = $('#admin-outlet');
    out.innerHTML = skeletonLines(6);

    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    for (const fl of filters) if (query[fl.name]) params.set(fl.name, query[fl.name]);

    let items;
    try {
      items = (await api.get(`/admin/${endpoint}?${params}`)).items;
    } catch (err) {
      out.innerHTML = errorState(err.message);
      return null;
    }

    out.innerHTML = html`
      ${raw(searchable || filters.length ? `
        <form class="toolbar" id="crud-filters">
          ${searchable ? `<input class="input" name="q" type="search" placeholder="بحث..."
            value="${esc(query.q || '')}">` : ''}
          ${filters.map((fl) => `
            <select class="select" name="${esc(fl.name)}">
              <option value="">${esc(fl.label)}</option>
              ${fl.options.map((o) =>
                `<option value="${esc(o.value)}" ${query[fl.name] === String(o.value) ? 'selected' : ''}>
                  ${esc(o.label)}</option>`).join('')}
            </select>`).join('')}
          <button class="btn btn--sm" type="submit">تطبيق</button>
          <a class="btn btn--sm btn--quiet" href="#${routeOf(endpoint)}">مسح</a>
        </form>` : '')}

      <div class="muted small mb-1">العدد: ${items.length}</div>

      ${raw(items.length ? `
        <div class="table-wrap">
          <table class="table table--cards">
            <thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
            <tbody>
              ${items.map((it) => `
                <tr>
                  ${columns.map((c) => `<td data-label="${esc(c.label)}">${c.render ? c.render(it) : esc(it[c.key] ?? '—')}</td>`).join('')}
                  <td data-label="">
                    <div class="row" style="gap:.3rem;flex-wrap:nowrap">
                      <button class="btn btn--sm btn--ghost" data-edit="${it.id}">تعديل</button>
                      <button class="btn btn--sm btn--danger" data-del="${it.id}">حذف</button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : emptyState('لا توجد عناصر', 'اضغط «إضافة جديد» لإضافة أول عنصر.'))}`;

    $('#crud-filters')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const p = new URLSearchParams();
      for (const [k, v] of fd.entries()) if (String(v).trim()) p.set(k, v);
      location.hash = `#${routeOf(endpoint)}${p.toString() ? '?' + p : ''}`;
    });

    $('#crud-add').addEventListener('click', () => openForm(null));
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      openForm(items.find((x) => String(x.id) === b.dataset.edit));
    }));
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await confirmDialog('هل أنت متأكد من حذف هذا العنصر؟ لا يمكن التراجع.', {
        title: 'تأكيد الحذف', okText: 'حذف',
      });
      if (!ok) return;
      try {
        await api.del(`/admin/${endpoint}/${b.dataset.del}`);
        toast('تم الحذف', 'ok');
        rerender();
      } catch (err) { toast(err.message, 'bad'); }
    }));

    function openForm(item) {
      const images = {};
      modal({
        title: item ? `تعديل: ${item[columns[0].key] || ''}` : (addLabel || 'إضافة جديد'),
        wide: true,
        body: `<form id="crud-form"><div class="admin-form-grid">
          ${fields.map((fd) => fieldHtml(fd, item)).join('')}
        </div></form>`,
        footer: `<button class="btn" id="crud-save">حفظ</button>
                 <button class="btn btn--quiet" id="crud-cancel">إلغاء</button>`,
        onOpen: (el) => {
          el.querySelector('#crud-cancel').addEventListener('click', closeModal);

          el.querySelectorAll('input[type=file]').forEach((input) => {
            input.addEventListener('change', async (e) => {
              const file = e.target.files?.[0];
              const name = input.dataset.field;
              const box = el.querySelector(`#preview-${name}`);
              if (!file) { delete images[name]; return; }
              try {
                images[name] = await fileToDataUrl(file);
                box.innerHTML = `<img src="${images[name]}" alt="">`;
              } catch (err) {
                delete images[name];
                toast(err.message, 'bad');
              }
            });
          });

          el.querySelectorAll('[data-clear-image]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const name = btn.dataset.clearImage;
              images[name] = '';
              el.querySelector(`#preview-${name}`).innerHTML =
                '<span class="small muted">لا توجد صورة</span>';
            });
          });

          el.querySelector('#crud-save').addEventListener('click', async (ev) => {
            const payload = {};
            for (const fd of fields) {
              if (fd.type === 'image') {
                if (images[fd.name] !== undefined) payload[fd.name] = images[fd.name];
                else if (item) payload[fd.name] = item[fd.name] || '';
                else payload[fd.name] = '';
                continue;
              }
              const input = el.querySelector(`[name="${fd.name}"]`);
              if (!input) continue;
              payload[fd.name] = fd.type === 'checkbox' ? (input.checked ? 1 : 0) : input.value;
            }
            busy(ev.target, true);
            try {
              if (item) await api.put(`/admin/${endpoint}/${item.id}`, payload);
              else await api.post(`/admin/${endpoint}`, payload);
              closeModal();
              toast(item ? 'تم حفظ التعديلات' : 'تمت الإضافة بنجاح', 'ok');
              rerender();
            } catch (err) {
              busy(ev.target, false);
              toast(err.message, 'bad', 5200);
            }
          });
        },
      });
    }
    return null;
  };
}

function routeOf(endpoint) {
  return '/' + endpoint;
}

function fieldHtml(fd, item) {
  const val = item ? (item[fd.name] ?? '') : (fd.default ?? '');
  const cls = fd.full ? 'field field--full' : 'field';
  const req = fd.required ? '<span class="field__req">*</span>' : '';
  const hint = fd.hint ? `<span class="field__hint">${esc(fd.hint)}</span>` : '';

  if (fd.type === 'checkbox') {
    return `<div class="${cls}">
      <label class="switch">
        <input type="checkbox" name="${esc(fd.name)}" ${val ? 'checked' : ''}>
        <span>${esc(fd.label)}</span>
      </label>${hint}
    </div>`;
  }

  if (fd.type === 'select') {
    return `<div class="${cls}">
      <label class="field__label">${esc(fd.label)} ${req}</label>
      <select class="select" name="${esc(fd.name)}">
        ${fd.options.map((o) =>
          `<option value="${esc(o.value)}" ${String(val) === String(o.value) ? 'selected' : ''}>
            ${esc(o.label)}</option>`).join('')}
      </select>${hint}
    </div>`;
  }

  if (fd.type === 'textarea') {
    return `<div class="${cls}">
      <label class="field__label">${esc(fd.label)} ${req}</label>
      <textarea class="textarea" name="${esc(fd.name)}">${esc(val)}</textarea>${hint}
    </div>`;
  }

  if (fd.type === 'image') {
    return `<div class="${cls}">
      <label class="field__label">${esc(fd.label)}</label>
      <div class="img-picker">
        <div id="preview-${esc(fd.name)}">
          ${val ? `<img src="${esc(val)}" alt="">` : '<span class="small muted">لا توجد صورة</span>'}
        </div>
        <input type="file" accept="image/*" data-field="${esc(fd.name)}">
        ${val ? `<button class="btn btn--sm btn--quiet mt-1" type="button"
          data-clear-image="${esc(fd.name)}">إزالة الصورة</button>` : ''}
      </div>${hint}
    </div>`;
  }

  const type = fd.type || 'text';
  return `<div class="${cls}">
    <label class="field__label">${esc(fd.label)} ${req}</label>
    <input class="input ${type === 'number' ? 'num' : ''}" type="${type}" name="${esc(fd.name)}"
           value="${esc(val)}" ${fd.min !== undefined ? `min="${fd.min}"` : ''}
           ${fd.placeholder ? `placeholder="${esc(fd.placeholder)}"` : ''}>${hint}
  </div>`;
}

// ---------- مساعدات عرض للأعمدة ----------

export const yesNo = (v) => (v ? '<span class="badge badge--ok">نعم</span>' : '<span class="badge">لا</span>');
export const dateCell = (iso) => `<span class="num">${esc(f.dateShort(iso))}</span>`;
export const imgCell = (src) => (src
  ? `<img src="${esc(src)}" alt="" style="width:52px;height:38px;object-fit:cover;border-radius:6px">`
  : '<span class="faint small">—</span>');
export const moneyCell = (v) => `<span class="num">${esc(f.money(v))}</span>`;
