// تسجيل الدخول وإنشاء الحساب
import { html, raw, esc, $, toast, busy, icon } from '../core/ui.js';
import { login, register, state } from '../core/store.js';
import { navigate } from '../core/router.js';

export async function loginView({ query }) {
  if (state.user) { navigate(query.next || '/account', { replace: true }); return null; }
  const next = query.next || '/account';

  const app = $('#app');
  app.innerHTML = html`
    <div class="container section">
      <div class="card auth-card">
        <div class="card__body">
          <div class="center mb-3">
            <div style="color:var(--green);margin-bottom:.4rem">${raw(icon('mosque', 38))}</div>
            <h1 style="font-size:1.45rem;margin-bottom:.2rem">تسجيل الدخول</h1>
            <p class="small muted" style="margin:0">أدخل رقم هاتفك وكلمة المرور للمتابعة</p>
          </div>

          <div id="login-error"></div>

          <form id="login-form" novalidate>
            <div class="field">
              <label class="field__label" for="phone">رقم الهاتف <span class="field__req">*</span></label>
              <input class="input" id="phone" name="phone" type="tel" inputmode="numeric"
                     autocomplete="username" placeholder="07XXXXXXXXX" dir="ltr" style="text-align:right" required>
              <span class="field__hint">رقم الهاتف هو معرّف حسابك في التطبيق</span>
            </div>
            <div class="field">
              <label class="field__label" for="password">كلمة المرور <span class="field__req">*</span></label>
              <input class="input" id="password" name="password" type="password"
                     autocomplete="current-password" placeholder="••••••" required>
            </div>
            <button class="btn btn--block btn--lg" type="submit">تسجيل الدخول</button>
          </form>

          <div class="auth-switch">
            ليس لديك حساب؟
            <button type="button" onclick="location.hash='#/register?next=${raw(encodeURIComponent(next))}'">
              إنشاء حساب جديد</button>
          </div>
        </div>
      </div>
    </div>`;

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const errBox = $('#login-error');
    errBox.innerHTML = '';
    busy(btn, true, 'جارٍ الدخول...');
    try {
      await login($('#phone').value, $('#password').value);
      toast('مرحباً بك', 'ok');
      navigate(next, { replace: true });
    } catch (err) {
      errBox.innerHTML = `<div class="alert alert--bad">${esc(err.message)}</div>`;
      busy(btn, false);
    }
  });
  return null;
}

export async function registerView({ query }) {
  if (state.user) { navigate(query.next || '/account', { replace: true }); return null; }
  const next = query.next || '/account';

  const app = $('#app');
  app.innerHTML = html`
    <div class="container section">
      <div class="card auth-card">
        <div class="card__body">
          <div class="center mb-3">
            <div style="color:var(--green);margin-bottom:.4rem">${raw(icon('mosque', 38))}</div>
            <h1 style="font-size:1.45rem;margin-bottom:.2rem">إنشاء حساب جديد</h1>
            <p class="small muted" style="margin:0">حساب واحد يكفيك لمتابعة حجوزاتك وفواتيرك</p>
          </div>

          <div id="reg-error"></div>

          <form id="reg-form" novalidate>
            <div class="field">
              <label class="field__label" for="name">الاسم الكامل <span class="field__req">*</span></label>
              <input class="input" id="name" type="text" autocomplete="name" placeholder="مثال: أبو علي الموسوي" required>
            </div>
            <div class="field">
              <label class="field__label" for="phone">رقم الهاتف <span class="field__req">*</span></label>
              <input class="input" id="phone" type="tel" inputmode="numeric" autocomplete="username"
                     placeholder="07XXXXXXXXX" dir="ltr" style="text-align:right" required>
            </div>
            <div class="field">
              <label class="field__label" for="password">كلمة المرور <span class="field__req">*</span></label>
              <input class="input" id="password" type="password" autocomplete="new-password"
                     placeholder="6 خانات على الأقل" required>
            </div>
            <div class="field">
              <label class="field__label" for="password2">تأكيد كلمة المرور <span class="field__req">*</span></label>
              <input class="input" id="password2" type="password" autocomplete="new-password" required>
            </div>
            <button class="btn btn--block btn--lg" type="submit">إنشاء الحساب</button>
          </form>

          <div class="auth-switch">
            لديك حساب بالفعل؟
            <button type="button" onclick="location.hash='#/login?next=${raw(encodeURIComponent(next))}'">
              تسجيل الدخول</button>
          </div>
        </div>
      </div>
    </div>`;

  $('#reg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const errBox = $('#reg-error');
    errBox.innerHTML = '';

    if ($('#password').value !== $('#password2').value) {
      errBox.innerHTML = '<div class="alert alert--bad">كلمتا المرور غير متطابقتين</div>';
      return;
    }

    busy(btn, true, 'جارٍ الإنشاء...');
    try {
      await register({
        name: $('#name').value,
        phone: $('#phone').value,
        password: $('#password').value,
        password_confirm: $('#password2').value,
      });
      toast('تم إنشاء حسابك بنجاح', 'ok');
      navigate(next, { replace: true });
    } catch (err) {
      errBox.innerHTML = `<div class="alert alert--bad">${esc(err.message)}</div>`;
      busy(btn, false);
    }
  });
  return null;
}
