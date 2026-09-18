// حالة التطبيق المشتركة (المستخدم، الإعدادات، الإشعارات)
import { api } from './api.js';
import { setCurrency } from './format.js';

const listeners = new Set();

export const state = {
  user: null,
  unread: 0,
  settings: {},
  social: [],
  ready: false,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error(err); }
  }
}

export function patch(partial) {
  Object.assign(state, partial);
  if (partial.settings?.currency) setCurrency(partial.settings.currency);
  emit();
}

/** يحمّل الإعدادات العامة وحالة المستخدم عند بدء التطبيق */
export async function bootstrap() {
  const [settingsRes, meRes] = await Promise.allSettled([
    api.get('/settings'),
    api.get('/auth/me'),
  ]);

  const partial = { ready: true };
  if (settingsRes.status === 'fulfilled') {
    partial.settings = settingsRes.value.settings || {};
    partial.social = settingsRes.value.social || [];
  }
  if (meRes.status === 'fulfilled') {
    partial.user = meRes.value.user || null;
    partial.unread = meRes.value.unread || 0;
  }
  patch(partial);
  return state;
}

export async function refreshUnread() {
  if (!state.user) return;
  try {
    const res = await api.get('/auth/me');
    patch({ user: res.user, unread: res.unread || 0 });
  } catch { /* تجاهل */ }
}

export async function login(phone, password) {
  const res = await api.post('/auth/login', { phone, password });
  patch({ user: res.user, unread: res.unread || 0 });
  return res.user;
}

export async function register(payload) {
  const res = await api.post('/auth/register', payload);
  patch({ user: res.user, unread: 0 });
  return res.user;
}

export async function logout() {
  try { await api.post('/auth/logout'); } catch { /* تجاهل */ }
  patch({ user: null, unread: 0 });
}

export const isLoggedIn = () => !!state.user;
export const isStaff = () => !!state.user && (state.user.role === 'admin' || state.user.role === 'manager');
