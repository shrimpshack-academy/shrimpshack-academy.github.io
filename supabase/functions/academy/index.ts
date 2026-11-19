// @ts-nocheck
// GENERATED FILE - do not edit by hand. Built by tools/build-function.ps1
// from site/js/core.js (shared rules) + server/edge.js (live adapter).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// ======================================================== site/js/core.js
// Shrimp Shack Academy — shared server core.
// The SAME file runs (1) inside the Supabase Edge Function (live) and (2) in the browser for the
// trial copy, so permission rules can never drift apart.
//
// Storage contract (adapter passed to createCore):
//   store.get(coll, id) -> doc|null      store.find(coll, where) -> doc[] (top-level equality)
//   store.all(coll) -> doc[]             store.put(coll, doc) (upsert by doc.id)   store.del(coll, id)
// Files contract:
//   files.uploadTarget(key) -> {kind, ...}   files.readUrl(key, seconds) -> url   files.remove(key)

export const ROLES = ['admin', 'it', 'ops', 'training', 'area', 'staff'];
export const RANK = { admin: 100, it: 80, ops: 60, training: 50, area: 40, staff: 10 };
export const AREA_PERMS = ['people.view', 'people.manage', 'training.assign', 'training.signoff', 'reports.view', 'content.manage'];
const ROLE_PERMS = {
  it: ['people.view', 'people.manage', 'org.manage', 'content.manage', 'training.assign', 'training.signoff', 'reports.view', 'settings.training', 'settings.system', 'audit.view', 'backup.export'],
  ops: ['people.view', 'people.manage', 'org.manage', 'content.manage', 'training.assign', 'training.signoff', 'reports.view', 'settings.training'],
  training: ['people.view', 'content.manage', 'training.assign', 'training.signoff', 'reports.view', 'settings.training'],
  area: [],
  staff: []
};
export const ALL_PERMS = [...new Set(Object.values(ROLE_PERMS).flat())];

export const DEFAULT_SETTINGS = {
  training: { cardSeconds: 5, dueDays: 14, passMark: 80, certTitle: 'Certificate of Completion', certText: 'has successfully completed' },
  kpi: { lowScore: 70, maxFails: 2, inactiveDays: 7, dueSoonDays: 3 },
  system: { businessName: 'Shrimp Shack', certPrefix: 'SSA', defaultLang: 'en', retentionMonths: 24, privacyNotice: '' }
};

const PBKDF2_ITER = 310000;
const SESSION_DAYS = 14;
const LOCK_FAILS = 5;
const LOCK_MINUTES = 15;
const MAX_PDF_MB = 20;

// ---------------------------------------------------------------- permission rules (pure)
export function can(user, perm) {
  if (!user || !user.active) return false;
  if (user.role === 'admin') return true;
  if (perm === 'admin.create' || perm === 'area.grant') return false;
  if (user.role === 'area') return (user.perms || []).includes(perm);
  return (ROLE_PERMS[user.role] || []).includes(perm);
}
export function permsOf(user) {
  if (!user) return [];
  if (user.role === 'admin') return [...ALL_PERMS, 'admin.create', 'area.grant'];
  return ALL_PERMS.filter(p => can(user, p));
}
export function inScopeUser(actor, target) {
  if (!actor || !target) return false;
  if (actor.role !== 'area') return true;
  const s = actor.scope || {};
  return (s.branches || []).includes(target.branchId) || (s.teams || []).includes(target.teamId) || (s.people || []).includes(target.id);
}
export function inScopeCourse(actor, courseId) {
  if (!actor) return false;
  if (actor.role !== 'area') return true;
  return ((actor.scope || {}).courses || []).includes(courseId);
}
// Can `actor` assign `role` to someone?
export function canGiveRole(actor, role) {
  if (!ROLES.includes(role) || !can(actor, 'people.manage')) return false;
  if (actor.role === 'admin') return true;
  if (role === 'admin' || role === 'area') return false; // only Admin creates Admins / grants Area Manager permissions
  return RANK[role] < RANK[actor.role];
}
// Can `actor` edit / deactivate / reset `target`?
export function canManageUser(actor, target) {
  if (!can(actor, 'people.manage') || !target || actor.id === target.id) return false;
  if (actor.role === 'admin') return true;
  if (RANK[target.role] >= RANK[actor.role]) return false; // nobody manages someone at or above their own role
  return inScopeUser(actor, target);
}

// ---------------------------------------------------------------- small helpers
export class ApiError extends Error {
  constructor(code, status = 400, extra) { super(code); this.code = code; this.status = status; this.extra = extra; }
}
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
export const rid = (n = 10) => hex(crypto.getRandomValues(new Uint8Array(n)));
function b64u(bytes) {
  let s = ''; for (const c of new Uint8Array(bytes)) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  return new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));
}
export async function pbkdf2(password, saltHex, iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: iter }, key, 256));
}
async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(String(s)))); }
async function hmac(keyHex, msg) {
  const k = await crypto.subtle.importKey('raw', fromHex(keyHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
function safeEq(a, b) {
  a = String(a); b = String(b); let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
function str(v, max = 200, required = false, field = 'value') {
  const s = (v == null ? '' : String(v)).trim().slice(0, max);
  if (required && !s) throw new ApiError('required', 400, { field });
  return s;
}
const num = (v, min, max, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt; };
const bool = v => v === true || v === 'true' || v === 1;
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
function checkPassword(pw, role) {
  const min = role === 'admin' || role === 'it' ? 12 : 8;
  if (typeof pw !== 'string' || pw.length < min || pw.length > 200) throw new ApiError('weak_password', 400, { min });
}
function shuffle(arr) {
  const a = arr.slice(); const r = crypto.getRandomValues(new Uint32Array(a.length));
  for (let i = a.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function initials(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).map(w => w[0].toUpperCase() + '.').join(' ');
}
export function pub(u) { if (!u) return u; const { pw, ...r } = u; return r; }
const strip = o => (o && typeof o === 'object' ? JSON.parse(JSON.stringify(o, (k, v) => (k === 'pw' ? undefined : v))) : o ?? null);
const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title));
function cleanQuestions(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 100).map(q => {
    const type = q.type === 'tf' ? 'tf' : 'mc';
    const options = type === 'tf' ? ['true', 'false'] : (Array.isArray(q.options) ? q.options : []).map(o => str(o, 300)).filter(Boolean).slice(0, 8);
    if (!str(q.text, 1000)) throw new ApiError('question_text_required');
    if (options.length < 2) throw new ApiError('question_needs_options');
    const answer = num(q.answer, 0, options.length - 1, 0);
    return { id: q.id || rid(6), type, text: str(q.text, 1000), options, answer };
  });
}

// ---------------------------------------------------------------- per-request cache (live server)
// Wraps a slow store (Postgres over HTTP) for ONE request: whole collections are read at most once,
// repeated look-ups are served from memory, writes go straight through and update the cache.
export function requestCache(base) {
  const colls = new Map(); // coll -> Map(id -> doc) when the whole collection is loaded
  const docs = new Map();  // 'coll/id' -> doc|null for single reads
  const finds = new Map(); // coll -> number of find() calls
  const clone = v => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const match = (d, where) => Object.entries(where).every(([k, v]) => d[k] === v);
  async function load(coll) {
    if (!colls.has(coll)) colls.set(coll, new Map((await base.all(coll)).map(d => [d.id, d])));
    return colls.get(coll);
  }
  return {
    async get(coll, id) {
      if (colls.has(coll)) return clone(colls.get(coll).get(id));
      const k = coll + '/' + id;
      if (!docs.has(k)) docs.set(k, await base.get(coll, id));
      return clone(docs.get(k));
    },
    async all(coll) { return [...(await load(coll)).values()].map(clone); },
    async find(coll, where) {
      if (colls.has(coll)) return [...colls.get(coll).values()].filter(d => match(d, where)).map(clone);
      const n = (finds.get(coll) || 0) + 1; finds.set(coll, n);
      if (n >= 3) return this.find(coll, where, await load(coll)); // many look-ups: read the collection once
      return (await base.find(coll, where)).map(clone);
    },
    async put(coll, doc) {
      await base.put(coll, doc);
      const c = clone(doc);
      if (colls.has(coll)) colls.get(coll).set(doc.id, c); else docs.set(coll + '/' + doc.id, c);
    },
    async del(coll, id) {
      await base.del(coll, id);
      if (colls.has(coll)) colls.get(coll).delete(id); else docs.set(coll + '/' + id, null);
    }
  };
}

// ---------------------------------------------------------------- the core
export function createCore({ store, files, now = () => Date.now(), env = {} }) {
  const settingsCache = { v: null, at: 0 };

  async function system() { return (await store.get('system', 'main')) || null; }
  async function settings() {
    if (settingsCache.v && now() - settingsCache.at < 5000) return settingsCache.v;
    const s = (await store.get('settings', 'main')) || {};
    const v = {
      training: { ...DEFAULT_SETTINGS.training, ...(s.training || {}) },
      kpi: { ...DEFAULT_SETTINGS.kpi, ...(s.kpi || {}) },
      system: { ...DEFAULT_SETTINGS.system, ...(s.system || {}) }
    };
    settingsCache.v = v; settingsCache.at = now();
    return v;
  }
  async function audit(ctx, action, target, before, after, reason) {
    const t = now();
    await store.put('audit', {
      id: String(t).padStart(15, '0') + '-' + rid(4), at: t, actorId: ctx.user?.id || null, actorName: ctx.user?.name || 'system',
      action, target: target || '', before: strip(before), after: strip(after), reason: str(reason, 500)
    });
  }

  // ---- sessions
  async function signToken(user) {
    const sys = await system();
    const payload = b64u(enc.encode(JSON.stringify({ uid: user.id, sv: user.sv || 0, exp: now() + SESSION_DAYS * 864e5 })));
    return payload + '.' + (await hmac(sys.signKey, payload));
  }
  async function authUser(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const sys = await system(); if (!sys) return null;
    const [payload, sig] = token.split('.');
    if (!safeEq(sig, await hmac(sys.signKey, payload))) return null;
    let p; try { p = JSON.parse(fromB64u(payload)); } catch { return null; }
    if (!p || p.exp < now()) return null;
    const u = await store.get('users', p.uid);
    if (!u || !u.active || (u.sv || 0) !== p.sv) return null;
    return u;
  }
  async function setPassword(user, password) {
    const salt = rid(16);
    user.pw = { salt, iter: PBKDF2_ITER, hash: await pbkdf2(password, salt, PBKDF2_ITER) };
    user.sv = (user.sv || 0) + 1; // signs the person out on every device
  }

  // ---- shared lookups
  async function findUserByLogin(id) {
    const key = String(id || '').trim().toLowerCase();
    if (!key) return null;
    const all = await store.all('users');
    return all.find(u => (u.email && u.email.toLowerCase() === key) || (u.code && String(u.code).toLowerCase() === key)) || null;
  }
  async function getCourse(id) { const c = await store.get('courses', id); if (!c) throw new ApiError('not_found', 404); return c; }
  async function courseParts(courseId) {
    const sections = (await store.find('sections', { courseId })).sort(byOrder);
    const cards = (await store.find('cards', { courseId })).sort(byOrder);
    return { sections, cards };
  }
  function requireCourseManage(ctx, courseId) {
    if (!can(ctx.user, 'content.manage') || !inScopeCourse(ctx.user, courseId)) throw new ApiError('forbidden', 403);
  }
  async function assignmentsFor(u) {
    const all = await store.all('assignments');
    return all.filter(a => (a.targetType === 'all') || (a.targetType === 'user' && a.targetId === u.id) || (a.targetType === 'team' && a.targetId === u.teamId) ||
      (a.targetType === 'branch' && a.targetId === u.branchId) || (a.targetType === 'role' && a.targetId === u.role));
  }
  async function myCourseIds(u) {
    const map = new Map();
    for (const a of await assignmentsFor(u)) {
      const prev = map.get(a.courseId);
      if (!prev || (a.due && (!prev.due || a.due < prev.due))) map.set(a.courseId, { due: a.due || null, assignedAt: Math.min(a.createdAt, prev?.assignedAt || Infinity) });
    }
    return map;
  }
  async function canLearn(u, courseId) { return (await myCourseIds(u)).has(courseId); }

  // ---- progress
  async function progress(u, course, parts) {
    const { sections, cards } = parts || await courseParts(course.id);
    const views = await store.find('views', { uid: u.id, courseId: course.id });
    const attempts = (await store.find('attempts', { uid: u.id, courseId: course.id })).filter(a => a.submittedAt);
    const signoffs = await store.find('signoffs', { uid: u.id, courseId: course.id });
    const minVer = course.retrainVersion || 0;
    const valid = r => (r.ver || 0) >= minVer;
    const viewed = new Set(views.filter(v => valid(v) && cards.some(c => c.id === v.cardId && c.rev === v.rev)).map(v => v.cardId));
    let doneSteps = 0, totalSteps = 0, allSectionsDone = true;
    const secOut = sections.map(s => {
      const sc = cards.filter(c => c.sectionId === s.id);
      const seen = sc.filter(c => viewed.has(c.id)).length;
      const hasQuiz = (s.quiz?.questions || []).length > 0;
      const tries = attempts.filter(a => a.target === s.id && valid(a));
      const passed = hasQuiz ? tries.some(a => a.passed) : seen === sc.length;
      const best = tries.length ? Math.max(...tries.map(a => a.score)) : null;
      totalSteps++; if (passed) doneSteps++; else allSectionsDone = false;
      return { id: s.id, title: s.title, cards: sc.length, viewed: seen, quizUnlocked: seen === sc.length, hasQuiz, passed, best, tries: tries.length };
    });
    const hasFinal = (course.finalQuiz?.questions || []).length > 0;
    const ftries = attempts.filter(a => a.target === 'final' && valid(a));
    const finalPassed = hasFinal ? ftries.some(a => a.passed) : true;
    if (hasFinal) { totalSteps++; if (finalPassed) doneSteps++; }
    const skills = (course.skills || []).map(skill => {
      const so = signoffs.find(x => x.skill === skill && valid(x));
      totalSteps++; if (so?.status === 'passed') doneSteps++;
      return { skill, status: so?.status || 'none', notes: so?.notes || '', at: so?.at || null };
    });
    const skillsDone = skills.every(s => s.status === 'passed');
    const scores = attempts.filter(valid).map(a => a.score);
    return {
      sections: secOut, final: { has: hasFinal, unlocked: allSectionsDone, passed: finalPassed, tries: ftries.length, best: ftries.length ? Math.max(...ftries.map(a => a.score)) : null },
      skills, complete: totalSteps > 0 && allSectionsDone && finalPassed && skillsDone,
      percent: totalSteps ? Math.round(doneSteps / totalSteps * 100) : 0,
      fails: attempts.filter(a => valid(a) && !a.passed).length, retakes: Math.max(0, attempts.filter(valid).length - secOut.length - (hasFinal ? 1 : 0)),
      firstTryPass: secOut.every(s => !s.hasQuiz || attempts.filter(a => a.target === s.id && valid(a))[0]?.passed !== false),
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      lastActivity: Math.max(0, ...views.map(v => v.at || 0), ...attempts.map(a => a.submittedAt || 0))
    };
  }
  async function maybeIssueCertificate(ctx, u, course) {
    if (course.status !== 'published') return null;
    const p = await progress(u, course);
    if (!p.complete) return null;
    const existing = (await store.find('certs', { uid: u.id, courseId: course.id })).find(c => c.status === 'valid' && (c.ver || 0) >= (course.retrainVersion || 0));
    if (existing) return existing;
    return issueCert(ctx, u, course);
  }
  async function issueCert(ctx, u, course, replaces) {
    const sys = await system(); const s = await settings();
    sys.certSeq = (sys.certSeq || 0) + 1; await store.put('system', sys);
    const year = new Date(now()).getUTCFullYear();
    const cert = {
      id: rid(), number: `${s.system.certPrefix}-${year}-${String(sys.certSeq).padStart(5, '0')}-${rid(2).toUpperCase()}`,
      uid: u.id, name: u.name, initials: initials(u.name), courseId: course.id, courseTitle: course.title, ver: course.version || 1,
      issuedAt: now(), status: 'valid', replaces: replaces || null
    };
    await store.put('certs', cert);
    await audit(ctx, 'cert.issue', cert.number, null, cert, replaces ? 'reissue' : 'auto');
    return cert;
  }

  // ---------------------------------------------------------------- actions
  const A = {};
  const def = (name, opts, fn) => { A[name] = { ...opts, fn }; };

  def('system.status', { auth: false }, async (ctx) => {
    const sys = await system(); const s = await settings();
    return { initialized: !!sys?.initialized, mode: env.mode || 'live', businessName: s.system.businessName, defaultLang: s.system.defaultLang, privacyNotice: s.system.privacyNotice, setupAvailable: !!env.setupCode };
  });

  // The setup code gets the same protection as passwords: 5 wrong tries lock it for 15 minutes.
  async function checkSetupCode(code) {
    if (!env.setupCode) throw new ApiError('setup_code_missing', 503);
    const lock = (await store.get('locks', '#setup')) || { id: '#setup', fails: 0, until: 0 };
    if (lock.until > now()) throw new ApiError('locked', 429, { until: lock.until });
    if (safeEq(await sha256(code), await sha256(env.setupCode))) { if (lock.fails) await store.del('locks', '#setup'); return; }
    lock.fails = (lock.fails || 0) + 1;
    if (lock.fails >= LOCK_FAILS) { lock.until = now() + LOCK_MINUTES * 60000; lock.fails = 0; }
    await store.put('locks', lock);
    throw new ApiError(lock.until > now() ? 'locked' : 'bad_setup_code', lock.until > now() ? 429 : 403, { until: lock.until });
  }

  def('setup.init', { auth: false }, async (ctx, p) => {
    if (!env.setupCode) throw new ApiError('setup_code_missing', 503);
    const sys0 = await system();
    if (sys0?.initialized) throw new ApiError('already_initialized', 409);
    await checkSetupCode(p.code);
    const email = str(p.email, 200, true, 'email').toLowerCase();
    if (!isEmail(email)) throw new ApiError('bad_email');
    checkPassword(p.password, 'admin');
    await store.put('system', { id: 'main', initialized: true, signKey: rid(32), certSeq: 0, createdAt: now() });
    const u = { id: rid(), name: str(p.name, 120) || 'Administrator', email, code: '', role: 'admin', active: true, branchId: '', teamId: '', position: 'Administrator', mustChange: false, sv: 0, createdAt: now() };
    await setPassword(u, p.password);
    await store.put('users', u);
    ctx.user = u; await audit(ctx, 'setup.init', u.email, null, pub(u));
    return { token: await signToken(u), user: pub(u) };
  });

  def('setup.recover', { auth: false }, async (ctx, p) => {
    await checkSetupCode(p.code);
    const u = await findUserByLogin(p.email);
    if (!u || u.role !== 'admin') throw new ApiError('not_admin', 404);
    checkPassword(p.password, 'admin');
    await setPassword(u, p.password); u.active = true; u.mustChange = false;
    await store.put('users', u); await store.del('locks', String(p.email).trim().toLowerCase());
    await audit({ user: u }, 'setup.recover', u.email, null, null, 'admin password recovered with setup code');
    return { ok: true };
  });

  def('auth.login', { auth: false }, async (ctx, p) => {
    const login = str(p.id, 200, true, 'id').toLowerCase();
    const lock = (await store.get('locks', login)) || { id: login, fails: 0, until: 0 };
    if (lock.until > now()) throw new ApiError('locked', 429, { until: lock.until });
    const u = await findUserByLogin(login);
    const ok = u && u.active && u.pw && safeEq(await pbkdf2(String(p.password || ''), u.pw.salt, u.pw.iter), u.pw.hash);
    if (!ok) {
      if (!u) await pbkdf2(String(p.password || ''), '00', 1000); // keep timing roughly similar
      lock.fails = (lock.fails || 0) + 1;
      if (lock.fails >= LOCK_FAILS) { lock.until = now() + LOCK_MINUTES * 60000; lock.fails = 0; }
      await store.put('locks', lock);
      throw new ApiError(lock.until > now() ? 'locked' : 'bad_login', lock.until > now() ? 429 : 401, { until: lock.until });
    }
    await store.del('locks', login);
    u.lastLogin = now(); await store.put('users', u);
    return { token: await signToken(u), user: pub(u), mustChange: !!u.mustChange };
  });

  def('auth.me', { allowMustChange: true }, async (ctx) => ({ user: pub(ctx.user), perms: permsOf(ctx.user) }));

  def('auth.changePassword', { allowMustChange: true }, async (ctx, p) => {
    const u = ctx.user;
    if (!safeEq(await pbkdf2(String(p.current || ''), u.pw.salt, u.pw.iter), u.pw.hash)) throw new ApiError('bad_current_password', 403);
    if (p.current === p.next) throw new ApiError('same_password');
    checkPassword(p.next, u.role);
    await setPassword(u, p.next); u.mustChange = false;
    await store.put('users', u); await audit(ctx, 'auth.changePassword', u.id, null, null);
    return { token: await signToken(u) };
  });

  def('auth.logoutAll', { allowMustChange: true }, async (ctx) => {
    ctx.user.sv = (ctx.user.sv || 0) + 1; await store.put('users', ctx.user);
    await audit(ctx, 'auth.logoutAll', ctx.user.id); return { ok: true };
  });

  def('auth.setLang', { allowMustChange: true }, async (ctx, p) => {
    if (!['en', 'ar', 'ur'].includes(p.lang)) throw new ApiError('bad_lang');
    ctx.user.lang = p.lang; await store.put('users', ctx.user); return { ok: true };
  });

  // ---- organisation
  def('org.list', {}, async () => ({
    branches: (await store.all('branches')).sort((a, b) => a.name.localeCompare(b.name)),
    teams: (await store.all('teams')).sort((a, b) => a.name.localeCompare(b.name))
  }));
  for (const kind of ['branch', 'team']) {
    def(`org.save${kind[0].toUpperCase() + kind.slice(1)}`, { perm: 'org.manage' }, async (ctx, p) => {
      const coll = kind === 'branch' ? 'branches' : 'teams';
      const before = p.id ? await store.get(coll, p.id) : null;
      if (p.id && !before) throw new ApiError('not_found', 404);
      const name = str(p.name, 120, true, 'name');
      const dup = (await store.all(coll)).find(x => x.name.toLowerCase() === name.toLowerCase() && x.id !== p.id);
      if (dup) throw new ApiError('duplicate_name');
      const doc = { ...(before || { id: rid(), createdAt: now() }), name, code: str(p.code, 20), city: str(p.city, 80), active: p.active !== false };
      await store.put(coll, doc); await audit(ctx, `org.${kind}.save`, doc.name, before, doc, p.reason);
      return doc;
    });
  }

  // ---- people
  function scopedPeople(ctx, all) { return all.filter(u => u.id === ctx.user.id || inScopeUser(ctx.user, u)); }
  def('people.list', { perm: 'people.view' }, async (ctx) => {
    const all = scopedPeople(ctx, await store.all('users'));
    return all.sort((a, b) => a.name.localeCompare(b.name)).map(u => ({ ...pub(u), canManage: canManageUser(ctx.user, u) }));
  });

  async function validatePerson(ctx, p, before) {
    const role = ROLES.includes(p.role) ? p.role : 'staff';
    if (!before || before.role !== role) { if (!canGiveRole(ctx.user, role)) throw new ApiError('role_not_allowed', 403); }
    const name = str(p.name, 120, true, 'name');
    const email = str(p.email, 200).toLowerCase();
    const code = str(p.code, 40);
    if (!email && !code) throw new ApiError('code_or_email_required');
    if (email && !isEmail(email)) throw new ApiError('bad_email');
    const all = await store.all('users');
    if (code && all.some(u => u.id !== before?.id && String(u.code).toLowerCase() === code.toLowerCase())) throw new ApiError('duplicate_code');
    if (email && all.some(u => u.id !== before?.id && u.email === email)) throw new ApiError('duplicate_email');
    const branchId = str(p.branchId, 40), teamId = str(p.teamId, 40);
    if (branchId && !(await store.get('branches', branchId))) throw new ApiError('bad_branch');
    if (teamId && !(await store.get('teams', teamId))) throw new ApiError('bad_team');
    const draft = { ...(before || {}), name, email, code, role, branchId, teamId, position: str(p.position, 80), active: p.active !== false, lang: ['en', 'ar', 'ur'].includes(p.lang) ? p.lang : (before?.lang || '') };
    if (ctx.user.role !== 'admin' && !inScopeUser(ctx.user, draft)) throw new ApiError('out_of_scope', 403);
    if (role === 'area') {
      if (ctx.user.role === 'admin') {
        draft.perms = (Array.isArray(p.perms) ? p.perms : before?.perms || []).filter(x => AREA_PERMS.includes(x));
        const sc = p.scope || before?.scope || {};
        draft.scope = { branches: (sc.branches || []).map(String), teams: (sc.teams || []).map(String), courses: (sc.courses || []).map(String), people: (sc.people || []).map(String) };
      }
    } else { delete draft.perms; delete draft.scope; }
    return draft;
  }
  async function guardLastAdmin(before, after) {
    if (before?.role === 'admin' && before.active && (after.role !== 'admin' || !after.active)) {
      const others = (await store.all('users')).filter(u => u.role === 'admin' && u.active && u.id !== before.id);
      if (!others.length) throw new ApiError('last_admin', 409);
    }
  }

  def('people.save', { perm: 'people.manage' }, async (ctx, p) => {
    const before = p.id ? await store.get('users', p.id) : null;
    if (p.id && !before) throw new ApiError('not_found', 404);
    if (before && !canManageUser(ctx.user, before)) throw new ApiError('forbidden', 403);
    const doc = await validatePerson(ctx, p, before);
    await guardLastAdmin(before, doc);
    if (!before) {
      checkPassword(p.password, doc.role);
      Object.assign(doc, { id: rid(), createdAt: now(), sv: 0, mustChange: p.mustChange !== false });
      await setPassword(doc, p.password);
    } else if (before.active && !doc.active) doc.sv = (doc.sv || 0) + 1; // deactivation signs out everywhere
    await store.put('users', doc);
    await audit(ctx, before ? 'people.update' : 'people.create', doc.name, before, doc, p.reason);
    return pub(doc);
  });

  def('people.resetPassword', { perm: 'people.manage' }, async (ctx, p) => {
    const u = await store.get('users', p.id);
    if (!u) throw new ApiError('not_found', 404);
    if (!canManageUser(ctx.user, u)) throw new ApiError('forbidden', 403);
    checkPassword(p.password, u.role);
    await setPassword(u, p.password); u.mustChange = p.mustChange !== false;
    await store.put('users', u); await store.del('locks', (u.email || '').toLowerCase()); await store.del('locks', String(u.code || '').toLowerCase());
    await audit(ctx, 'people.resetPassword', u.name, null, null, p.reason);
    return { ok: true };
  });

  def('people.import', { perm: 'people.manage' }, async (ctx, p) => {
    const rows = Array.isArray(p.rows) ? p.rows.slice(0, 2000) : [];
    const branches = await store.all('branches'), teams = await store.all('teams');
    const users = await store.all('users');
    const seenCode = new Set(users.map(u => String(u.code || '').toLowerCase()).filter(Boolean));
    const seenEmail = new Set(users.map(u => u.email).filter(Boolean));
    const findBy = (list, v) => { const k = String(v || '').trim().toLowerCase(); return k ? list.find(x => x.name.toLowerCase() === k || String(x.code || '').toLowerCase() === k) : null; };
    const out = rows.map((r, i) => {
      const res = { line: i + 2, name: str(r.name, 120), code: str(r.code, 40), email: str(r.email, 200).toLowerCase(), position: str(r.position, 80), role: ROLES.includes(String(r.role || '').trim().toLowerCase()) ? String(r.role).trim().toLowerCase() : 'staff', status: 'ok', issue: '' };
      const b = findBy(branches, r.branch), t = findBy(teams, r.team);
      res.branchId = b?.id || ''; res.teamId = t?.id || ''; res.branch = b?.name || str(r.branch, 80); res.team = t?.name || str(r.team, 80);
      const fail = (status, issue) => { if (res.status === 'ok') { res.status = status; res.issue = issue; } };
      if (!res.name) fail('error', 'name_missing');
      if (!res.code && !res.email) fail('error', 'code_or_email_required');
      if (res.email && !isEmail(res.email)) fail('error', 'bad_email');
      if (r.branch && !b) fail('error', 'unknown_branch');
      if (r.team && !t) fail('error', 'unknown_team');
      if (!canGiveRole(ctx.user, res.role)) fail('error', 'role_not_allowed');
      if (res.code && seenCode.has(res.code.toLowerCase())) fail('duplicate', 'duplicate_code');
      if (res.email && seenEmail.has(res.email)) fail('duplicate', 'duplicate_email');
      if (ctx.user.role === 'area' && !inScopeUser(ctx.user, { branchId: res.branchId, teamId: res.teamId })) fail('error', 'out_of_scope');
      if (res.status === 'ok') { if (res.code) seenCode.add(res.code.toLowerCase()); if (res.email) seenEmail.add(res.email); }
      return res;
    });
    const summary = { ok: out.filter(r => r.status === 'ok').length, duplicate: out.filter(r => r.status === 'duplicate').length, error: out.filter(r => r.status === 'error').length };
    if (p.dryRun !== false) return { rows: out, summary, committed: false };
    checkPassword(p.password, 'staff');
    const salt = rid(16); const hash = await pbkdf2(p.password, salt, PBKDF2_ITER); // one temporary password for the batch
    let created = 0;
    for (const r of out.filter(r => r.status === 'ok')) {
      const u = { id: rid(), name: r.name, code: r.code, email: r.email, role: r.role, branchId: r.branchId, teamId: r.teamId, position: r.position, active: true, mustChange: true, sv: 1, createdAt: now(), pw: { salt, iter: PBKDF2_ITER, hash } };
      await store.put('users', u); created++;
    }
    await audit(ctx, 'people.import', `${created} people`, null, { created }, p.reason);
    return { rows: out, summary, committed: true, created };
  });

  // ---- courses & content
  def('courses.list', {}, async (ctx) => {
    const manage = can(ctx.user, 'content.manage') || can(ctx.user, 'training.assign') || can(ctx.user, 'reports.view') || can(ctx.user, 'training.signoff');
    if (!manage) throw new ApiError('forbidden', 403);
    const all = (await store.all('courses')).filter(c => inScopeCourse(ctx.user, c.id));
    const out = [];
    for (const c of all) { const { sections, cards } = await courseParts(c.id); out.push({ ...c, finalQuiz: undefined, sectionCount: sections.length, cardCount: cards.length, finalCount: (c.finalQuiz?.questions || []).length }); }
    return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  });

  def('courses.get', {}, async (ctx, p) => {
    requireCourseManage(ctx, p.id);
    const c = await getCourse(p.id); const parts = await courseParts(c.id);
    return { course: c, ...parts };
  });

  def('courses.save', { perm: 'content.manage' }, async (ctx, p) => {
    const before = p.id ? await getCourse(p.id) : null;
    if (before) requireCourseManage(ctx, before.id); else if (ctx.user.role === 'area') throw new ApiError('forbidden', 403);
    const s = await settings();
    const doc = {
      ...(before || { id: rid(), createdAt: now(), status: 'draft', version: 0 }),
      title: str(p.title, 160, true, 'title'), description: str(p.description, 2000),
      passMark: num(p.passMark, 1, 100, s.training.passMark), timeLimitMin: num(p.timeLimitMin, 0, 240, 0),
      attemptLimit: num(p.attemptLimit, 0, 20, 3), retakeHours: num(p.retakeHours, 0, 720, 0),
      shuffle: p.shuffle !== false, review: p.review !== false, dueDays: num(p.dueDays, 0, 365, s.training.dueDays),
      skills: (Array.isArray(p.skills) ? p.skills : before?.skills || []).map(x => str(x, 120)).filter(Boolean).slice(0, 30),
      finalQuiz: { questions: p.finalQuiz ? cleanQuestions(p.finalQuiz.questions) : (before?.finalQuiz?.questions || []) },
      updatedAt: now(), dirty: true
    };
    await store.put('courses', doc); await audit(ctx, before ? 'course.update' : 'course.create', doc.title, before, doc, p.reason);
    return doc;
  });

  def('courses.publish', { perm: 'content.manage' }, async (ctx, p) => {
    const c = await getCourse(p.id); requireCourseManage(ctx, c.id);
    const { sections, cards } = await courseParts(c.id);
    if (!sections.length || !cards.length) throw new ApiError('course_empty');
    const before = { ...c };
    c.status = 'published'; c.version = (c.version || 0) + 1; c.publishedAt = now(); c.dirty = false;
    if (bool(p.requireRetrain) && before.status === 'published') c.retrainVersion = c.version;
    await store.put('courses', c); await audit(ctx, 'course.publish', c.title, before, c, p.reason || (c.retrainVersion === c.version ? 'retrain required' : ''));
    return c;
  });

  def('courses.archive', { perm: 'content.manage' }, async (ctx, p) => {
    const c = await getCourse(p.id); requireCourseManage(ctx, c.id);
    const before = { ...c }; c.status = p.restore ? 'draft' : 'archived'; c.updatedAt = now();
    await store.put('courses', c); await audit(ctx, 'course.archive', c.title, before, c, p.reason);
    return c;
  });

  def('sections.save', { perm: 'content.manage' }, async (ctx, p) => {
    const c = await getCourse(p.courseId); requireCourseManage(ctx, c.id);
    const before = p.id ? await store.get('sections', p.id) : null;
    if (before && before.courseId !== c.id) throw new ApiError('not_found', 404);
    const existing = await store.find('sections', { courseId: c.id });
    const doc = {
      ...(before || { id: rid(), courseId: c.id, order: existing.length + 1, createdAt: now() }),
      title: str(p.title, 160, true, 'title'),
      quiz: { questions: p.quiz ? cleanQuestions(p.quiz.questions) : (before?.quiz?.questions || []) }
    };
    await store.put('sections', doc); c.updatedAt = now(); c.dirty = true; await store.put('courses', c);
    await audit(ctx, before ? 'section.update' : 'section.create', `${c.title} / ${doc.title}`, before, doc, p.reason);
    return doc;
  });

  def('sections.delete', { perm: 'content.manage' }, async (ctx, p) => {
    const s = await store.get('sections', p.id); if (!s) throw new ApiError('not_found', 404);
    requireCourseManage(ctx, s.courseId);
    const cards = await store.find('cards', { sectionId: s.id });
    if (cards.length) throw new ApiError('section_not_empty');
    await store.del('sections', s.id); await audit(ctx, 'section.delete', s.title, s, null, p.reason);
    return { ok: true };
  });

  def('sections.reorder', { perm: 'content.manage' }, async (ctx, p) => {
    requireCourseManage(ctx, p.courseId);
    const ids = Array.isArray(p.ids) ? p.ids : [];
    for (const [i, id] of ids.entries()) { const s = await store.get('sections', id); if (s && s.courseId === p.courseId) { s.order = i + 1; await store.put('sections', s); } }
    await audit(ctx, 'section.reorder', p.courseId, null, ids); return { ok: true };
  });

  def('cards.prepareUpload', { perm: 'content.manage' }, async (ctx, p) => {
    requireCourseManage(ctx, p.courseId);
    if (Number(p.size) > MAX_PDF_MB * 1048576) throw new ApiError('file_too_large', 413, { maxMb: MAX_PDF_MB });
    if (p.type && p.type !== 'application/pdf') throw new ApiError('pdf_only');
    const key = `cards/${p.courseId}/${rid()}.pdf`;
    return { key, target: await files.uploadTarget(key) };
  });

  def('cards.create', { perm: 'content.manage' }, async (ctx, p) => {
    const s = await store.get('sections', p.sectionId); if (!s) throw new ApiError('not_found', 404);
    requireCourseManage(ctx, s.courseId);
    if (!String(p.key || '').startsWith(`cards/${s.courseId}/`)) throw new ApiError('bad_key');
    const doc = { id: rid(), courseId: s.courseId, sectionId: s.id, title: str(p.title, 160, true, 'title'), order: num(p.order, 0, 9999, 0), key: p.key, rev: 1, createdAt: now(), updatedAt: now() };
    await store.put('cards', doc); await audit(ctx, 'card.create', doc.title, null, doc);
    const c = await getCourse(s.courseId); c.updatedAt = now(); c.dirty = true; await store.put('courses', c);
    return doc;
  });

  def('cards.update', { perm: 'content.manage' }, async (ctx, p) => {
    const card = await store.get('cards', p.id); if (!card) throw new ApiError('not_found', 404);
    requireCourseManage(ctx, card.courseId);
    const before = { ...card };
    if (p.title != null) card.title = str(p.title, 160, true, 'title');
    if (p.order != null) card.order = num(p.order, 0, 9999, card.order);
    if (p.sectionId && p.sectionId !== card.sectionId) {
      const s = await store.get('sections', p.sectionId); if (!s || s.courseId !== card.courseId) throw new ApiError('bad_section');
      card.sectionId = s.id;
    }
    if (p.key && p.key !== card.key) {
      if (!String(p.key).startsWith(`cards/${card.courseId}/`)) throw new ApiError('bad_key');
      const old = card.key; card.key = p.key; card.rev = (card.rev || 1) + 1; // staff must view a replaced card again
      try { await files.remove(old); } catch { /* keep going */ }
    }
    card.updatedAt = now(); await store.put('cards', card);
    await audit(ctx, p.key ? 'card.replace' : 'card.update', card.title, before, card, p.reason);
    return card;
  });

  def('cards.delete', { perm: 'content.manage' }, async (ctx, p) => {
    const card = await store.get('cards', p.id); if (!card) throw new ApiError('not_found', 404);
    requireCourseManage(ctx, card.courseId);
    await store.del('cards', card.id); try { await files.remove(card.key); } catch { /* ignore */ }
    await audit(ctx, 'card.delete', card.title, card, null, p.reason); return { ok: true };
  });

  def('cards.reorder', { perm: 'content.manage' }, async (ctx, p) => {
    const s = await store.get('sections', p.sectionId); if (!s) throw new ApiError('not_found', 404);
    requireCourseManage(ctx, s.courseId);
    for (const [i, id] of (p.ids || []).entries()) { const c = await store.get('cards', id); if (c && c.sectionId === s.id) { c.order = i + 1; await store.put('cards', c); } }
    await audit(ctx, 'card.reorder', s.title, null, p.ids); return { ok: true };
  });

  def('cards.preview', { perm: 'content.manage' }, async (ctx, p) => {
    const card = await store.get('cards', p.id); if (!card) throw new ApiError('not_found', 404);
    requireCourseManage(ctx, card.courseId);
    return { url: await files.readUrl(card.key, 300), title: card.title };
  });

  // ---- assignments
  def('assign.list', { perm: 'training.assign' }, async (ctx) => {
    const all = await store.all('assignments');
    return all.filter(a => inScopeCourse(ctx.user, a.courseId)).sort((a, b) => b.createdAt - a.createdAt);
  });
  def('assign.create', { perm: 'training.assign' }, async (ctx, p) => {
    const c = await getCourse(p.courseId);
    if (!inScopeCourse(ctx.user, c.id)) throw new ApiError('forbidden', 403);
    if (c.status !== 'published') throw new ApiError('course_not_published');
    const t = ['user', 'team', 'branch', 'role', 'all'].includes(p.targetType) ? p.targetType : null;
    if (!t) throw new ApiError('bad_target');
    if (ctx.user.role === 'area') {
      const sc = ctx.user.scope || {};
      const okT = (t === 'branch' && sc.branches?.includes(p.targetId)) || (t === 'team' && sc.teams?.includes(p.targetId)) ||
        (t === 'user' && inScopeUser(ctx.user, await store.get('users', p.targetId)));
      if (!okT) throw new ApiError('out_of_scope', 403);
    }
    const s = await settings();
    const due = p.due ? Date.parse(p.due) : now() + (c.dueDays || s.training.dueDays) * 864e5;
    const doc = { id: rid(), courseId: c.id, courseTitle: c.title, targetType: t, targetId: t === 'all' ? '' : str(p.targetId, 40), targetLabel: str(p.targetLabel, 160), due: Number.isFinite(due) ? due : null, createdAt: now(), createdBy: ctx.user.id };
    await store.put('assignments', doc); await audit(ctx, 'assign.create', `${c.title} → ${doc.targetLabel || t}`, null, doc, p.reason);
    return doc;
  });
  def('assign.delete', { perm: 'training.assign' }, async (ctx, p) => {
    const a = await store.get('assignments', p.id); if (!a) throw new ApiError('not_found', 404);
    if (!inScopeCourse(ctx.user, a.courseId)) throw new ApiError('forbidden', 403);
    await store.del('assignments', a.id); await audit(ctx, 'assign.delete', a.courseTitle, a, null, p.reason); return { ok: true };
  });

  // ---- learning (own training only)
  def('learn.home', {}, async (ctx) => {
    const u = ctx.user; const s = await settings();
    const mine = await myCourseIds(u); const out = []; const notes = [];
    for (const [courseId, info] of mine) {
      const c = await store.get('courses', courseId);
      if (!c || c.status !== 'published') continue;
      const p = await progress(u, c);
      const cert = (await store.find('certs', { uid: u.id, courseId })).find(x => x.status === 'valid');
      const overdue = !p.complete && info.due && info.due < now();
      const dueSoon = !p.complete && !overdue && info.due && info.due < now() + s.kpi.dueSoonDays * 864e5;
      if (overdue) notes.push({ type: 'overdue', courseTitle: c.title, due: info.due });
      else if (dueSoon) notes.push({ type: 'dueSoon', courseTitle: c.title, due: info.due });
      else if (!p.percent && now() - info.assignedAt < 7 * 864e5) notes.push({ type: 'assigned', courseTitle: c.title, due: info.due });
      out.push({ id: c.id, title: c.title, description: c.description, due: info.due, percent: p.percent, complete: p.complete, overdue, dueSoon, cert: cert ? { number: cert.number } : null });
    }
    return { courses: out, notifications: notes.slice(0, 5) };
  });

  def('learn.course', {}, async (ctx, p) => {
    const c = await getCourse(p.courseId);
    if (c.status !== 'published' || !(await canLearn(ctx.user, c.id))) throw new ApiError('not_assigned', 403);
    const parts = await courseParts(c.id); const s = await settings();
    const prog = await progress(ctx.user, c, parts);
    const views = await store.find('views', { uid: ctx.user.id, courseId: c.id });
    const minVer = c.retrainVersion || 0;
    const sections = parts.sections.map((sec, i) => ({
      ...prog.sections[i], quizCount: (sec.quiz?.questions || []).length,
      cardList: parts.cards.filter(cd => cd.sectionId === sec.id).map(cd => ({ id: cd.id, title: cd.title, viewed: views.some(v => v.cardId === cd.id && v.rev === cd.rev && (v.ver || 0) >= minVer) }))
    }));
    const cert = (await store.find('certs', { uid: ctx.user.id, courseId: c.id })).find(x => x.status === 'valid');
    return {
      course: { id: c.id, title: c.title, description: c.description, passMark: c.passMark, timeLimitMin: c.timeLimitMin, attemptLimit: c.attemptLimit, retakeHours: c.retakeHours, finalCount: (c.finalQuiz?.questions || []).length },
      sections, final: prog.final, skills: prog.skills, percent: prog.percent, complete: prog.complete, cardSeconds: s.training.cardSeconds,
      cert: cert ? { number: cert.number, issuedAt: cert.issuedAt, name: cert.name, courseTitle: cert.courseTitle } : null
    };
  });

  async function loadCardForLearner(ctx, cardId) {
    const card = await store.get('cards', cardId); if (!card) throw new ApiError('not_found', 404);
    const c = await getCourse(card.courseId);
    const learner = c.status === 'published' && (await canLearn(ctx.user, c.id));
    if (!learner && !(can(ctx.user, 'content.manage') && inScopeCourse(ctx.user, c.id))) throw new ApiError('forbidden', 403);
    return { card, course: c };
  }
  def('learn.openCard', {}, async (ctx, p) => {
    const { card } = await loadCardForLearner(ctx, p.cardId);
    const s = await settings();
    await store.put('opens', { id: `${ctx.user.id}:${card.id}`, uid: ctx.user.id, cardId: card.id, rev: card.rev, at: now() });
    return { url: await files.readUrl(card.key, 300), title: card.title, seconds: s.training.cardSeconds };
  });
  def('learn.completeCard', {}, async (ctx, p) => {
    const { card, course } = await loadCardForLearner(ctx, p.cardId);
    const s = await settings();
    const open = await store.get('opens', `${ctx.user.id}:${card.id}`);
    if (!open || open.rev !== card.rev) throw new ApiError('card_not_opened');
    const waited = now() - open.at;
    if (waited < (s.training.cardSeconds - 1) * 1000) throw new ApiError('too_fast', 425, { wait: Math.ceil((s.training.cardSeconds * 1000 - waited) / 1000) });
    await store.put('views', { id: `${ctx.user.id}:${card.id}`, uid: ctx.user.id, courseId: card.courseId, cardId: card.id, rev: card.rev, ver: course.version || 1, at: now() });
    return { ok: true };
  });

  def('quiz.start', {}, async (ctx, p) => {
    const c = await getCourse(p.courseId);
    if (c.status !== 'published' || !(await canLearn(ctx.user, c.id))) throw new ApiError('not_assigned', 403);
    const parts = await courseParts(c.id); const prog = await progress(ctx.user, c, parts);
    let questions, target;
    if (p.target === 'final') {
      if (!prog.final.has) throw new ApiError('no_quiz');
      if (!prog.final.unlocked) throw new ApiError('quiz_locked');
      if (prog.final.passed) throw new ApiError('already_passed');
      questions = c.finalQuiz.questions; target = 'final';
    } else {
      const idx = parts.sections.findIndex(s => s.id === p.target); if (idx < 0) throw new ApiError('not_found', 404);
      const st = prog.sections[idx];
      if (!st.hasQuiz) throw new ApiError('no_quiz');
      if (!st.quizUnlocked) throw new ApiError('quiz_locked');
      if (st.passed) throw new ApiError('already_passed');
      questions = parts.sections[idx].quiz.questions; target = parts.sections[idx].id;
    }
    const minVer = c.retrainVersion || 0;
    const prev = (await store.find('attempts', { uid: ctx.user.id, courseId: c.id })).filter(a => a.target === target && a.submittedAt && (a.ver || 0) >= minVer).sort((a, b) => a.submittedAt - b.submittedAt);
    if (c.attemptLimit && prev.length >= c.attemptLimit) throw new ApiError('attempts_exhausted', 403, { limit: c.attemptLimit });
    const last = prev[prev.length - 1];
    if (last && c.retakeHours && last.submittedAt + c.retakeHours * 3600000 > now()) throw new ApiError('retake_wait', 425, { until: last.submittedAt + c.retakeHours * 3600000 });
    const order = (c.shuffle ? shuffle(questions) : questions).map(q => ({ id: q.id, map: c.shuffle && q.type === 'mc' ? shuffle(q.options.map((_, i) => i)) : q.options.map((_, i) => i) }));
    const attempt = { id: rid(), uid: ctx.user.id, courseId: c.id, target, ver: c.version || 1, startedAt: now(), order, number: prev.length + 1 };
    await store.put('attempts', attempt);
    const qById = Object.fromEntries(questions.map(q => [q.id, q]));
    return {
      attemptId: attempt.id, number: attempt.number, attemptLimit: c.attemptLimit, timeLimitMin: c.timeLimitMin, passMark: c.passMark,
      questions: order.map(o => ({ id: o.id, type: qById[o.id].type, text: qById[o.id].text, options: o.map.map(i => qById[o.id].options[i]) })) // never the answers
    };
  });

  def('quiz.submit', {}, async (ctx, p) => {
    const a = await store.get('attempts', p.attemptId);
    if (!a || a.uid !== ctx.user.id) throw new ApiError('not_found', 404);
    if (a.submittedAt) throw new ApiError('already_submitted', 409);
    const c = await getCourse(a.courseId);
    const questions = a.target === 'final' ? (c.finalQuiz?.questions || []) : ((await store.get('sections', a.target))?.quiz?.questions || []);
    const qById = Object.fromEntries(questions.map(q => [q.id, q]));
    const answers = p.answers && typeof p.answers === 'object' ? p.answers : {};
    let correct = 0; const review = [];
    for (const o of a.order) {
      const q = qById[o.id]; if (!q) continue;
      const shown = answers[o.id]; const chosen = Number.isInteger(shown) && shown >= 0 && shown < o.map.length ? o.map[shown] : null;
      const right = chosen === q.answer; if (right) correct++;
      review.push({ text: q.text, options: o.map.map(i => q.options[i]), chosen: Number.isInteger(shown) ? shown : null, correct: o.map.indexOf(q.answer), right });
    }
    const total = a.order.length || 1;
    const late = c.timeLimitMin ? now() > a.startedAt + c.timeLimitMin * 60000 + 30000 : false;
    a.score = Math.round(correct / total * 100); a.passed = !late && a.score >= c.passMark; a.late = late; a.submittedAt = now(); a.correct = correct; a.total = total;
    await store.put('attempts', a);
    const cert = a.passed ? await maybeIssueCertificate(ctx, ctx.user, c) : null;
    return { score: a.score, passed: a.passed, late, correct, total, passMark: c.passMark, review: c.review ? review : null, cert: cert ? { number: cert.number } : null };
  });

  // ---- practical sign-offs
  def('signoff.list', { perm: 'training.signoff' }, async (ctx, p) => {
    const courses = (await store.all('courses')).filter(c => c.status === 'published' && (c.skills || []).length && inScopeCourse(ctx.user, c.id) && (!p.courseId || c.id === p.courseId));
    const users = (await store.all('users')).filter(u => u.active && u.id !== ctx.user.id && inScopeUser(ctx.user, u));
    const rows = [];
    for (const c of courses) {
      for (const u of users) {
        if (!(await canLearn(u, c.id))) continue;
        const so = await store.find('signoffs', { uid: u.id, courseId: c.id });
        rows.push({ uid: u.id, name: u.name, branchId: u.branchId, teamId: u.teamId, courseId: c.id, courseTitle: c.title,
          skills: c.skills.map(skill => { const x = so.find(s => s.skill === skill && (s.ver || 0) >= (c.retrainVersion || 0)); return { skill, status: x?.status || 'none', notes: x?.notes || '', at: x?.at || null }; }) });
      }
    }
    return rows;
  });
  def('signoff.save', { perm: 'training.signoff' }, async (ctx, p) => {
    const u = await store.get('users', p.uid); const c = await getCourse(p.courseId);
    if (!u || !inScopeUser(ctx.user, u) || !inScopeCourse(ctx.user, c.id) || u.id === ctx.user.id) throw new ApiError('forbidden', 403);
    if (!(c.skills || []).includes(p.skill)) throw new ApiError('bad_skill');
    if (!['passed', 'practice', 'none'].includes(p.status)) throw new ApiError('bad_status');
    const id = `${u.id}:${c.id}:${p.skill}`; const before = await store.get('signoffs', id);
    const doc = { id, uid: u.id, courseId: c.id, skill: p.skill, status: p.status, notes: str(p.notes, 1000), by: ctx.user.id, byName: ctx.user.name, at: now(), ver: c.version || 1 };
    await store.put('signoffs', doc); await audit(ctx, 'signoff.save', `${u.name} / ${p.skill}`, before, doc, p.notes);
    const cert = await maybeIssueCertificate(ctx, u, c);
    return { ok: true, cert: cert ? { number: cert.number } : null };
  });

  // ---- certificates
  def('certs.list', {}, async (ctx) => {
    const all = await store.all('certs');
    const mine = all.filter(c => c.uid === ctx.user.id);
    if (!can(ctx.user, 'reports.view')) return { mine, managed: [] };
    const users = Object.fromEntries((await store.all('users')).map(u => [u.id, u]));
    return { mine, managed: all.filter(c => inScopeUser(ctx.user, users[c.uid]) && inScopeCourse(ctx.user, c.courseId)).sort((a, b) => b.issuedAt - a.issuedAt) };
  });
  def('certs.get', {}, async (ctx, p) => {
    const c = (await store.find('certs', { number: str(p.number, 60) }))[0]; if (!c) throw new ApiError('not_found', 404);
    const owner = await store.get('users', c.uid);
    if (c.uid !== ctx.user.id && !(can(ctx.user, 'reports.view') && inScopeUser(ctx.user, owner))) throw new ApiError('forbidden', 403);
    const s = await settings();
    return { ...c, certTitle: s.training.certTitle, certText: s.training.certText, businessName: s.system.businessName };
  });
  for (const op of ['revoke', 'reissue']) {
    def(`certs.${op}`, { perm: 'training.signoff' }, async (ctx, p) => {
      const reason = str(p.reason, 500, true, 'reason');
      const c = await store.get('certs', p.id); if (!c || c.status !== 'valid') throw new ApiError('not_found', 404);
      const u = await store.get('users', c.uid);
      if (!inScopeUser(ctx.user, u) || !inScopeCourse(ctx.user, c.courseId)) throw new ApiError('forbidden', 403);
      const before = { ...c };
      if (op === 'revoke') { c.status = 'revoked'; c.reason = reason; c.revokedAt = now(); await store.put('certs', c); await audit(ctx, 'cert.revoke', c.number, before, c, reason); return c; }
      c.status = 'replaced'; c.reason = reason; await store.put('certs', c);
      const course = await getCourse(c.courseId);
      const fresh = await issueCert(ctx, { ...u, name: p.name ? str(p.name, 120) : u.name }, course, c.number);
      c.replacedBy = fresh.number; await store.put('certs', c); await audit(ctx, 'cert.reissue', c.number, before, c, reason);
      return fresh;
    });
  }
  def('certs.verify', { auth: false }, async (ctx, p) => {
    const c = (await store.find('certs', { number: str(p.number, 60) }))[0];
    if (!c) return { found: false };
    return { found: true, number: c.number, initials: c.initials, course: c.courseTitle, issuedAt: c.issuedAt, status: c.status, replacedBy: c.replacedBy || null };
  });

  // ---- dashboard
  def('reports.dashboard', { perm: 'reports.view' }, async (ctx, p) => {
    const s = await settings(); const k = s.kpi;
    const users = (await store.all('users')).filter(u => u.active && inScopeUser(ctx.user, u) && (!p.branchId || u.branchId === p.branchId) && (!p.teamId || u.teamId === p.teamId));
    const courses = (await store.all('courses')).filter(c => c.status === 'published' && inScopeCourse(ctx.user, c.id) && (!p.courseId || c.id === p.courseId));
    const certs = await store.all('certs');
    const rows = []; const partsCache = {};
    for (const u of users) {
      const mine = await myCourseIds(u);
      for (const c of courses) {
        if (!mine.has(c.id)) continue;
        const info = mine.get(c.id);
        partsCache[c.id] ||= await courseParts(c.id);
        const pr = await progress(u, c, partsCache[c.id]);
        const cert = certs.find(x => x.uid === u.id && x.courseId === c.id && x.status === 'valid');
        const overdue = !pr.complete && info.due && info.due < now();
        const signals = [];
        if (overdue) signals.push('overdue');
        if (pr.fails >= k.maxFails) signals.push('fails');
        if (pr.avgScore != null && pr.avgScore < k.lowScore) signals.push('lowScore');
        if (!pr.complete && now() - (pr.lastActivity || info.assignedAt) > k.inactiveDays * 864e5) signals.push('inactive');
        rows.push({ uid: u.id, name: u.name, code: u.code, branchId: u.branchId, teamId: u.teamId, courseId: c.id, courseTitle: c.title, due: info.due, percent: pr.percent, complete: pr.complete, overdue,
          avgScore: pr.avgScore, fails: pr.fails, retakes: pr.retakes, firstTryPass: pr.firstTryPass, days: cert ? Math.max(0, Math.round((cert.issuedAt - info.assignedAt) / 864e5)) : null,
          skillsDone: pr.skills.filter(x => x.status === 'passed').length, skillsTotal: pr.skills.length, signals, sections: pr.sections.map(x => ({ title: x.title, passed: x.passed, best: x.best })) });
      }
    }
    const done = rows.filter(r => r.complete); const scored = rows.filter(r => r.avgScore != null);
    const days = done.map(r => r.days).filter(d => d != null).sort((a, b) => a - b);
    const attempts = rows.filter(r => r.sections.some(x => x.best != null));
    const kpis = {
      people: new Set(rows.map(r => r.uid)).size, assignments: rows.length,
      completion: rows.length ? Math.round(done.length / rows.length * 100) : 0,
      overdue: rows.filter(r => r.overdue).length,
      avgScore: scored.length ? Math.round(scored.reduce((a, r) => a + r.avgScore, 0) / scored.length) : null,
      passRate: attempts.length ? Math.round(attempts.filter(r => r.fails === 0 || r.complete).length / attempts.length * 100) : null,
      firstTryPass: attempts.length ? Math.round(attempts.filter(r => r.firstTryPass).length / attempts.length * 100) : null,
      retakes: rows.reduce((a, r) => a + r.retakes, 0),
      medianDays: days.length ? days[Math.floor(days.length / 2)] : null,
      signoff: (() => { const t = rows.reduce((a, r) => a + r.skillsTotal, 0); return t ? Math.round(rows.reduce((a, r) => a + r.skillsDone, 0) / t * 100) : null; })()
    };
    const byCourse = courses.map(c => { const r = rows.filter(x => x.courseId === c.id); return { id: c.id, title: c.title, assigned: r.length, completion: r.length ? Math.round(r.filter(x => x.complete).length / r.length * 100) : 0, overdue: r.filter(x => x.overdue).length }; });
    const support = rows.filter(r => r.signals.length >= 2); // several signals, never a single score
    return { kpis, byCourse, rows, support, thresholds: k };
  });

  // ---- settings, audit, backup
  def('settings.get', {}, async (ctx) => {
    if (!can(ctx.user, 'settings.training') && !can(ctx.user, 'settings.system')) throw new ApiError('forbidden', 403);
    return await settings();
  });
  def('settings.save', {}, async (ctx, p) => {
    const sec = p.section;
    if (sec === 'system' ? !can(ctx.user, 'settings.system') : !can(ctx.user, 'settings.training')) throw new ApiError('forbidden', 403);
    const cur = (await store.get('settings', 'main')) || { id: 'main' };
    const before = JSON.parse(JSON.stringify(cur)); const v = p.values || {};
    if (sec === 'training') cur.training = { cardSeconds: num(v.cardSeconds, 0, 120, 5), dueDays: num(v.dueDays, 1, 365, 14), passMark: num(v.passMark, 1, 100, 80), certTitle: str(v.certTitle, 120) || DEFAULT_SETTINGS.training.certTitle, certText: str(v.certText, 300) || DEFAULT_SETTINGS.training.certText };
    else if (sec === 'kpi') cur.kpi = { lowScore: num(v.lowScore, 0, 100, 70), maxFails: num(v.maxFails, 1, 20, 2), inactiveDays: num(v.inactiveDays, 1, 90, 7), dueSoonDays: num(v.dueSoonDays, 1, 30, 3) };
    else if (sec === 'system') cur.system = { businessName: str(v.businessName, 120) || 'Shrimp Shack', certPrefix: (str(v.certPrefix, 8) || 'SSA').toUpperCase().replace(/[^A-Z0-9]/g, ''), defaultLang: ['en', 'ar', 'ur'].includes(v.defaultLang) ? v.defaultLang : 'en', retentionMonths: num(v.retentionMonths, 6, 120, 24), privacyNotice: str(v.privacyNotice, 3000) };
    else throw new ApiError('bad_section');
    await store.put('settings', cur); settingsCache.v = null;
    await audit(ctx, `settings.${sec}`, sec, before[sec] || null, cur[sec], p.reason);
    return await settings();
  });
  def('audit.list', { perm: 'audit.view' }, async (ctx, p) => {
    const all = (await store.all('audit')).sort((a, b) => b.at - a.at);
    const q = str(p.q, 100).toLowerCase();
    return (q ? all.filter(a => JSON.stringify([a.action, a.target, a.actorName, a.reason]).toLowerCase().includes(q)) : all).slice(0, num(p.limit, 1, 1000, 200));
  });
  def('backup.export', { perm: 'backup.export' }, async (ctx) => {
    const colls = ['settings', 'branches', 'teams', 'users', 'courses', 'sections', 'cards', 'assignments', 'views', 'attempts', 'signoffs', 'certs', 'audit'];
    const out = { exportedAt: new Date(now()).toISOString(), app: 'shrimpshack-academy', note: 'Passwords are never exported.' };
    for (const c of colls) out[c] = (await store.all(c)).map(d => strip(d));
    await audit(ctx, 'backup.export', 'full export');
    return out;
  });

  // ---------------------------------------------------------------- entry point
  async function handle(action, params, token) {
    try {
      const d = A[action]; if (!d) throw new ApiError('unknown_action', 404);
      const ctx = { now: now() };
      if (d.auth !== false) {
        ctx.user = await authUser(token);
        if (!ctx.user) throw new ApiError('unauthorized', 401);
        if (ctx.user.mustChange && !d.allowMustChange) throw new ApiError('must_change_password', 403);
        if (d.perm && !can(ctx.user, d.perm)) throw new ApiError('forbidden', 403);
      }
      return { ok: true, data: await d.fn(ctx, params && typeof params === 'object' ? params : {}) };
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, error: e.code, status: e.status, extra: e.extra };
      console.error(e);
      return { ok: false, error: 'server_error', status: 500 };
    }
  }
  return { handle, actions: Object.keys(A) };
}

// ======================================================== server/edge.js
// Shrimp Shack Academy — live server (Supabase Edge Function "academy").
// tools/build-function.ps1 joins this file with site/js/core.js into supabase/functions/academy/index.ts,
// so the live server runs exactly the same rules as the trial copy and the automated tests.
//
// Settings it reads (Supabase → Edge Functions → Secrets). Typed by the owner in the dashboard, never in code:
//   SETUP_CODE      first-run / admin-recovery code (remove it after setup; add it back only to recover)
//   ALLOWED_ORIGIN  the website address, e.g. https://shrimpshack-academy.github.io (comma-separate several)
// Provided automatically by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (secret — stays on the server).

const BUCKET = 'cards';
const MAX_BODY = 2_000_000; // bytes

const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

// ---- database adapter: every record is a row in public.records (coll, id, data)
function pgStore() {
  const table = () => db.from('records');
  const ok = ({ data, error }) => { if (error) throw new Error('db: ' + error.message); return data; };
  async function pages(build) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = ok(await build().order('id').range(from, from + 999));
      out.push(...rows.map(r => r.data));
      if (rows.length < 1000) return out;
    }
  }
  return {
    async get(coll, id) {
      const row = ok(await table().select('data').eq('coll', coll).eq('id', String(id)).maybeSingle());
      return row ? row.data : null;
    },
    all: coll => pages(() => table().select('data').eq('coll', coll)),
    find: (coll, where) => pages(() => table().select('data').eq('coll', coll).contains('data', where)),
    async put(coll, doc) { ok(await table().upsert({ coll, id: String(doc.id), data: doc }, { onConflict: 'coll,id' })); },
    async del(coll, id) { ok(await table().delete().eq('coll', coll).eq('id', String(id))); }
  };
}

// ---- files adapter: private bucket, short-lived signed links only
const files = {
  async uploadTarget(key) {
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(key);
    if (error) throw new Error('storage: ' + error.message);
    return { kind: 'signed', url: data.signedUrl };
  },
  async readUrl(key, seconds) {
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(key, seconds);
    if (error) throw new Error('storage: ' + error.message);
    return data.signedUrl;
  },
  async remove(key) { await db.storage.from(BUCKET).remove([key]); }
};

// ---- HTTP entry point
const ALLOWED = (Deno.env.get('ALLOWED_ORIGIN') || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
const SETUP_CODE = Deno.env.get('SETUP_CODE') || '';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED.includes(origin);
  const cors = {
    'access-control-allow-origin': allowed ? origin : (ALLOWED[0] || 'null'),
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info, x-session',
    'access-control-max-age': '86400',
    vary: 'Origin'
  };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
  const fail = (error, status) => reply({ ok: false, error, status }, status);

  if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
  if (!ALLOWED.length) return fail('origin_not_configured', 503);
  if (!allowed) return fail('origin_not_allowed', 403);
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const text = await req.text();
  if (text.length > MAX_BODY) return fail('too_large', 413);
  let body;
  try { body = JSON.parse(text); } catch { return fail('bad_request', 400); }

  const core = createCore({ store: requestCache(pgStore()), files, env: { setupCode: SETUP_CODE, mode: 'live' } });
  const r = await core.handle(String(body?.action || ''), body?.params, req.headers.get('x-session'));
  return reply(r, r.ok ? 200 : (r.status || 400));
});
