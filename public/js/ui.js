// Shared UI helpers: escaping, icons, toasts, modals, formatting, WhatsApp preview.

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  contacts: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  groups: '<path d="M3 7h18M3 12h18M3 17h12"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  template: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  reports: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="m6 3 14 9-14 9Z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  usercheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  checks: '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
};

export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export const BRAND_MARK = `<div class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9 8h6M9 12h4M9 16h6M9 8v8"/></svg></div>`;

export function brand() {
  return `<div class="brand">${BRAND_MARK}<div class="brand-name">EPSON<small>WHATSAPP SENDER</small></div></div>`;
}

// ---------------------------------------------------------------------------
// Toasts & modals
// ---------------------------------------------------------------------------
export function toast(message, type = 'success', ms = 3600) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

export const toastError = (err) => toast(err?.message || String(err), 'error', 6000);

/**
 * Opens a modal. `onSubmit(form, close)` runs when the primary button is clicked;
 * throw to keep the modal open (the error is toasted). Returns { el, close }.
 */
export function openModal({ title, body, size = '', submitLabel = 'Save', cancelLabel = 'Cancel', danger = false, onSubmit, onOpen, hideFooter = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <form class="modal ${size}" novalidate>
      <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      ${hideFooter ? '' : `<div class="modal-foot">
        <button type="button" class="btn" data-close>${esc(cancelLabel)}</button>
        ${onSubmit ? `<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(submitLabel)}</button>` : ''}
      </div>`}
    </form>`;
  const form = wrap.querySelector('form');
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return close();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = `<span class="spinner sm"></span>`;
    try {
      const keepOpen = await onSubmit(form, close);
      if (keepOpen !== true) close();
    } catch (err) {
      toastError(err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });
  document.body.appendChild(wrap);
  onOpen?.(form, close);
  form.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, select')?.focus();
  return { el: form, close };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = true }) {
  return new Promise((resolve) => {
    let done = false;
    const { el } = openModal({
      title,
      body: `<p class="muted">${message}</p>`,
      submitLabel: confirmLabel,
      danger,
      onSubmit: () => { done = true; resolve(true); },
    });
    const observer = new MutationObserver(() => {
      if (!document.body.contains(el)) { observer.disconnect(); if (!done) resolve(false); }
    });
    observer.observe(document.body, { childList: true });
  });
}

export async function withBusy(button, fn) {
  const html = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner sm"></span> ${button.textContent.trim()}`;
  try { return await fn(); } finally { button.disabled = false; button.innerHTML = html; }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const nf = new Intl.NumberFormat();
export const num = (n) => nf.format(Number(n || 0));
export const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : '—');

export function fmtDate(v, withTime = true) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString(undefined, withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(v) {
  if (!v) return '—';
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  const abs = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, sec] of units) if (abs >= sec) return rtf.format(-Math.round(s / sec), u);
  return s >= 0 ? 'just now' : 'in a moment';
}

export const fmtPhone = (p) => (p ? `+${p}` : '—');

/** Normalize to E.164 digits without "+". Returns null if invalid. */
export function normalizePhone(raw, defaultCountryCode = '') {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  const hasPlus = s.startsWith('+') || s.startsWith('00');
  let digits = s.replace(/\D/g, '');
  if (s.startsWith('00')) digits = digits.slice(2);
  if (!hasPlus && defaultCountryCode) {
    const cc = String(defaultCountryCode).replace(/\D/g, '');
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
    if (!digits.startsWith(cc) || digits.length <= 10) digits = cc + digits;
  }
  return /^[1-9]\d{6,14}$/.test(digits) ? digits : null;
}

const STATUS_COLORS = {
  draft: 'gray', scheduled: 'blue', sending: 'teal', paused: 'amber', completed: 'green', cancelled: 'gray', failed: 'red',
  queued: 'gray', sent: 'blue', delivered: 'teal', read: 'green',
  APPROVED: 'green', PENDING: 'amber', REJECTED: 'red', PAUSED: 'amber', DISABLED: 'gray', DRAFT: 'gray', IN_APPEAL: 'violet',
};
export function statusBadge(status) {
  const label = String(status || '').toLowerCase().replace(/_/g, ' ');
  return `<span class="badge ${STATUS_COLORS[status] || 'gray'}">${esc(label.charAt(0).toUpperCase() + label.slice(1))}</span>`;
}

export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export function downloadCSV(filename, rows) {
  const csv = rows
    .map((r) => r.map((v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function emptyState(iconName, title, text, action = '') {
  return `<div class="empty"><div class="icon">${icon(iconName)}</div><h4>${esc(title)}</h4><p>${text}</p>${action}</div>`;
}

export function loadingBlock() {
  return `<div class="empty"><span class="spinner"></span></div>`;
}

// ---------------------------------------------------------------------------
// WhatsApp template preview
// ---------------------------------------------------------------------------
export function countVariables(text) {
  const nums = [...String(text ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

function fillVars(text, values = []) {
  return esc(text).replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const v = values[Number(n) - 1];
    return `<span class="b-var">${v ? esc(v) : `{{${n}}}`}</span>`;
  });
}

function waFormat(html) {
  return html
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(^|\s)_([^_\n]+)_/g, '$1<i>$2</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>');
}

export function templateBubble(t, { headerValues = [], bodyValues = [] } = {}) {
  if (!t) return '';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const header = t.header_type === 'TEXT' && t.header_text
    ? `<div class="b-header">${waFormat(fillVars(t.header_text, headerValues))}</div>`
    : ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t.header_type) ? `<div class="b-media">${esc(t.header_type)}</div>` : '';
  const buttons = (t.buttons || []).filter((b) => b.text);
  return `
    <div class="bubble">${header}${waFormat(fillVars(t.body || 'Your message body…', bodyValues))}${t.footer ? `<div class="b-footer">${esc(t.footer)}</div>` : ''}<span class="meta">${time}</span></div>
    ${buttons.length ? `<div class="bubble-buttons" style="max-width:88%">${buttons.map((b) => `<div>${esc(b.text)}</div>`).join('')}</div>` : ''}`;
}

export function phonePreview(inner, name = 'EPSON') {
  return `<div class="phone-preview"><div class="wa-top"><div class="av">${esc(name.slice(0, 2).toUpperCase())}</div><div>${esc(name)}<small>Business account</small></div></div>${inner}</div>`;
}
