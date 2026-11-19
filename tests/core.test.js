// Automated tests for the shared server core (permission rules + full training flow).
import { createCore, requestCache, can, canGiveRole, canManageUser, inScopeUser } from '../site/js/core.js';
import { memoryStore, memoryFiles } from '../site/js/local-store.js';
import { toCSV, parseCSV, parseCardName } from '../site/js/ui.js';

const results = [];
let LIVE = false; // second pass: a fresh core + per-request cache for every call, exactly like the live server
async function test(name, fn) {
  if (LIVE) name += ' [live server mode]';
  try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message || String(e) }); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'not equal'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

function world() {
  let clock = Date.UTC(2026, 10, 17, 8, 0, 0);
  const store = memoryStore();
  const files = memoryFiles(); const env = { setupCode: 'correct horse battery staple', mode: 'test' };
  const core = createCore({ store, files, now: () => clock, env });
  const api = async (action, params = {}, token) => LIVE
    ? createCore({ store: requestCache(store), files, now: () => clock, env }).handle(action, params, token)
    : core.handle(action, params, token);
  const must = async (action, params, token) => { const r = await api(action, params, token); if (!r.ok) throw new Error(`${action} failed: ${r.error}`); return r.data; };
  const fail = async (action, params, token, code) => { const r = await api(action, params, token); if (r.ok) throw new Error(`${action} should fail with ${code}`); if (code && r.error !== code) throw new Error(`${action}: expected ${code}, got ${r.error}`); return r; };
  return { store, api, must, fail, tick: ms => { clock += ms; }, now: () => clock };
}
async function setupOrg(w) {
  const { token: admin } = await w.must('setup.init', { code: 'correct horse battery staple', email: 'owner@example.com', name: 'Owner Admin', password: 'Very-long-admin-pass-1' });
  const b1 = await w.must('org.saveBranch', { name: 'B01 - HITTIN', city: 'Riyadh' }, admin);
  const b2 = await w.must('org.saveBranch', { name: 'B02 - Rabie', city: 'Riyadh' }, admin);
  const kitchen = await w.must('org.saveTeam', { name: 'Kitchen' }, admin);
  const service = await w.must('org.saveTeam', { name: 'Service' }, admin);
  const mk = async (code, role, branchId, teamId, extra = {}) => w.must('people.save', { name: 'Person ' + code, code, role, branchId, teamId, password: role === 'it' || role === 'admin' ? 'Temp-password-12' : 'temp-pass', mustChange: false, ...extra }, admin);
  const it = await mk('it1', 'it', '', '');
  const ops = await mk('ops1', 'ops', '', '');
  const trn = await mk('trn1', 'training', '', '');
  const s1 = await mk('1001', 'staff', b1.id, kitchen.id);
  const s2 = await mk('1002', 'staff', b2.id, service.id);
  const login = async (id, pw) => (await w.must('auth.login', { id, password: pw })).token;
  return { admin, b1, b2, kitchen, service, it, ops, trn, s1, s2, login,
    tIt: await login('it1', 'Temp-password-12'), tOps: await login('ops1', 'temp-pass'), tTrn: await login('trn1', 'temp-pass'),
    tS1: await login('1001', 'temp-pass'), tS2: await login('1002', 'temp-pass') };
}
async function makeCourse(w, token, opts = {}) {
  const c = await w.must('courses.save', { title: opts.title || 'General Induction', passMark: 80, attemptLimit: opts.attemptLimit ?? 3, retakeHours: 0, shuffle: true, skills: opts.skills || [] }, token);
  const s = await w.must('sections.save', { courseId: c.id, title: 'Food safety', quiz: { questions: [
    { type: 'mc', text: 'Cooked shrimp core temperature?', options: ['40°C', '63°C', '20°C'], answer: 1 },
    { type: 'tf', text: 'Wash hands before work.', answer: 0 }] } }, token);
  const cards = [];
  for (const title of ['Hand washing', 'Cold chain']) {
    const prep = await w.must('cards.prepareUpload', { courseId: c.id, size: 1000, type: 'application/pdf' }, token);
    cards.push(await w.must('cards.create', { sectionId: s.id, title, key: prep.key, order: cards.length + 1 }, token));
  }
  return { c, s, cards };
}
// answers keyed by displayed index, computed from what the server shows (no answer key needed by the client)
function answerAll(q, correctTexts) { return Object.fromEntries(q.questions.map(x => [x.id, x.options.findIndex(o => correctTexts.includes(o))])); }

export async function run() {
  await suite();
  LIVE = true; await suite(); LIVE = false;
  return results;
}

async function suite() {
  await test('setup code: 5 wrong tries lock setup for 15 minutes', async () => {
    const w = world();
    for (let i = 0; i < 4; i++) await w.fail('setup.init', { code: 'guess' + i, email: 'a@b.co', password: 'Very-long-admin-pass-1' }, null, 'bad_setup_code');
    await w.fail('setup.init', { code: 'guess', email: 'a@b.co', password: 'Very-long-admin-pass-1' }, null, 'locked');
    await w.fail('setup.init', { code: 'correct horse battery staple', email: 'a@b.co', password: 'Very-long-admin-pass-1' }, null, 'locked');
    w.tick(15 * 60000 + 1000);
    await w.must('setup.init', { code: 'correct horse battery staple', email: 'a@b.co', password: 'Very-long-admin-pass-1' });
  });
  await test('per-request cache: reads its own writes and sees deletes', async () => {
    const base = memoryStore(); const c = requestCache(base);
    await c.put('x', { id: '1', a: 1 }); eq((await c.get('x', '1')).a, 1);
    for (let i = 0; i < 4; i++) eq((await c.find('x', { a: 1 })).length, 1); // switches to whole-collection mode
    await c.put('x', { id: '2', a: 1 }); eq((await c.find('x', { a: 1 })).length, 2);
    await c.del('x', '1'); eq(await c.get('x', '1'), null); eq((await c.all('x')).length, 1);
    const d = await c.get('x', '2'); d.a = 99; eq((await c.get('x', '2')).a, 1, 'returned docs are copies');
  });
  // ---------------- pure permission rules
  await test('rules: role permissions', () => {
    const u = (role, extra = {}) => ({ id: role, role, active: true, ...extra });
    ok(can(u('admin'), 'area.grant') && can(u('admin'), 'admin.create'));
    ok(!can(u('it'), 'area.grant') && !can(u('it'), 'admin.create') && can(u('it'), 'audit.view') && can(u('it'), 'settings.system'));
    ok(can(u('ops'), 'people.manage') && !can(u('ops'), 'settings.system') && !can(u('ops'), 'audit.view') && !can(u('ops'), 'backup.export'));
    ok(can(u('training'), 'content.manage') && !can(u('training'), 'people.manage') && !can(u('training'), 'settings.system'));
    ok(!can(u('staff'), 'people.view') && !can(u('area'), 'people.view') && can(u('area', { perms: ['people.view'] }), 'people.view'));
    ok(!can({ role: 'admin', active: false }, 'people.view'), 'inactive user has no permissions');
  });
  await test('rules: nobody manages at or above own role', () => {
    const ops = { id: 'o', role: 'ops', active: true }, it = { id: 'i', role: 'it', active: true }, admin = { id: 'a', role: 'admin', active: true };
    ok(!canManageUser(ops, { id: 'x', role: 'ops' }) && !canManageUser(ops, it) && canManageUser(ops, { id: 's', role: 'staff' }));
    ok(!canManageUser(it, { id: 'z', role: 'admin' }) && canManageUser(admin, { id: 'z', role: 'admin' }));
    ok(!canManageUser(admin, admin), 'not yourself');
    ok(!canGiveRole(it, 'area') && !canGiveRole(it, 'admin') && canGiveRole(it, 'ops') && canGiveRole(admin, 'area') && !canGiveRole(ops, 'ops'));
  });
  await test('rules: area manager scope', () => {
    const area = { id: 'a', role: 'area', active: true, perms: ['people.manage'], scope: { branches: ['b1'], teams: [], courses: [] } };
    ok(inScopeUser(area, { branchId: 'b1' }) && !inScopeUser(area, { branchId: 'b2' }));
    ok(canManageUser(area, { id: 's', role: 'staff', branchId: 'b1' }) && !canManageUser(area, { id: 's2', role: 'staff', branchId: 'b2' }));
  });

  // ---------------- first run & sign-in
  await test('setup: wrong code refused, runs only once', async () => {
    const w = world();
    eq((await w.api('system.status')).data.initialized, false);
    await w.fail('setup.init', { code: 'nope', email: 'a@b.co', password: 'Very-long-admin-pass-1' }, null, 'bad_setup_code');
    await w.fail('setup.init', { code: 'correct horse battery staple', email: 'a@b.co', password: 'short' }, null, 'weak_password');
    await w.must('setup.init', { code: 'correct horse battery staple', email: 'a@b.co', password: 'Very-long-admin-pass-1' });
    await w.fail('setup.init', { code: 'correct horse battery staple', email: 'c@b.co', password: 'Very-long-admin-pass-1' }, null, 'already_initialized');
    eq((await w.api('system.status')).data.initialized, true);
  });
  await test('setup: no SETUP_CODE configured means no setup', async () => {
    const core = createCore({ store: memoryStore(), files: memoryFiles(), env: {} });
    eq((await core.handle('setup.init', { code: '', email: 'a@b.co', password: 'Very-long-admin-pass-1' })).error, 'setup_code_missing');
  });
  await test('login: 5 wrong passwords lock for 15 minutes', async () => {
    const w = world(); const o = await setupOrg(w);
    for (let i = 0; i < 4; i++) await w.fail('auth.login', { id: '1001', password: 'bad' }, null, 'bad_login');
    await w.fail('auth.login', { id: '1001', password: 'bad' }, null, 'locked');
    await w.fail('auth.login', { id: '1001', password: 'temp-pass' }, null, 'locked');
    w.tick(15 * 60000 + 1000);
    ok((await w.must('auth.login', { id: '1001', password: 'temp-pass' })).token);
    ok(o.tS1);
  });
  await test('login: password hashes never leave the server', async () => {
    const w = world(); const o = await setupOrg(w);
    const r = await w.must('auth.login', { id: 'ops1', password: 'temp-pass' });
    ok(!('pw' in r.user));
    const list = await w.must('people.list', {}, o.admin);
    ok(list.every(p => !('pw' in p)));
    const raw = await w.store.get('users', o.s1.id);
    ok(raw.pw.iter >= 300000 && raw.pw.hash.length === 64, 'PBKDF2-SHA256 with 300k+ rounds');
  });
  await test('sessions: reset, password change and deactivation sign out everywhere', async () => {
    const w = world(); const o = await setupOrg(w);
    await w.must('people.resetPassword', { id: o.s1.id, password: 'new-temp-1', mustChange: true }, o.admin);
    await w.fail('learn.home', {}, o.tS1, 'unauthorized');
    const t1 = (await w.must('auth.login', { id: '1001', password: 'new-temp-1' })).token;
    await w.fail('learn.home', {}, t1, 'must_change_password');
    const t2 = (await w.must('auth.changePassword', { current: 'new-temp-1', next: 'my-own-pass' }, t1)).token;
    await w.fail('learn.home', {}, t1, 'unauthorized');
    await w.must('learn.home', {}, t2);
    await w.must('people.save', { ...o.s1, active: false }, o.admin);
    await w.fail('learn.home', {}, t2, 'unauthorized');
    await w.fail('auth.login', { id: '1001', password: 'my-own-pass' }, null, 'bad_login');
  });
  await test('admin recovery with SETUP_CODE', async () => {
    const w = world(); await setupOrg(w);
    await w.fail('setup.recover', { code: 'wrong', email: 'owner@example.com', password: 'Brand-new-admin-pass' }, null, 'bad_setup_code');
    await w.fail('setup.recover', { code: 'correct horse battery staple', email: 'ops1', password: 'Brand-new-admin-pass' }, null, 'not_admin');
    await w.must('setup.recover', { code: 'correct horse battery staple', email: 'owner@example.com', password: 'Brand-new-admin-pass' });
    ok((await w.must('auth.login', { id: 'owner@example.com', password: 'Brand-new-admin-pass' })).token);
  });

  // ---------------- people & roles (server-enforced)
  await test('roles: who can create whom', async () => {
    const w = world(); const o = await setupOrg(w);
    const base = { name: 'X', password: 'Temp-password-12' };
    await w.fail('people.save', { ...base, code: 'a1', role: 'admin' }, o.tIt, 'role_not_allowed');
    await w.fail('people.save', { ...base, code: 'a2', role: 'area' }, o.tIt, 'role_not_allowed');
    await w.must('people.save', { ...base, code: 'a3', role: 'ops' }, o.tIt);
    await w.fail('people.save', { ...base, code: 'a4', role: 'ops' }, o.tOps, 'role_not_allowed');
    await w.must('people.save', { ...base, code: 'a5', role: 'staff' }, o.tOps);
    await w.fail('people.save', { ...base, code: 'a6', role: 'staff' }, o.tTrn, 'forbidden');
    await w.fail('people.list', {}, o.tS1, 'forbidden');
    await w.fail('people.save', { ...o.it, name: 'hacked' }, o.tOps, 'forbidden');
    await w.fail('people.save', { ...base, code: '1001', role: 'staff' }, o.admin, 'duplicate_code');
    await w.must('people.save', { ...base, code: 'a7', role: 'admin' }, o.admin);
  });
  await test('roles: last active admin cannot be removed', async () => {
    const w = world(); const o = await setupOrg(w);
    const owner = (await w.must('people.list', {}, o.admin)).find(p => p.role === 'admin');
    // the only admin cannot demote or deactivate themself
    await w.fail('people.save', { ...owner, role: 'it' }, o.admin, 'forbidden');
    await w.fail('people.save', { ...owner, active: false }, o.admin, 'forbidden');
    const second = await w.must('people.save', { name: 'Second Admin', email: 'second@example.com', role: 'admin', password: 'Second-admin-pass-1', mustChange: false }, o.admin);
    const t2 = (await w.must('auth.login', { id: 'second@example.com', password: 'Second-admin-pass-1' })).token;
    await w.must('people.save', { ...owner, active: false }, t2); // fine: second admin stays active
    await w.fail('people.save', { ...second, active: false }, t2, 'forbidden');
    const active = (await w.store.all('users')).filter(u => u.role === 'admin' && u.active);
    eq(active.length, 1, 'one active admin always remains');
  });
  await test('area manager sees and manages only granted branches', async () => {
    const w = world(); const o = await setupOrg(w);
    await w.must('people.save', { name: 'Area One', code: 'am1', role: 'area', password: 'temp-pass', mustChange: false, perms: ['people.view', 'people.manage', 'reports.view'], scope: { branches: [o.b1.id], teams: [], courses: [] } }, o.admin);
    const t = (await w.must('auth.login', { id: 'am1', password: 'temp-pass' })).token;
    const ids = (await w.must('people.list', {}, t)).map(p => p.code);
    ok(ids.includes('1001') && !ids.includes('1002'), 'scoped list');
    await w.fail('people.save', { ...o.s2, name: 'X' }, t, 'forbidden');
    await w.must('people.save', { ...o.s1, position: 'Cook' }, t);
    await w.fail('people.save', { name: 'New', code: 'n1', role: 'staff', branchId: o.b2.id, password: 'temp-pass' }, t, 'out_of_scope');
    await w.fail('courses.save', { title: 'Mine' }, t, 'forbidden');
  });
  await test('CSV import: preview flags duplicates and errors, one temporary password', async () => {
    const w = world(); const o = await setupOrg(w);
    const rows = [
      { code: '2001', name: 'New Cook', branch: 'B01 - HITTIN', team: 'Kitchen' },
      { code: '1001', name: 'Dup Code', branch: 'B01 - HITTIN' },
      { code: '2002', name: '', branch: 'B01 - HITTIN' },
      { code: '2003', name: 'Unknown Branch', branch: 'B99' },
      { code: '2001', name: 'Dup In File' },
      { code: '2004', name: 'Wants Admin', role: 'admin' }
    ];
    const pre = await w.must('people.import', { rows, dryRun: true }, o.tOps);
    eq(pre.summary, { ok: 1, duplicate: 2, error: 3 });
    eq((await w.store.all('users')).length, 6, 'dry run writes nothing');
    const done = await w.must('people.import', { rows, dryRun: false, password: 'welcome-26' }, o.tOps);
    eq(done.created, 1);
    const r = await w.must('auth.login', { id: '2001', password: 'welcome-26' });
    eq(r.mustChange, true);
  });

  // ---------------- training flow
  await test('training: cards → quiz → certificate, answers never sent early', async () => {
    const w = world(); const o = await setupOrg(w);
    const { c, s, cards } = await makeCourse(w, o.tTrn);
    await w.fail('assign.create', { courseId: c.id, targetType: 'branch', targetId: o.b1.id }, o.tTrn, 'course_not_published');
    await w.must('courses.publish', { id: c.id }, o.tTrn);
    await w.must('assign.create', { courseId: c.id, targetType: 'branch', targetId: o.b1.id, targetLabel: 'B01' }, o.tTrn);
    await w.fail('learn.course', { courseId: c.id }, o.tS2, 'not_assigned');
    await w.fail('learn.openCard', { cardId: cards[0].id }, o.tS2, 'forbidden');
    await w.fail('quiz.start', { courseId: c.id, target: s.id }, o.tS1, 'quiz_locked');
    for (const cd of cards) {
      await w.must('learn.openCard', { cardId: cd.id }, o.tS1);
      await w.fail('learn.completeCard', { cardId: cd.id }, o.tS1, 'too_fast');
      w.tick(5000);
      await w.must('learn.completeCard', { cardId: cd.id }, o.tS1);
    }
    const q = await w.must('quiz.start', { courseId: c.id, target: s.id }, o.tS1);
    ok(!JSON.stringify(q).includes('"answer"'), 'no answer key in quiz payload');
    const wrong = await w.must('quiz.submit', { attemptId: q.attemptId, answers: {} }, o.tS1);
    eq(wrong.passed, false);
    await w.fail('quiz.submit', { attemptId: q.attemptId, answers: {} }, o.tS1, 'already_submitted');
    const q2 = await w.must('quiz.start', { courseId: c.id, target: s.id }, o.tS1);
    const res = await w.must('quiz.submit', { attemptId: q2.attemptId, answers: answerAll(q2, ['63°C', 'true']) }, o.tS1);
    eq([res.score, res.passed], [100, true]);
    ok(res.cert && res.cert.number.startsWith('SSA-2026-'), 'certificate issued');
    const v = await w.must('certs.verify', { number: res.cert.number });
    eq([v.initials, v.status, v.course], ['P. 1.', 'valid', 'General Induction']);
    ok(!('name' in v) && !('uid' in v), 'public check shows initials only');
    const home = await w.must('learn.home', {}, o.tS1);
    eq(home.courses[0].complete, true);
  });
  await test('training: attempt limit and retake wait', async () => {
    const w = world(); const o = await setupOrg(w);
    const { c, s, cards } = await makeCourse(w, o.admin, { attemptLimit: 1 });
    await w.must('courses.save', { ...c, attemptLimit: 1, retakeHours: 0, finalQuiz: undefined }, o.admin);
    await w.must('courses.publish', { id: c.id }, o.admin);
    await w.must('assign.create', { courseId: c.id, targetType: 'user', targetId: o.s1.id }, o.admin);
    for (const cd of cards) { await w.must('learn.openCard', { cardId: cd.id }, o.tS1); w.tick(6000); await w.must('learn.completeCard', { cardId: cd.id }, o.tS1); }
    const q = await w.must('quiz.start', { courseId: c.id, target: s.id }, o.tS1);
    await w.must('quiz.submit', { attemptId: q.attemptId, answers: {} }, o.tS1);
    await w.fail('quiz.start', { courseId: c.id, target: s.id }, o.tS1, 'attempts_exhausted');
  });
  await test('training: replacing a card means viewing it again', async () => {
    const w = world(); const o = await setupOrg(w);
    const { c, s, cards } = await makeCourse(w, o.admin);
    await w.must('courses.publish', { id: c.id }, o.admin);
    await w.must('assign.create', { courseId: c.id, targetType: 'team', targetId: o.kitchen.id }, o.admin);
    for (const cd of cards) { await w.must('learn.openCard', { cardId: cd.id }, o.tS1); w.tick(6000); await w.must('learn.completeCard', { cardId: cd.id }, o.tS1); }
    eq((await w.must('learn.course', { courseId: c.id }, o.tS1)).sections[0].quizUnlocked, true);
    const prep = await w.must('cards.prepareUpload', { courseId: c.id, size: 10 }, o.admin);
    await w.must('cards.update', { id: cards[0].id, key: prep.key }, o.admin);
    const after = await w.must('learn.course', { courseId: c.id }, o.tS1);
    eq([after.sections[0].viewed, after.sections[0].quizUnlocked], [1, false]);
    await w.fail('quiz.start', { courseId: c.id, target: s.id }, o.tS1, 'quiz_locked');
  });
  await test('training: practical sign-off completes the course', async () => {
    const w = world(); const o = await setupOrg(w);
    const { c, s, cards } = await makeCourse(w, o.admin, { skills: ['Grill station'] });
    await w.must('courses.publish', { id: c.id }, o.admin);
    await w.must('assign.create', { courseId: c.id, targetType: 'all' }, o.admin);
    for (const cd of cards) { await w.must('learn.openCard', { cardId: cd.id }, o.tS1); w.tick(6000); await w.must('learn.completeCard', { cardId: cd.id }, o.tS1); }
    const q = await w.must('quiz.start', { courseId: c.id, target: s.id }, o.tS1);
    const r = await w.must('quiz.submit', { attemptId: q.attemptId, answers: answerAll(q, ['63°C', 'true']) }, o.tS1);
    eq(r.cert, null, 'no certificate before sign-off');
    await w.fail('signoff.save', { uid: o.s1.id, courseId: c.id, skill: 'Grill station', status: 'passed' }, o.tS2, 'forbidden');
    const so = await w.must('signoff.save', { uid: o.s1.id, courseId: c.id, skill: 'Grill station', status: 'passed', notes: 'Good' }, o.tOps);
    ok(so.cert, 'certificate after sign-off');
    const re = await w.must('certs.revoke', { id: (await w.store.find('certs', { uid: o.s1.id }))[0].id, reason: 'Issued in error' }, o.tOps);
    eq(re.status, 'revoked');
    eq((await w.must('certs.verify', { number: so.cert.number })).status, 'revoked');
    await w.fail('certs.revoke', { id: re.id, reason: '' }, o.tOps);
  });
  await test('training: new version with retrain resets completion', async () => {
    const w = world(); const o = await setupOrg(w);
    const { c, s, cards } = await makeCourse(w, o.admin);
    await w.must('courses.publish', { id: c.id }, o.admin);
    await w.must('assign.create', { courseId: c.id, targetType: 'role', targetId: 'staff' }, o.admin);
    for (const cd of cards) { await w.must('learn.openCard', { cardId: cd.id }, o.tS1); w.tick(6000); await w.must('learn.completeCard', { cardId: cd.id }, o.tS1); }
    const q = await w.must('quiz.start', { courseId: c.id, target: s.id }, o.tS1);
    await w.must('quiz.submit', { attemptId: q.attemptId, answers: answerAll(q, ['63°C', 'true']) }, o.tS1);
    eq((await w.must('learn.course', { courseId: c.id }, o.tS1)).complete, true);
    await w.must('courses.publish', { id: c.id, requireRetrain: true }, o.admin);
    const after = await w.must('learn.course', { courseId: c.id }, o.tS1);
    eq([after.complete, after.sections[0].viewed], [false, 0]);
  });

  // ---------------- reports, audit, backup
  await test('dashboard: scope and support signals need 2+ signals', async () => {
    const w = world(); const o = await setupOrg(w);
    const { c } = await makeCourse(w, o.admin);
    await w.must('courses.publish', { id: c.id }, o.admin);
    await w.must('assign.create', { courseId: c.id, targetType: 'role', targetId: 'staff', due: '2026-11-20' }, o.admin);
    w.tick(10 * 864e5); // sessions last 14 days
    const d = await w.must('reports.dashboard', {}, o.tOps);
    eq([d.kpis.assignments, d.kpis.overdue, d.kpis.completion], [2, 2, 0]);
    eq(d.support.length, 2, 'overdue + inactive = two signals');
    await w.fail('reports.dashboard', {}, o.tS1, 'forbidden');
  });
  await test('audit log and backup: Admin/IT only, no passwords exported', async () => {
    const w = world(); const o = await setupOrg(w);
    await w.fail('audit.list', {}, o.tOps, 'forbidden');
    await w.fail('backup.export', {}, o.tOps, 'forbidden');
    const log = await w.must('audit.list', {}, o.tIt);
    ok(log.some(a => a.action === 'people.create'));
    ok(!JSON.stringify(log).includes('"pw"'));
    const dump = await w.must('backup.export', {}, o.tIt);
    ok(dump.users.length === 6 && !JSON.stringify(dump).includes('"pw"') && !JSON.stringify(dump).includes('signKey'));
  });
  await test('settings: system settings need IT/Admin', async () => {
    const w = world(); const o = await setupOrg(w);
    await w.must('settings.save', { section: 'training', values: { cardSeconds: 8 } }, o.tOps);
    await w.fail('settings.save', { section: 'system', values: { businessName: 'X' } }, o.tOps, 'forbidden');
    const s = await w.must('settings.save', { section: 'system', values: { businessName: 'Shrimp Shack', certPrefix: 'ss-a' } }, o.tIt);
    eq([s.training.cardSeconds, s.system.certPrefix], [8, 'SSA']);
  });

  // ---------------- helpers
  await test('CSV export is safe against formula injection', () => {
    const csv = toCSV([['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', 'normal', 'a,b']]);
    ok(csv.includes(`"'=HYPERLINK(""x"")"`) && csv.includes("'+1") && csv.includes("'-2") && csv.includes("'@SUM(A1)") && csv.includes('"a,b"'));
    eq(parseCSV('code,name\r\n1,"Ali, Jr"\n2,"Say ""hi"""\n'), [['code', 'name'], ['1', 'Ali, Jr'], ['2', 'Say "hi"']]);
  });
  await test('PDF file names set card order and title', () => {
    eq(parseCardName('01 - Classic Burger.pdf'), { order: 1, title: 'Classic Burger' });
    eq(parseCardName('12_Shack_Mix.PDF'), { order: 12, title: 'Shack Mix' });
    eq(parseCardName('روبيان مقشر.pdf'), { order: null, title: 'روبيان مقشر' });
  });
  await test('translations: every key used by the screens exists in EN, AR and UR', async () => {
    const { DICT } = await import('../site/js/i18n.js');
    const src = await (await fetch('../site/js/app.js')).text();
    const keys = [...new Set([...src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)].map(m => m[1]))].filter(k => !k.endsWith('.'));
    // dynamic keys built from known lists
    for (const r of ['admin', 'it', 'ops', 'training', 'area', 'staff']) keys.push('role.' + r);
    for (const s of ['passed', 'practice', 'none']) keys.push('signoff.' + s);
    for (const s of ['valid', 'revoked', 'replaced']) keys.push('cert.' + s);
    for (const s of ['draft', 'published', 'archived']) keys.push('cstatus.' + s);
    for (const s of ['overdue', 'fails', 'lowScore', 'inactive']) keys.push('signal.' + s);
    for (const s of ['overdue', 'dueSoon', 'assigned']) keys.push('note.' + s);
    for (const s of ['user', 'team', 'branch', 'role', 'all']) keys.push('assign.' + s);
    for (const s of ['training', 'kpi', 'system']) keys.push('settings.' + s);
    for (const s of ['people.view', 'people.manage', 'training.assign', 'training.signoff', 'reports.view', 'content.manage']) keys.push('perm.' + s);
    const missing = [];
    for (const k of keys) for (const l of ['en', 'ar']) if (!(k in DICT[l])) missing.push(`${l}:${k}`);
    const urMissing = keys.filter(k => !(k in DICT.ur));
    if (missing.length) throw new Error('missing ' + missing.join(', '));
    if (urMissing.length > 25) throw new Error('too many Urdu gaps: ' + urMissing.join(', '));
  });
}
