// Small DOM helpers shared by every screen.
import { t, lang } from './i18n.js';

// Let .append() accept nested arrays and skip null/false, exactly like h() does,
// so screens can pass lists straight in. (Native append would turn arrays/null into text.)
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  const native = proto.append;
  if (native.__ssa) continue;
  const safe = function (...kids) { return native.apply(this, kids.flat(Infinity).filter(k => k != null && k !== false)); };
  safe.__ssa = true; proto.append = safe;
}

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; // only ever used with static, trusted markup
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const clear = el => { while (el.firstChild) el.firstChild.remove(); return el; };

export const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm-4 0l-2 7 6-3 6 3-2-7',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  store: 'M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  check: 'M20 6L9 17l-5-5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm-2.5-13a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3h.01',
  menu: 'M3 6h18M3 12h18M3 18h18',
  next: 'M9 5l7 7-7 7', prev: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  up: 'M18 15l-6-6-6 6', down: 'M6 9l6 6 6-6',
  x: 'M18 6L6 18M6 6l12 12', lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.4-4.4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8l1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'
};
export function icon(name, cls = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', 'icon ' + cls + (['next', 'prev', 'send'].includes(name) ? ' dir' : ''));
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', ICONS[name] || ''); s.append(p);
  return s;
}

export function btn(label, onClick, cls = 'btn-primary', extra = {}) {
  return h('button', { type: 'button', class: 'btn ' + cls, onclick: onClick, ...extra }, label);
}

let toastBox;
export function toast(msg, kind = 'ok') {
  toastBox ||= document.getElementById('toasts');
  const el = h('div', { class: 'toast toast-' + kind, role: kind === 'error' ? 'alert' : 'status' }, msg);
  toastBox.append(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}
export function errText(e) {
  const code = e?.code || 'server_error';
  const key = 'err.' + code;
  const txt = t(key, e?.extra);
  return txt === key ? t('err.generic') + ` (${code})` : txt;
}
export const showError = e => toast(errText(e), 'error');

// Modal dialog. `body` is a node; buttons: [{label, cls, value}] ; resolves with value or null.
export function modal(title, body, buttons = [{ label: t('ok'), value: true }], opts = {}) {
  return new Promise(resolve => {
    const d = h('dialog', { class: 'modal' + (opts.wide ? ' wide' : '') });
    const close = v => { d.close(); d.remove(); resolve(v); };
    const form = h('form', { method: 'dialog', onsubmit: async ev => {
      ev.preventDefault();
      const v = buttons.find(b => b.submit)?.value ?? true;
      if (opts.onSubmit) { const r = await opts.onSubmit(); if (r === false) return; close(r ?? v); } else close(v);
    } },
      h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('close'), onclick: () => close(null) }, icon('x'))),
      h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-foot' }, buttons.map(b => b.submit
        ? h('button', { type: 'submit', class: 'btn ' + (b.cls || 'btn-primary') }, b.label)
        : h('button', { type: 'button', class: 'btn ' + (b.cls || 'btn-ghost'), onclick: () => close(b.value) }, b.label)))
    );
    d.append(form); d.addEventListener('cancel', ev => { ev.preventDefault(); close(null); });
    document.body.append(d); d.showModal();
    const first = d.querySelector('input,select,textarea'); if (first) first.focus();
  });
}
export async function confirmBox(title, text, okLabel, danger = false, askReason = false) {
  const reason = h('textarea', { rows: 2, required: askReason, maxlength: 500 });
  const body = h('div', null, h('p', null, text), askReason ? field(t('reason'), reason) : null);
  const r = await modal(title, body, [{ label: t('cancel'), value: null }, { label: okLabel, cls: danger ? 'btn-danger' : 'btn-primary', submit: true, value: true }],
    { onSubmit: () => (askReason && !reason.value.trim() ? (reason.reportValidity(), false) : { reason: reason.value.trim() }) });
  return r;
}
export function field(label, input, hint) {
  const id = input.id || ('f' + Math.random().toString(36).slice(2, 8));
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
}
export const input = (attrs = {}) => h('input', { type: 'text', ...attrs });
export function select(options, value, attrs = {}) {
  const s = h('select', attrs, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
  return s;
}

export function fmtDate(ts, withTime = false) {
  if (!ts) return '—';
  const loc = lang() === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : lang() === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB';
  return new Date(ts).toLocaleString(loc, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

// CSV helpers. Exported cells are protected against spreadsheet formula injection.
export function toCSV(rows) {
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
export function download(name, data, type = 'text/csv;charset=utf-8') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// "01 - Classic Burger.pdf" -> { order: 1, title: "Classic Burger" }
export function parseCardName(fileName) {
  const base = String(fileName).replace(/\.pdf$/i, '').trim();
  const m = base.match(/^\s*(\d{1,4})\s*[-_.)\]–—]?\s*(.*)$/);
  return m ? { order: Number(m[1]), title: (m[2] || base).replace(/_+/g, ' ').trim() || base } : { order: null, title: base.replace(/_+/g, ' ') };
}

// Pasted quiz text -> questions.   Q: question   /  - wrong option  /  * correct option
// Questions need 2+ options and exactly one "*". Anything else is skipped.
export function parseQuizText(text) {
  const out = []; let cur = null;
  const done = () => {
    if (cur && cur.text && cur.options.length >= 2 && cur.correct.length === 1) out.push({ type: 'mc', text: cur.text, options: cur.options, answer: cur.correct[0] });
    cur = null;
  };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    let m;
    if ((m = line.match(/^(?:Q\s*\d*\s*[:.)-]|س\s*[:.)-])\s*(.+)$/i))) { done(); cur = { text: m[1].trim(), options: [], correct: [] }; }
    else if (cur && (m = line.match(/^([*+✓✔-])\s*(.+)$/))) { if (m[1] !== '-') cur.correct.push(cur.options.length); cur.options.push(m[2].trim()); }
    else if (cur && !cur.options.length) cur.text += ' ' + line;
  }
  done();
  return out.slice(0, 100);
}

const loaded = {};
export function loadScript(src) {
  return (loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
    s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('load ' + src)); };
    document.head.append(s);
  }));
}
export const CDN = {
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  qr: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
};
