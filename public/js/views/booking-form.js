// نموذج حجز الحسينية — 6 خطوات
import { api } from '../core/api.js';
import { html, raw, esc, icon, $, $$, toast, busy, errorState, skeletonLines } from '../core/ui.js';
import * as f from '../core/format.js';
import { state } from '../core/store.js';
import { navigate } from '../core/router.js';

const STEPS = [
  { n: 1, label: 'التاريخ والمدة' },
  { n: 2, label: 'نوع المناسبة' },
  { n: 3, label: 'عدد الحضور' },
  { n: 4, label: 'الطعام' },
  { n: 5, label: 'مراجعة الطلب' },
  { n: 6, label: 'إرسال الطلب' },
];

export async function bookingFormView() {
  if (!state.user) {
    navigate('/login?next=' + encodeURIComponent('/book'), { replace: true });
    return null;
  }

  const app = $('#app');
  app.innerHTML = `<div class="container section">${skeletonLines(6)}</div>`;

  let opts;
  try {
    opts = await api.get('/booking-options');
  } catch (err) {
    app.innerHTML = `<div class="container section">${errorState(err.message)}</div>`;
    return null;
  }

  const unavailable = new Set(opts.unavailable.map((u) => u.date));
  const form = {
    step: 1,
    start_date: '',
    days: 1,
    end_date: '',
    event_type_id: null,
    event_type_other: '',
    attendees: opts.attendees.default,
    food_option_id: null,
    user_note: '',
  };

  app.innerHTML = html`
    <div class="container section">
      <div style="max-width:720px;margin-inline:auto">
        <h1 style="margin-bottom:.3rem">حجز الحسينية</h1>
        <p class="muted mb-2">${opts.notice || ''}</p>

        <div class="stepper" id="stepper"></div>
        <div class="card"><div class="card__body" id="step-body"></div></div>

        <div class="row mt-2" style="gap:.6rem">
          <button class="btn btn--quiet" id="btn-back" type="button">السابق</button>
          <button class="btn" id="btn-next" type="button" style="flex:1">التالي</button>
        </div>
      </div>
    </div>`;

  const stepperEl = $('#stepper');
  const bodyEl = $('#step-body');
  const backBtn = $('#btn-back');
  const nextBtn = $('#btn-next');

  function renderStepper() {
    stepperEl.innerHTML = STEPS.map((s) => {
      const cls = s.n === form.step ? 'stepper__item--on' : (s.n < form.step ? 'stepper__item--done' : '');
      return `<div class="stepper__item ${cls}">
        <div class="stepper__num">${s.n < form.step ? '✓' : s.n}</div>
        <div>${esc(s.label)}</div>
      </div>`;
    }).join('');
  }

  function computeEnd() {
    form.end_date = form.start_date ? f.addDays(form.start_date, form.days - 1) : '';
  }

  // ---------- محتوى كل خطوة ----------

  const renderers = {
    1: () => {
      computeEnd();
      const minDate = f.addDays(opts.limits.today, opts.limits.min_lead_days);
      const dateList = form.start_date
        ? Array.from({ length: form.days }, (_, i) => f.addDays(form.start_date, i))
        : [];
      const conflicts = dateList.filter((d) => unavailable.has(d));

      return html`
        <h3>الخطوة 1 — التاريخ والمدة</h3>
        <div class="field">
          <label class="field__label" for="start">تاريخ بداية الحجز <span class="field__req">*</span></label>
          <input class="input" id="start" type="date" min="${minDate}" value="${form.start_date}">
          <span class="field__hint">لا يمكن اختيار تاريخ سابق أو تاريخ محجوز مسبقاً</span>
        </div>
        <div class="field">
          <label class="field__label" for="days">مدة الحجز (عدد الأيام) <span class="field__req">*</span></label>
          <input class="input" id="days" type="number" inputmode="numeric" min="1"
                 max="${opts.limits.max_days}" value="${form.days}">
          <span class="field__hint">الحد الأعلى ${f.days(opts.limits.max_days)}</span>
        </div>

        ${raw(form.start_date ? `
          <div class="alert ${conflicts.length ? 'alert--bad' : 'alert--ok'}">
            <div class="bold">${conflicts.length ? 'هذا التاريخ غير متاح للحجز' : 'التواريخ متاحة'}</div>
            <div class="small num" style="margin-top:.3rem">
              ${dateList.map((d) => {
                const bad = unavailable.has(d);
                return `<span class="badge ${bad ? 'badge--bad' : 'badge--ok'}" style="margin:2px">
                  ${esc(f.dateShort(d))}${bad ? ' — محجوز' : ''}</span>`;
              }).join('')}
            </div>
            ${conflicts.length ? '<div class="small mt-1">يرجى اختيار تاريخ آخر.</div>' : `
              <div class="small mt-1">من ${esc(f.dateShort(form.start_date))} إلى ${esc(f.dateShort(form.end_date))}
              (${esc(f.days(form.days))})</div>`}
          </div>` : '')}`;
    },

    2: () => html`
      <h3>الخطوة 2 — نوع المناسبة</h3>
      <div class="grid" style="gap:.6rem">
        ${raw(opts.event_types.map((t) => `
          <label class="choice ${form.event_type_id === t.id ? 'choice--on' : ''}" data-type="${t.id}">
            <input type="radio" name="etype" value="${t.id}" ${form.event_type_id === t.id ? 'checked' : ''}>
            <span><span class="choice__title">${esc(t.name)}</span></span>
          </label>`).join(''))}
      </div>
      <div id="other-wrap" class="field mt-2 ${raw(needsOther() ? '' : 'hidden')}">
        <label class="field__label" for="other">اكتب نوع المناسبة <span class="field__req">*</span></label>
        <input class="input" id="other" type="text" value="${form.event_type_other}" placeholder="مثال: ختمة قرآن">
      </div>`,

    3: () => html`
      <h3>الخطوة 3 — عدد الحضور</h3>
      <div class="field">
        <label class="field__label" for="att">العدد التقريبي للحضور <span class="field__req">*</span></label>
        <input class="input" id="att" type="number" inputmode="numeric"
               min="${opts.attendees.min}" max="${opts.attendees.max}" value="${form.attendees}">
        <span class="field__hint">
          العدد المسموح به: من ${opts.attendees.min} إلى ${opts.attendees.max} شخصاً
        </span>
      </div>
      <div class="row" style="gap:.4rem">
        ${raw(quickCounts(opts.attendees).map((n) =>
          `<button class="chip ${form.attendees === n ? 'chip--on' : ''}" type="button" data-att="${n}">${n}</button>`).join(''))}
      </div>`,

    4: () => html`
      <h3>الخطوة 4 — الطعام</h3>
      <p class="small muted">اختيار أحد الخيارين إلزامي.</p>
      <div class="grid" style="gap:.6rem">
        ${raw(opts.food_options.map((o) => `
          <label class="choice ${form.food_option_id === o.id ? 'choice--on' : ''}" data-food="${o.id}">
            <input type="radio" name="food" value="${o.id}" ${form.food_option_id === o.id ? 'checked' : ''}>
            <span>
              <span class="choice__title">${esc(o.label)}</span>
              <span class="choice__desc">${esc(o.description)}</span>
              ${o.has_cost ? '<span class="badge badge--warn" style="margin-top:.35rem">تُضاف تكلفة الطعام إلى الفاتورة</span>' : ''}
            </span>
          </label>`).join(''))}
      </div>`,

    5: () => {
      const type = opts.event_types.find((t) => t.id === form.event_type_id);
      const food = opts.food_options.find((o) => o.id === form.food_option_id);
      return html`
        <h3>الخطوة 5 — مراجعة الطلب</h3>
        <div class="dl review-list">
          <div class="dl__row"><span class="dl__key">تاريخ البداية</span>
            <span class="dl__val num">${raw(f.dateShort(form.start_date))}</span></div>
          <div class="dl__row"><span class="dl__key">تاريخ النهاية</span>
            <span class="dl__val num">${raw(f.dateShort(form.end_date))}</span></div>
          <div class="dl__row"><span class="dl__key">المدة</span>
            <span class="dl__val">${f.days(form.days)}</span></div>
          <div class="dl__row"><span class="dl__key">نوع المناسبة</span>
            <span class="dl__val">${form.event_type_other || type?.name || '—'}</span></div>
          <div class="dl__row"><span class="dl__key">عدد الحضور</span>
            <span class="dl__val">${f.persons(form.attendees)}</span></div>
          <div class="dl__row"><span class="dl__key">الطعام</span>
            <span class="dl__val">${food?.label || '—'}</span></div>
        </div>
        <div class="field mt-2">
          <label class="field__label" for="note">ملاحظات إضافية (اختياري)</label>
          <textarea class="textarea" id="note" placeholder="أي تفاصيل تود إبلاغ الإدارة بها">${form.user_note}</textarea>
        </div>
        <div class="alert alert--warn mt-2" style="margin-bottom:0">
          السعر يحدده المشرف بعد مراجعة الطلب، وستصلك الفاتورة داخل التطبيق.
        </div>`;
    },

    6: () => html`
      <h3>الخطوة 6 — إرسال الطلب</h3>
      <div class="center" style="padding:1rem 0">
        <div style="color:var(--green);margin-bottom:.6rem">${raw(icon('file', 44))}</div>
        <p style="max-width:44ch;margin-inline:auto">
          عند الإرسال يتم إنشاء طلب حجز جديد بحالة <strong>«قيد المراجعة»</strong>،
          ويصل الطلب إلى إدارة الحسينية لمراجعته وتحديد السعر.
        </p>
        <div class="alert alert--info" style="text-align:start">
          الحجز لا يُعتبر مؤكداً إلا بعد موافقة الإدارة ودفع العربون.
        </div>
      </div>`,
  };

  function needsOther() {
    const t = opts.event_types.find((x) => x.id === form.event_type_id);
    return !!t?.allows_custom_text;
  }

  function quickCounts(a) {
    const set = new Set([a.min, a.default, a.max]);
    const mid = Math.round((a.min + a.max) / 2);
    if (mid > a.min && mid < a.max) set.add(mid);
    return [...set].sort((x, y) => x - y);
  }

  // ---------- التحقق من كل خطوة ----------

  function validateStep() {
    if (form.step === 1) {
      if (!form.start_date) return 'يرجى اختيار تاريخ بداية الحجز';
      if (form.start_date < f.addDays(opts.limits.today, opts.limits.min_lead_days)) {
        return 'لا يمكن الحجز في تاريخ سابق';
      }
      if (!(form.days >= 1 && form.days <= opts.limits.max_days)) {
        return `عدد الأيام يجب أن يكون بين 1 و ${opts.limits.max_days}`;
      }
      computeEnd();
      const bad = Array.from({ length: form.days }, (_, i) => f.addDays(form.start_date, i))
        .filter((d) => unavailable.has(d));
      if (bad.length) return 'هذا التاريخ غير متاح للحجز، يرجى اختيار تاريخ آخر.';
    }
    if (form.step === 2) {
      if (!form.event_type_id) return 'يرجى اختيار نوع المناسبة';
      if (needsOther() && form.event_type_other.trim().length < 2) return 'يرجى كتابة نوع المناسبة';
    }
    if (form.step === 3) {
      if (!(form.attendees >= opts.attendees.min && form.attendees <= opts.attendees.max)) {
        return `عدد الحضور يجب أن يكون بين ${opts.attendees.min} و ${opts.attendees.max}`;
      }
    }
    if (form.step === 4 && !form.food_option_id) return 'يرجى اختيار أحد خياري الطعام';
    return null;
  }

  // ---------- الرسم وربط الأحداث ----------

  function render() {
    renderStepper();
    bodyEl.innerHTML = renderers[form.step]();
    backBtn.style.visibility = form.step === 1 ? 'hidden' : 'visible';
    nextBtn.textContent = form.step === 6 ? 'إرسال طلب الحجز' : 'التالي';
    nextBtn.className = form.step === 6 ? 'btn btn--gold' : 'btn';
    nextBtn.style.flex = '1';
    bind();
  }

  function bind() {
    $('#start')?.addEventListener('change', (e) => { form.start_date = e.target.value; render(); });
    $('#days')?.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      form.days = Number.isFinite(v) && v >= 1 ? Math.min(v, opts.limits.max_days) : 1;
      computeEnd();
    });
    $('#days')?.addEventListener('change', () => render());

    $$('[data-type]').forEach((el) => el.addEventListener('click', () => {
      form.event_type_id = Number(el.dataset.type);
      if (!needsOther()) form.event_type_other = '';
      render();
    }));
    $('#other')?.addEventListener('input', (e) => { form.event_type_other = e.target.value; });

    $('#att')?.addEventListener('input', (e) => { form.attendees = Number(e.target.value) || 0; });
    $$('[data-att]').forEach((el) => el.addEventListener('click', () => {
      form.attendees = Number(el.dataset.att);
      render();
    }));

    $$('[data-food]').forEach((el) => el.addEventListener('click', () => {
      form.food_option_id = Number(el.dataset.food);
      render();
    }));

    $('#note')?.addEventListener('input', (e) => { form.user_note = e.target.value; });
  }

  backBtn.addEventListener('click', () => {
    if (form.step > 1) { form.step--; render(); }
  });

  nextBtn.addEventListener('click', async () => {
    const error = validateStep();
    if (error) { toast(error, 'bad', 4200); return; }

    if (form.step < 6) { form.step++; render(); return; }

    busy(nextBtn, true, 'جارٍ الإرسال...');
    try {
      const res = await api.post('/bookings', {
        start_date: form.start_date,
        days: form.days,
        event_type_id: form.event_type_id,
        event_type_other: form.event_type_other,
        attendees: form.attendees,
        food_option_id: form.food_option_id,
        user_note: form.user_note,
      });
      toast('تم إرسال طلب الحجز بنجاح', 'ok');
      navigate(`/booking/${res.booking.id}`, { replace: true });
    } catch (err) {
      busy(nextBtn, false);
      toast(err.message, 'bad', 5200);
      if (err.status === 409) { form.step = 1; render(); }
    }
  });

  render();
  return null;
}
