// Shrimp Shack Academy — screens. All permission decisions are made by the server core;
// the UI only hides what the person cannot use.
import { call, upload, MODE, TRIAL_SETUP_CODE, getToken, setToken, prefs, resetTrial } from './api.js';
import { t, setLang, lang, LANGS } from './i18n.js';
import { h, clear, icon, btn, toast, showError, errText, modal, confirmBox, field, input, select, fmtDate, toCSV, parseCSV, download, loadScript, CDN, parseCardName, parseQuizText } from './ui.js';
import { canGiveRole, ROLES, AREA_PERMS, RANK } from './core.js';

const cfg = window.APP_CONFIG || {};
const S = { status: null, me: null, perms: new Set(), org: { branches: [], teams: [] } };
const $main = () => document.getElementById('main');
const go = path => { if (location.hash !== '#' + path) location.hash = path; else render(); };
const has = p => S.perms.has(p);
const firstName = n => String(n || '').split(/\s+/)[0];
const siteBase = () => (cfg.siteUrl || (location.origin + location.pathname)).replace(/#.*$/, '');
const roleLabel = r => t('role.' + r);
const branchName = id => S.org.branches.find(b => b.id === id)?.name || '—';
const teamName = id => S.org.teams.find(b => b.id === id)?.name || '—';
const pct = v => (v == null ? '—' : v + '%');

// ------------------------------------------------------------------ boot
async function boot() {
  applyTheme(prefs.get('ssa.theme') || 'light');
  try { S.status = await call('system.status'); } catch (e) { S.status = { initialized: true, mode: MODE, defaultLang: 'en', error: e }; }
  setLang(prefs.get('ssa.lang') || S.status.defaultLang || cfg.defaultLang || 'en');
  if (getToken()) await loadMe();
  window.addEventListener('hashchange', render);
  render();
}
async function loadMe() {
  try {
    const r = await call('auth.me'); S.me = r.user; S.perms = new Set(r.perms);
    if (!prefs.get('ssa.lang') && S.me.lang) setLang(S.me.lang);
    try { S.org = await call('org.list'); } catch { /* may be in forced password change */ }
  } catch { S.me = null; S.perms = new Set(); setToken(null); }
}
function applyTheme(th) {
  document.documentElement.dataset.theme = th;
  const b = document.getElementById('themeBtn');
  if (b) { clear(b).append(icon(th === 'dark' ? 'sun' : 'moon')); b.setAttribute('aria-pressed', th === 'dark'); b.setAttribute('aria-label', t('theme.toggle')); }
}

// ------------------------------------------------------------------ chrome (header / nav)
function navItems() {
  const items = [['home', 'home', t('nav.home')], ['certs', 'award', t('nav.certs')]];
  if (has('reports.view')) items.push(['dashboard', 'chart', t('nav.dashboard')]);
  if (has('people.view')) items.push(['people', 'users', t('nav.people')]);
  if (has('org.manage')) items.push(['org', 'store', t('nav.org')]);
  if (has('content.manage')) items.push(['courses', 'book', t('nav.courses')]);
  if (has('training.assign')) items.push(['assign', 'send', t('nav.assign')]);
  if (has('training.signoff')) items.push(['signoffs', 'check', t('nav.signoffs')]);
  if (has('settings.training') || has('settings.system')) items.push(['settings', 'gear', t('nav.settings')]);
  if (has('audit.view')) items.push(['audit', 'shield', t('nav.audit')]);
  items.push(['profile', 'user', t('nav.profile')], ['help', 'help', t('nav.help')]);
  return items;
}
function renderChrome(active) {
  const top = document.getElementById('top'); clear(top);
  top.append(h('div', { class: 'top-in' },
    h('a', { class: 'mark', href: '#/home', 'aria-label': t('app.name') }, h('img', { src: 'assets/logo.svg', alt: '', width: 36, height: 36 }), h('span', null, t('app.name'))),
    h('div', { class: 'spacer' }),
    h('div', { class: 'toolbar', role: 'group', 'aria-label': t('lang.choose') },
      LANGS.map(([code, label]) => h('button', { class: 'chip-btn', type: 'button', lang: code, 'aria-pressed': String(lang() === code), onclick: () => changeLang(code) }, label)),
      h('button', { class: 'chip-btn', id: 'themeBtn', type: 'button', onclick: () => { const th = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; prefs.set('ssa.theme', th); applyTheme(th); } }))
  ), h('div', { class: 'wave', 'aria-hidden': 'true' }));
  applyTheme(document.documentElement.dataset.theme);

  const banner = document.getElementById('banner'); clear(banner);
  if (MODE === 'trial') banner.append(h('div', { class: 'trial-banner', role: 'note' }, icon('flag'), h('span', null, t('trial.banner'))));

  const side = document.getElementById('sidenav'), bottom = document.getElementById('bottomnav');
  clear(side); clear(bottom);
  const signedIn = !!S.me && !S.me.mustChange;
  document.body.classList.toggle('signed-in', signedIn);
  if (!signedIn) return;
  const items = navItems();
  side.append(h('div', { class: 'who' }, h('strong', null, S.me.name), h('span', null, roleLabel(S.me.role))),
    items.map(([r, ic, label]) => h('a', { href: '#/' + r, class: 'nav-link' + (active === r ? ' active' : ''), 'aria-current': active === r ? 'page' : null }, icon(ic), h('span', null, label))));
  const main4 = items.filter(([r]) => ['home', 'certs', 'dashboard', 'courses'].includes(r)).slice(0, 3);
  bottom.append(main4.map(([r, ic, label]) => h('a', { href: '#/' + r, class: 'tab' + (active === r ? ' active' : ''), 'aria-current': active === r ? 'page' : null }, icon(ic), h('span', null, label))),
    h('button', { type: 'button', class: 'tab', onclick: openMore }, icon('menu'), h('span', null, t('nav.more'))));
}
function openMore() {
  const list = h('div', { class: 'more-list' }, navItems().map(([r, ic, label]) => h('a', { href: '#/' + r, class: 'nav-link', onclick: () => document.querySelector('dialog.modal')?.close() }, icon(ic), h('span', null, label))));
  modal(t('nav.more'), list, []).then(() => {});
}
async function changeLang(code) {
  setLang(code); prefs.set('ssa.lang', code);
  if (S.me) call('auth.setLang', { lang: code }).catch(() => {});
  render();
}

// ------------------------------------------------------------------ router
const PUBLIC = ['verify', 'setup', 'recover', 'login'];
async function render() {
  const [, route = 'home', ...args] = (location.hash || '#/home').split('/');
  const m = $main(); clear(m); m.setAttribute('aria-busy', 'true');
  window.__cleanup?.(); window.__cleanup = null;
  if (route === 'verify') { renderChrome(''); await safe(() => verifyView(m, decodeURIComponent(args[0] || ''))); return done(m); }
  if (!S.status?.initialized) {
    renderChrome('');
    if (S.status?.error) { m.append(errorBox(S.status.error)); return done(m); }
    await safe(() => (route === 'recover' ? recoverView(m) : setupView(m))); return done(m);
  }
  if (!S.me) { renderChrome(''); await safe(() => (route === 'recover' ? recoverView(m) : loginView(m))); return done(m); }
  if (S.me.mustChange) { renderChrome(''); await safe(() => changePasswordView(m, true)); return done(m); }
  renderChrome(route);
  const views = {
    home: homeView, course: courseView, viewer: viewerView, quiz: quizView, certs: certsView, cert: certView,
    dashboard: dashboardView, people: peopleView, import: importView, org: orgView, courses: coursesView, edit: courseEditView,
    assign: assignView, signoffs: signoffView, settings: settingsView, audit: auditView, profile: profileView, help: helpView
  };
  const v = views[route] || homeView;
  await safe(() => v(m, ...args.map(decodeURIComponent)));
  done(m);
}
function done(m) { m.removeAttribute('aria-busy'); document.title = (m.querySelector('h1')?.textContent || '') + ' · ' + t('app.name'); }
async function safe(fn) {
  try { await fn(); } catch (e) {
    if (e?.code === 'unauthorized') { S.me = null; return go('/login'); }
    if (e?.code === 'must_change_password') { S.me.mustChange = true; return render(); }
    console.error(e); $main().append(errorBox(e));
  }
}
const errorBox = e => h('div', { class: 'empty error' }, icon('flag'), h('p', null, errText(e)), btn(t('retry'), () => render(), 'btn-ghost'));
const empty = (text, action) => h('div', { class: 'empty' }, icon('book'), h('p', null, text), action || null);
const pageHead = (title, sub, ...actions) => h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), sub ? h('p', { class: 'lead' }, sub) : null), actions.length ? h('div', { class: 'actions' }, actions) : null);
const badge = (text, kind) => h('span', { class: 'badge b-' + kind }, text);

// ------------------------------------------------------------------ first run / sign-in
function setupView(m) {
  const code = input({ type: 'password', autocomplete: 'off', required: true });
  const name = input({ required: true, autocomplete: 'name', maxlength: 120 });
  const email = input({ type: 'email', required: true, autocomplete: 'username' });
  const pw = input({ type: 'password', required: true, minlength: 12, autocomplete: 'new-password' });
  const pw2 = input({ type: 'password', required: true, minlength: 12, autocomplete: 'new-password' });
  const form = h('form', { class: 'card form narrow', onsubmit: async ev => {
    ev.preventDefault();
    if (pw.value !== pw2.value) return toast(t('err.password_mismatch'), 'error');
    try {
      const r = await call('setup.init', { code: code.value, name: name.value, email: email.value, password: pw.value });
      setToken(r.token); S.status.initialized = true; await loadMe(); toast(t('setup.done')); go('/org');
    } catch (e) { showError(e); }
  } },
    MODE === 'trial' ? h('div', { class: 'note note-info' }, t('setup.trialCode'), ' ', h('code', null, TRIAL_SETUP_CODE)) : null,
    field(t('setup.code'), code, t('setup.codeHint')), field(t('person.name'), name), field(t('setup.email'), email),
    field(t('password.new'), pw, t('password.rule12')), field(t('password.confirm'), pw2),
    h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, t('setup.create')));
  m.append(pageHead(t('setup.title'), t('setup.lead')), form);
}
function recoverView(m) {
  const code = input({ type: 'password', required: true, autocomplete: 'off' });
  const email = input({ type: 'email', required: true, autocomplete: 'username' });
  const pw = input({ type: 'password', required: true, minlength: 12, autocomplete: 'new-password' });
  m.append(pageHead(t('recover.title'), t('recover.lead')), h('form', { class: 'card form narrow', onsubmit: async ev => {
    ev.preventDefault();
    try { await call('setup.recover', { code: code.value, email: email.value, password: pw.value }); toast(t('recover.done')); go('/login'); } catch (e) { showError(e); }
  } }, field(t('setup.code'), code), field(t('setup.email'), email), field(t('password.new'), pw, t('password.rule12')),
  h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, t('recover.go')), h('a', { href: '#/login', class: 'link-center' }, t('back'))));
}
function loginView(m) {
  const id = input({ required: true, autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' });
  const pw = input({ type: 'password', required: true, autocomplete: 'current-password' });
  const msg = h('div', { role: 'alert', class: 'form-msg' });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, t('login.go'));
  m.append(h('div', { class: 'login-hero' }, h('img', { src: 'assets/logo.svg', alt: '', width: 84, height: 84 }), h('h1', null, t('login.title')), h('p', { class: 'lead' }, t('login.lead'))),
    h('form', { class: 'card form narrow', onsubmit: async ev => {
      ev.preventDefault(); msg.textContent = ''; submit.disabled = true;
      try {
        const r = await call('auth.login', { id: id.value, password: pw.value });
        setToken(r.token); await loadMe(); go('/home');
      } catch (e) {
        msg.textContent = e.code === 'locked' ? t('err.locked', { time: fmtDate(e.extra.until, true) }) : errText(e);
      } finally { submit.disabled = false; }
    } }, field(t('login.id'), id, t('login.idHint')), field(t('login.password'), pw), msg, submit,
    h('p', { class: 'hint center' }, t('login.forgot'))),
    h('p', { class: 'center small' }, h('a', { href: '#/recover' }, t('recover.link'))),
    S.status?.privacyNotice ? h('p', { class: 'center small muted' }, S.status.privacyNotice) : null);
}
function changePasswordView(m, forced) {
  const cur = input({ type: 'password', required: true, autocomplete: 'current-password' });
  const pw = input({ type: 'password', required: true, minlength: 8, autocomplete: 'new-password' });
  const pw2 = input({ type: 'password', required: true, minlength: 8, autocomplete: 'new-password' });
  const form = h('form', { class: 'card form narrow', onsubmit: async ev => {
    ev.preventDefault();
    if (pw.value !== pw2.value) return toast(t('err.password_mismatch'), 'error');
    try { const r = await call('auth.changePassword', { current: cur.value, next: pw.value }); setToken(r.token); await loadMe(); toast(t('password.changed')); go('/home'); } catch (e) { showError(e); }
  } }, field(t('password.current'), cur), field(t('password.new'), pw, t('password.rule')), field(t('password.confirm'), pw2),
  h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, t('password.save')),
  forced ? btn(t('signout'), signOut, 'btn-ghost btn-block') : null);
  if (forced) m.append(pageHead(t('password.firstTitle'), t('password.firstLead')), form);
  else return form;
}
function signOut() { setToken(null); S.me = null; S.perms = new Set(); go('/login'); }

// ------------------------------------------------------------------ learner
async function homeView(m) {
  const d = await call('learn.home');
  m.append(pageHead(t('home.hello', { name: firstName(S.me.name) }), t('home.lead')));
  if (d.notifications.length) m.append(h('div', { class: 'notes' }, d.notifications.map(n => h('div', { class: 'note note-' + n.type }, icon(n.type === 'overdue' ? 'flag' : 'book'), h('span', null, t('note.' + n.type, { course: n.courseTitle, date: fmtDate(n.due) }))))));
  if (!d.courses.length) return m.append(empty(t('home.empty')));
  m.append(h('div', { class: 'grid courses' }, d.courses.map(c => h('a', { class: 'card course-card', href: '#/course/' + c.id },
    h('div', { class: 'hero' }),
    h('div', { class: 'body' },
      h('div', { class: 'row-between' }, h('h3', null, c.title), c.complete ? badge(t('status.complete'), 'ok') : c.overdue ? badge(t('status.overdue'), 'danger') : c.dueSoon ? badge(t('status.dueSoon'), 'warn') : null),
      progressBar(c.percent),
      h('div', { class: 'meta' }, t('home.percent', { n: c.percent }), ' · ', c.due ? t('home.due', { date: fmtDate(c.due) }) : t('home.noDue')),
      h('span', { class: 'btn btn-primary' }, c.complete ? t('home.review') : c.percent ? t('home.continue') : t('home.start'))
    )))));
}
const progressBar = p => h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': p, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: p + '%' } }));

async function courseView(m, id) {
  const d = await call('learn.course', { courseId: id });
  m.append(h('a', { href: '#/home', class: 'back' }, icon('prev'), t('back')),
    pageHead(d.course.title, d.course.description), h('div', { class: 'card' }, progressBar(d.percent), h('div', { class: 'meta' }, t('home.percent', { n: d.percent }))));
  if (d.cert) m.append(h('div', { class: 'note note-ok' }, icon('award'), h('span', null, t('course.certReady')), btn(t('course.viewCert'), () => go('/cert/' + d.cert.number), 'btn-primary btn-sm')));
  const list = h('ol', { class: 'steps' });
  d.sections.forEach((s, i) => {
    const firstUnseen = Math.max(0, s.cardList.findIndex(c => !c.viewed));
    list.append(h('li', { class: 'card step' + (s.passed ? ' done' : '') },
      h('div', { class: 'row-between' }, h('h3', null, t('course.section', { n: i + 1 }), ': ', s.title), s.passed ? badge(t('status.done'), 'ok') : null),
      h('div', { class: 'meta' }, t('course.cardsViewed', { a: s.viewed, b: s.cards })),
      h('ul', { class: 'card-titles' }, s.cardList.map(c => h('li', { class: c.viewed ? 'seen' : '' }, icon(c.viewed ? 'check' : 'file'), c.title))),
      h('div', { class: 'actions' },
        s.cards ? btn(s.viewed === s.cards ? t('course.reviewCards') : t('course.viewCards'), () => go(`/viewer/${id}/${s.id}/${s.viewed === s.cards ? 0 : firstUnseen}`), s.viewed === s.cards ? 'btn-ghost' : 'btn-primary') : null,
        s.hasQuiz ? (s.passed ? badge(t('course.quizPassed', { n: s.best }), 'ok')
          : !s.quizUnlocked ? h('span', { class: 'locked' }, icon('lock'), t('course.quizLocked'))
            : btn(t('course.takeQuiz'), () => go(`/quiz/${id}/${s.id}`), 'btn-accent')) : null,
        s.tries ? h('span', { class: 'meta' }, t('course.tries', { n: s.tries, best: s.best ?? '—' })) : null)));
  });
  if (d.final.has) list.append(h('li', { class: 'card step' + (d.final.passed ? ' done' : '') },
    h('div', { class: 'row-between' }, h('h3', null, t('course.final')), d.final.passed ? badge(t('status.done'), 'ok') : null),
    h('div', { class: 'meta' }, t('course.finalInfo', { n: d.course.finalCount, pass: d.course.passMark })),
    h('div', { class: 'actions' }, d.final.passed ? badge(t('course.quizPassed', { n: d.final.best }), 'ok') : !d.final.unlocked ? h('span', { class: 'locked' }, icon('lock'), t('course.finalLocked')) : btn(t('course.takeFinal'), () => go(`/quiz/${id}/final`), 'btn-accent'))));
  if (d.skills.length) list.append(h('li', { class: 'card step' }, h('h3', null, t('course.skills')), h('p', { class: 'meta' }, t('course.skillsLead')),
    h('ul', { class: 'skill-list' }, d.skills.map(s => h('li', null, h('span', null, s.skill), badge(t('signoff.' + s.status), s.status === 'passed' ? 'ok' : s.status === 'practice' ? 'warn' : 'muted'))))));
  m.append(list);
  const rules = [];
  if (d.course.attemptLimit) rules.push(t('course.ruleAttempts', { n: d.course.attemptLimit }));
  if (d.course.timeLimitMin) rules.push(t('course.ruleTime', { n: d.course.timeLimitMin }));
  if (d.course.retakeHours) rules.push(t('course.ruleRetake', { n: d.course.retakeHours }));
  rules.push(t('course.rulePass', { n: d.course.passMark }));
  m.append(h('p', { class: 'meta' }, rules.join(' · ')));
}

async function viewerView(m, courseId, sectionId, idxStr) {
  const d = await call('learn.course', { courseId });
  const sec = d.sections.find(s => s.id === sectionId); if (!sec) return go('/course/' + courseId);
  const list = sec.cardList; const idx = Math.min(Math.max(0, Number(idxStr) || 0), list.length - 1); const card = list[idx];
  let zoom = 1;
  const stage = h('div', { class: 'pdf-stage', oncontextmenu: e => e.preventDefault() }, h('div', { class: 'spinner', 'aria-label': t('loading') }));
  const timer = h('span', { class: 'timer', 'aria-live': 'polite' });
  const nextBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, h('span', null, idx + 1 < list.length ? t('viewer.next') : t('viewer.finish')), icon('next'));
  const prevBtn = h('button', { type: 'button', class: 'btn btn-ghost', disabled: idx === 0, onclick: () => go(`/viewer/${courseId}/${sectionId}/${idx - 1}`) }, icon('prev'), h('span', null, t('viewer.prev')));
  m.classList.add('viewer-page');
  m.append(h('div', { class: 'viewer-top' }, h('a', { href: '#/course/' + courseId, class: 'back' }, icon('prev'), sec.title),
    h('strong', null, t('viewer.cardOf', { a: idx + 1, b: list.length })), h('div', { class: 'zoom' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('viewer.zoomOut'), onclick: () => { zoom = Math.max(0.6, zoom - 0.2); draw(); } }, icon('minus')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('viewer.zoomIn'), onclick: () => { zoom = Math.min(3, zoom + 0.2); draw(); } }, icon('plus')))),
  h('h1', { class: 'card-title' }, card.title), stage, h('div', { class: 'viewer-nav' }, prevBtn, timer, nextBtn));

  const o = await call('learn.openCard', { cardId: card.id });
  let pdf;
  async function draw() {
    try {
      await loadScript(CDN.pdfjs);
      const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
      pdf ||= await lib.getDocument({ url: o.url, isEvalSupported: false }).promise;
      const frag = document.createDocumentFragment(); const width = Math.max(260, stage.clientWidth - 2);
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p); const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2); const scale = width / base.width * zoom;
        const vp = page.getViewport({ scale: scale * dpr });
        const c = h('canvas', { class: 'pdf-page', width: Math.floor(vp.width), height: Math.floor(vp.height), 'aria-label': `${card.title} – ${p}/${pdf.numPages}`, role: 'img' });
        c.style.width = Math.floor(vp.width / dpr) + 'px';
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; frag.append(c);
      }
      clear(stage).append(frag);
    } catch (e) { console.error(e); clear(stage).append(h('p', { class: 'empty error' }, t('viewer.loadError'))); }
  }
  draw();
  let left = card.viewed ? 0 : o.seconds;
  const tick = () => {
    if (left > 0) { timer.textContent = t('viewer.wait', { n: left }); nextBtn.disabled = true; left--; }
    else { timer.textContent = ''; nextBtn.disabled = false; clearInterval(iv); }
  };
  const iv = setInterval(tick, 1000); tick();
  nextBtn.onclick = async () => {
    nextBtn.disabled = true;
    try {
      if (!card.viewed) await call('learn.completeCard', { cardId: card.id });
      if (idx + 1 < list.length) go(`/viewer/${courseId}/${sectionId}/${idx + 1}`);
      else { toast(sec.hasQuiz ? t('viewer.doneQuiz') : t('viewer.done')); go('/course/' + courseId); }
    } catch (e) { if (e.code === 'too_fast') { left = e.extra.wait || 1; tick(); } else showError(e); nextBtn.disabled = false; }
  };
  // swipe & keyboard (mirrored for right-to-left)
  let x0 = null;
  stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => {
    if (x0 == null || zoom > 1) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) < 60) return; const forward = document.dir === 'rtl' ? dx > 0 : dx < 0;
    (forward ? nextBtn : prevBtn).disabled || (forward ? nextBtn : prevBtn).click();
  });
  const key = e => {
    if (e.target.closest('input,textarea,select')) return;
    const fwd = document.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight', back = document.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd && !nextBtn.disabled) nextBtn.click(); if (e.key === back && !prevBtn.disabled) prevBtn.click();
  };
  document.addEventListener('keydown', key);
  window.__cleanup = () => { clearInterval(iv); document.removeEventListener('keydown', key); m.classList.remove('viewer-page'); pdf?.destroy?.(); };
}

async function quizView(m, courseId, target) {
  let q;
  try { q = await call('quiz.start', { courseId, target }); } catch (e) {
    const extra = e.code === 'retake_wait' ? t('err.retake_wait', { time: fmtDate(e.extra.until, true) }) : errText(e);
    return m.append(h('div', { class: 'empty' }, icon('lock'), h('p', null, extra), btn(t('back'), () => go('/course/' + courseId), 'btn-ghost')));
  }
  const answers = {};
  const timer = h('span', { class: 'timer', 'aria-live': 'off' });
  const form = h('form', { class: 'quiz', onsubmit: async ev => {
    ev.preventDefault();
    const missing = q.questions.filter(x => answers[x.id] == null).length;
    if (missing && !(await confirmBox(t('quiz.unansweredTitle'), t('quiz.unanswered', { n: missing }), t('quiz.submit')))) return;
    submit();
  } });
  q.questions.forEach((x, i) => form.append(h('fieldset', { class: 'card q' }, h('legend', null, h('span', { class: 'qn' }, `${i + 1}/${q.questions.length}`), x.text),
    x.options.map((o, j) => h('label', { class: 'opt' }, h('input', { type: 'radio', name: 'q' + x.id, value: j, onchange: () => { answers[x.id] = j; } }), h('span', null, x.type === 'tf' ? t('quiz.' + o) : o))))));
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-accent btn-block' }, t('quiz.submit'));
  form.append(submitBtn);
  m.append(h('a', { href: '#/course/' + courseId, class: 'back' }, icon('prev'), t('back')),
    pageHead(target === 'final' ? t('course.final') : t('quiz.title'), t('quiz.info', { n: q.questions.length, pass: q.passMark, a: q.number, b: q.attemptLimit || '∞' })),
    q.timeLimitMin ? h('div', { class: 'quiz-timer' }, timer) : null, form);
  let iv;
  if (q.timeLimitMin) {
    const end = Date.now() + q.timeLimitMin * 60000;
    const tick = () => { const s = Math.max(0, Math.round((end - Date.now()) / 1000)); timer.textContent = t('quiz.timeLeft', { t: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }); if (!s) { clearInterval(iv); submit(); } };
    iv = setInterval(tick, 1000); tick();
  }
  let sent = false;
  async function submit() {
    if (sent) return; sent = true; clearInterval(iv); submitBtn.disabled = true;
    try {
      const r = await call('quiz.submit', { attemptId: q.attemptId, answers });
      clear(m); window.__cleanup = null;
      m.append(h('div', { class: 'card result ' + (r.passed ? 'pass' : 'fail') },
        h('div', { class: 'score' }, r.score + '%'), h('h1', null, r.passed ? t('quiz.passed') : r.late ? t('quiz.late') : t('quiz.failed')),
        h('p', null, t('quiz.correct', { a: r.correct, b: r.total, pass: r.passMark })),
        h('div', { class: 'actions center' }, r.cert ? btn(t('course.viewCert'), () => go('/cert/' + r.cert.number), 'btn-accent') : null, btn(t('quiz.backCourse'), () => go('/course/' + courseId), 'btn-primary'))));
      if (r.cert) toast(t('course.certReady'));
      if (r.review) m.append(h('h2', null, t('quiz.review')), r.review.map((x, i) => h('div', { class: 'card q review' },
        h('div', { class: 'row-between' }, h('strong', null, `${i + 1}. ${x.text}`), badge(x.right ? t('quiz.right') : t('quiz.wrong'), x.right ? 'ok' : 'danger')),
        h('ul', null, x.options.map((o, j) => h('li', { class: (j === x.correct ? 'is-correct ' : '') + (j === x.chosen ? 'is-chosen' : '') }, o === 'true' || o === 'false' ? t('quiz.' + o) : o, j === x.chosen ? ` (${t('quiz.yourAnswer')})` : ''))))));
    } catch (e) { sent = false; submitBtn.disabled = false; showError(e); }
  }
  window.__cleanup = () => clearInterval(iv);
}

// ------------------------------------------------------------------ certificates
async function certsView(m) {
  const d = await call('certs.list');
  m.append(pageHead(t('certs.title'), t('certs.lead')));
  if (!d.mine.length) m.append(empty(t('certs.none')));
  else m.append(h('div', { class: 'grid courses' }, d.mine.map(c => h('a', { class: 'card cert-tile', href: '#/cert/' + c.number }, icon('award'), h('div', null, h('strong', null, c.courseTitle), h('div', { class: 'meta' }, fmtDate(c.issuedAt), ' · ', c.number)), certBadge(c.status)))));
  if (d.managed.length) {
    m.append(h('h2', null, t('certs.team')));
    m.append(h('div', { class: 'list' }, d.managed.map(c => h('div', { class: 'list-row' },
      h('div', { class: 'grow' }, h('strong', null, c.name), h('div', { class: 'meta' }, c.courseTitle, ' · ', c.number, ' · ', fmtDate(c.issuedAt))), certBadge(c.status),
      h('div', { class: 'actions' }, btn(t('open'), () => go('/cert/' + c.number), 'btn-ghost btn-sm'),
        c.status === 'valid' && has('training.signoff') ? btn(t('certs.revoke'), async () => { const r = await confirmBox(t('certs.revoke'), t('certs.revokeQ', { n: c.number }), t('certs.revoke'), true, true); if (r) { try { await call('certs.revoke', { id: c.id, reason: r.reason }); toast(t('saved')); render(); } catch (e) { showError(e); } } }, 'btn-ghost btn-sm') : null,
        c.status === 'valid' && has('training.signoff') ? btn(t('certs.reissue'), async () => { const r = await confirmBox(t('certs.reissue'), t('certs.reissueQ'), t('certs.reissue'), false, true); if (r) { try { const n = await call('certs.reissue', { id: c.id, reason: r.reason }); toast(t('certs.reissued', { n: n.number })); render(); } catch (e) { showError(e); } } }, 'btn-ghost btn-sm') : null)))));
  }
}
const certBadge = s => badge(t('cert.' + s), s === 'valid' ? 'ok' : s === 'revoked' ? 'danger' : 'muted');

async function certView(m, number) {
  const c = await call('certs.get', { number });
  const canvas = await drawCertificate(c);
  canvas.classList.add('cert-canvas'); canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${c.certTitle} – ${c.name} – ${c.courseTitle}`);
  m.append(h('a', { href: '#/certs', class: 'back' }, icon('prev'), t('nav.certs')), pageHead(c.courseTitle, `⁦${c.number}⁩ · ${fmtDate(c.issuedAt)}`, certBadge(c.status)),
    canvas, h('div', { class: 'actions' },
      btn([icon('download'), t('cert.png')], () => canvas.toBlob(b => download(`${c.number}.png`, b)), 'btn-ghost'),
      btn([icon('download'), t('cert.pdf')], async () => {
        try { await loadScript(CDN.jspdf); const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210); pdf.save(`${c.number}.pdf`); } catch (e) { showError(e); }
      }, 'btn-primary'),
      h('a', { class: 'btn btn-ghost', href: `#/verify/${encodeURIComponent(c.number)}` }, t('cert.verifyLink'))));
}
async function drawCertificate(c) {
  try { await Promise.all(['700 80px "Bebas Neue"', '700 40px Lato', '700 40px Tajawal'].map(f => document.fonts.load(f))); } catch { /* fallback fonts */ }
  const W = 1754, H = 1240; const cv = h('canvas', { width: W, height: H }); const x = cv.getContext('2d');
  x.fillStyle = '#FBF7EF'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#005397'; x.fillRect(0, 0, W, 36); x.fillRect(0, H - 36, W, 36); x.fillRect(0, 0, 36, H); x.fillRect(W - 36, 0, 36, H);
  x.setLineDash([18, 12]); x.strokeStyle = '#F0542B'; x.lineWidth = 4; x.strokeRect(64, 64, W - 128, H - 128); x.setLineDash([]);
  x.strokeStyle = '#F3D410'; x.lineWidth = 6; x.beginPath();
  for (let i = 0; i <= 30; i++) { const px = W / 2 - 300 + i * 20; x.arc(px, 330, 10, Math.PI, 0, i % 2 === 0); } x.stroke();
  x.textAlign = 'center'; x.fillStyle = '#005397';
  try { const logo = new Image(); logo.src = 'assets/logo.svg'; await logo.decode(); x.drawImage(logo, W / 2 - 70, 100, 140, 140); } catch { /* ignore */ }
  x.font = '400 112px "Bebas Neue", sans-serif'; x.fillText(String(c.certTitle).toUpperCase(), W / 2, 300 + 110);
  x.fillStyle = '#5B6472'; x.font = '400 34px Lato, Tajawal, sans-serif'; x.fillText(c.businessName, W / 2, 480);
  x.fillStyle = '#1B2433'; x.font = '900 84px Lato, Tajawal, sans-serif'; x.fillText(c.name, W / 2, 610);
  x.fillStyle = '#5B6472'; x.font = '400 36px Lato, Tajawal, sans-serif'; x.fillText(c.certText, W / 2, 680);
  x.fillStyle = '#C2410C'; x.font = '700 60px Lato, Tajawal, sans-serif'; x.fillText(c.courseTitle, W / 2, 770);
  x.fillStyle = '#1B2433'; x.font = '400 30px Lato, sans-serif'; x.textAlign = 'left';
  x.fillText(new Date(c.issuedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), 140, 1080);
  x.fillText(c.number, 140, 1125);
  x.font = '700 22px Lato, sans-serif'; x.fillStyle = '#5B6472'; x.fillText('DATE · NUMBER', 140, 1035);
  if (c.status !== 'valid') { x.save(); x.translate(W / 2, H / 2); x.rotate(-0.35); x.fillStyle = 'rgba(180,35,24,.25)'; x.font = '900 200px Lato'; x.textAlign = 'center'; x.fillText(c.status.toUpperCase(), 0, 0); x.restore(); }
  try {
    await loadScript(CDN.qr); const qr = window.qrcode(0, 'M'); qr.addData(`${siteBase()}#/verify/${encodeURIComponent(c.number)}`); qr.make();
    const n = qr.getModuleCount(), size = 200, cell = size / n, ox = W - 140 - size, oy = H - 140 - size + 30;
    x.fillStyle = '#fff'; x.fillRect(ox - 12, oy - 12, size + 24, size + 24); x.fillStyle = '#1B2433';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) x.fillRect(ox + k * cell, oy + r * cell, Math.ceil(cell), Math.ceil(cell));
  } catch { /* QR library unavailable */ }
  return cv;
}
async function verifyView(m, number) {
  const r = number ? await call('certs.verify', { number }) : { found: false };
  m.append(pageHead(t('verify.title'), t('verify.lead')));
  if (!r.found) return m.append(h('div', { class: 'card verify bad' }, icon('flag'), h('p', null, t('verify.notFound'))));
  m.append(h('div', { class: 'card verify ' + (r.status === 'valid' ? 'good' : 'bad') },
    h('div', { class: 'row-between' }, h('strong', null, r.number), certBadge(r.status)),
    h('dl', null, h('dt', null, t('verify.holder')), h('dd', null, r.initials), h('dt', null, t('verify.course')), h('dd', null, r.course), h('dt', null, t('verify.date')), h('dd', null, fmtDate(r.issuedAt)),
      r.replacedBy ? [h('dt', null, t('verify.replacedBy')), h('dd', null, h('a', { href: '#/verify/' + encodeURIComponent(r.replacedBy) }, r.replacedBy))] : null)));
}

// ------------------------------------------------------------------ people
async function peopleView(m) {
  const people = await call('people.list');
  const q = input({ type: 'search', placeholder: t('people.search'), 'aria-label': t('people.search') });
  const fb = select([['', t('people.allBranches')], ...S.org.branches.map(b => [b.id, b.name])], '', { 'aria-label': t('person.branch') });
  const fr = select([['', t('people.allRoles')], ...ROLES.map(r => [r, roleLabel(r)])], '', { 'aria-label': t('person.role') });
  const listBox = h('div', { class: 'list' });
  const draw = () => {
    const k = q.value.trim().toLowerCase();
    const rows = people.filter(p => (!k || [p.name, p.code, p.email, p.position].join(' ').toLowerCase().includes(k)) && (!fb.value || p.branchId === fb.value) && (!fr.value || p.role === fr.value));
    clear(listBox).append(h('div', { class: 'meta' }, t('people.count', { n: rows.length })), rows.slice(0, 300).map(p => h('div', { class: 'list-row' + (p.active ? '' : ' inactive') },
      h('div', { class: 'avatar', 'aria-hidden': 'true' }, (p.name || '?').slice(0, 1).toUpperCase()),
      h('div', { class: 'grow' }, h('strong', null, p.name), h('div', { class: 'meta' }, [p.code, roleLabel(p.role), branchName(p.branchId), p.teamId ? teamName(p.teamId) : null].filter(Boolean).join(' · '))),
      p.active ? null : badge(t('status.inactive'), 'muted'),
      p.canManage ? btn(t('edit'), () => personModal(p), 'btn-ghost btn-sm') : null)));
  };
  q.oninput = draw; fb.onchange = draw; fr.onchange = draw;
  m.append(pageHead(t('people.title'), t('people.lead'), has('people.manage') ? btn([icon('plus'), t('people.add')], () => personModal(null)) : null, has('people.manage') ? btn(t('people.import'), () => go('/import'), 'btn-ghost') : null),
    h('div', { class: 'filters' }, q, fb, fr), listBox);
  draw();
}
async function personModal(p) {
  const isNew = !p; p = p || { role: 'staff', active: true };
  const name = input({ value: p.name || '', required: true, maxlength: 120 });
  const code = input({ value: p.code || '', maxlength: 40 });
  const email = input({ type: 'email', value: p.email || '' });
  const roles = ROLES.filter(r => r === p.role || canGiveRole({ ...S.me, active: true }, r));
  const role = select(roles.map(r => [r, roleLabel(r)]), p.role);
  const branch = select([['', '—'], ...S.org.branches.filter(b => b.active || b.id === p.branchId).map(b => [b.id, b.name])], p.branchId || '');
  const team = select([['', '—'], ...S.org.teams.filter(b => b.active || b.id === p.teamId).map(b => [b.id, b.name])], p.teamId || '');
  const position = input({ value: p.position || '', maxlength: 80 });
  const lng = select([['', t('person.langDefault')], ...LANGS.map(([c]) => [c, t('lang.' + c)])], p.lang || '');
  const active = h('input', { type: 'checkbox', checked: p.active !== false });
  const pw = input({ type: 'password', autocomplete: 'new-password', minlength: 8 });
  const must = h('input', { type: 'checkbox', checked: true });
  const reason = input({ maxlength: 500 });
  // Area Manager permissions (Admin only)
  const areaBox = h('div', { class: 'area-box' });
  let courses = [];
  const drawArea = async () => {
    clear(areaBox);
    if (role.value !== 'area' || S.me.role !== 'admin') return;
    if (!courses.length) { try { courses = await call('courses.list'); } catch { courses = []; } }
    const sc = p.scope || {};
    const checks = (name, items, chosen) => h('fieldset', { class: 'checks' }, h('legend', null, name), items.map(([v, l]) => h('label', null, h('input', { type: 'checkbox', value: v, checked: (chosen || []).includes(v) }), l)));
    areaBox.append(h('h3', null, t('area.title')), h('p', { class: 'hint' }, t('area.lead')),
      checks(t('area.perms'), AREA_PERMS.map(x => [x, t('perm.' + x)]), p.perms), checks(t('area.branches'), S.org.branches.map(b => [b.id, b.name]), sc.branches),
      checks(t('area.teams'), S.org.teams.map(b => [b.id, b.name]), sc.teams), checks(t('area.courses'), courses.map(c => [c.id, c.title]), sc.courses));
  };
  role.onchange = drawArea; drawArea();
  const getChecks = i => [...areaBox.querySelectorAll('fieldset')[i]?.querySelectorAll('input:checked') || []].map(x => x.value);
  const body = h('div', { class: 'form-grid' }, field(t('person.name'), name), field(t('person.code'), code), field(t('person.email'), email),
    field(t('person.role'), role), field(t('person.branch'), branch), field(t('person.team'), team), field(t('person.position'), position), field(t('person.lang'), lng),
    h('label', { class: 'check' }, active, t('person.active')),
    isNew ? [field(t('person.tempPassword'), pw, t('password.rule')), h('label', { class: 'check' }, must, t('person.mustChange'))] : field(t('reason'), reason, t('reason.hint')),
    areaBox);
  const buttons = [{ label: t('cancel'), value: null }];
  if (!isNew) buttons.push({ label: t('person.resetPw'), value: 'reset', cls: 'btn-ghost' });
  buttons.push({ label: t('save'), submit: true, value: 'saved' });
  const r = await modal(isNew ? t('people.add') : t('people.edit'), body, buttons, { wide: true, onSubmit: async () => {
    try {
      await call('people.save', { id: p.id, name: name.value, code: code.value, email: email.value, role: role.value, branchId: branch.value, teamId: team.value, position: position.value, lang: lng.value, active: active.checked,
        password: isNew ? pw.value : undefined, mustChange: must.checked, reason: reason.value,
        perms: role.value === 'area' ? getChecks(0) : undefined, scope: role.value === 'area' ? { branches: getChecks(1), teams: getChecks(2), courses: getChecks(3) } : undefined });
      toast(t('saved')); return 'saved';
    } catch (e) { showError(e); return false; }
  } });
  if (r === 'reset') return resetPwModal(p);
  if (r === 'saved') render();
}
async function resetPwModal(p) {
  const pw = input({ type: 'password', required: true, minlength: 8, autocomplete: 'new-password' });
  const must = h('input', { type: 'checkbox', checked: true });
  await modal(t('person.resetPw') + ' – ' + p.name, h('div', null, h('p', { class: 'hint' }, t('person.resetLead')), field(t('password.new'), pw, t('password.rule')), h('label', { class: 'check' }, must, t('person.mustChange'))),
    [{ label: t('cancel'), value: null }, { label: t('save'), submit: true }], { onSubmit: async () => {
      try { await call('people.resetPassword', { id: p.id, password: pw.value, mustChange: must.checked }); toast(t('person.resetDone')); return true; } catch (e) { showError(e); return false; }
    } });
}

async function importView(m) {
  const cols = ['code', 'name', 'email', 'branch', 'team', 'position', 'role'];
  const fileIn = h('input', { type: 'file', accept: '.csv,text/csv' });
  const out = h('div');
  let rows = [];
  fileIn.onchange = async () => {
    const f = fileIn.files[0]; if (!f) return;
    const data = parseCSV(await f.text());
    if (data.length < 2) return toast(t('import.emptyFile'), 'error');
    const head = data[0].map(x => x.trim().toLowerCase());
    rows = data.slice(1).map(r => Object.fromEntries(cols.map(c => [c, head.indexOf(c) >= 0 ? (r[head.indexOf(c)] || '').trim() : ''])));
    try { preview(await call('people.import', { rows, dryRun: true })); } catch (e) { showError(e); }
  };
  function preview(res) {
    const pw = input({ type: 'password', minlength: 8, required: true, autocomplete: 'new-password' });
    clear(out).append(h('div', { class: 'kpis small' }, kpi(t('import.ok'), res.summary.ok), kpi(t('import.dup'), res.summary.duplicate), kpi(t('import.err'), res.summary.error)),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, [t('import.line'), t('person.name'), t('person.code'), t('person.email'), t('person.branch'), t('person.team'), t('person.role'), t('import.status')].map(x => h('th', null, x)))),
        h('tbody', null, res.rows.map(r => h('tr', { class: 'st-' + r.status }, h('td', null, r.line), h('td', null, r.name), h('td', null, r.code), h('td', null, r.email), h('td', null, r.branch), h('td', null, r.team), h('td', null, roleLabel(r.role)),
          h('td', null, r.status === 'ok' ? badge(t('import.ok'), 'ok') : badge(t('importIssue.' + r.issue), r.status === 'duplicate' ? 'warn' : 'danger'))))))),
      res.summary.ok ? h('form', { class: 'card form', onsubmit: async ev => {
        ev.preventDefault();
        try { const r = await call('people.import', { rows, dryRun: false, password: pw.value }); toast(t('import.done', { n: r.created })); go('/people'); } catch (e) { showError(e); }
      } }, field(t('import.tempPw'), pw, t('import.tempPwHint')), h('button', { type: 'submit', class: 'btn btn-primary' }, t('import.go', { n: res.summary.ok }))) : null);
  }
  m.append(h('a', { href: '#/people', class: 'back' }, icon('prev'), t('nav.people')), pageHead(t('import.title'), t('import.lead')),
    h('div', { class: 'card form' }, h('ol', { class: 'howto' }, h('li', null, t('import.step1')), h('li', null, t('import.step2')), h('li', null, t('import.step3'))),
      h('div', { class: 'actions' }, btn([icon('download'), t('import.template')], () => download('people-template.csv', toCSV([cols, ['1001', 'Example Name', '', S.org.branches[0]?.name || 'B01 - HITTIN', S.org.teams[0]?.name || 'Kitchen', 'Kitchen Cook', 'staff']])), 'btn-ghost')),
      field(t('import.file'), fileIn)), out);
}
const kpi = (label, value, hint) => h('div', { class: 'kpi' }, h('div', { class: 'kpi-v' }, value ?? '—'), h('div', { class: 'kpi-l' }, label), hint ? h('div', { class: 'kpi-h' }, hint) : null);

// ------------------------------------------------------------------ branches & teams
async function orgView(m) {
  S.org = await call('org.list');
  const section = (kind, items) => h('section', { class: 'card' },
    h('div', { class: 'row-between' }, h('h2', null, t('org.' + kind)), btn([icon('plus'), t('add')], () => orgModal(kind, null), 'btn-primary btn-sm')),
    items.length ? h('div', { class: 'list' }, items.map(x => h('div', { class: 'list-row' + (x.active ? '' : ' inactive') },
      h('div', { class: 'grow' }, h('strong', null, x.name), h('div', { class: 'meta' }, [x.code, x.city].filter(Boolean).join(' · '))),
      x.active ? null : badge(t('status.inactive'), 'muted'), btn(t('edit'), () => orgModal(kind, x), 'btn-ghost btn-sm')))) : empty(t('org.none')));
  m.append(pageHead(t('org.title'), t('org.lead')), h('div', { class: 'grid two' }, section('branches', S.org.branches), section('teams', S.org.teams)));
}
async function orgModal(kind, x) {
  x = x || { active: true };
  const name = input({ value: x.name || '', required: true, maxlength: 120 });
  const code = input({ value: x.code || '', maxlength: 20 });
  const city = input({ value: x.city || '', maxlength: 80 });
  const active = h('input', { type: 'checkbox', checked: x.active !== false });
  await modal(x.id ? t('edit') : t('add'), h('div', null, field(t('org.name'), name), field(t('org.code'), code), kind === 'branches' ? field(t('org.city'), city) : null, h('label', { class: 'check' }, active, t('person.active'))),
    [{ label: t('cancel'), value: null }, { label: t('save'), submit: true }], { onSubmit: async () => {
      try { await call(kind === 'branches' ? 'org.saveBranch' : 'org.saveTeam', { id: x.id, name: name.value, code: code.value, city: city.value, active: active.checked }); toast(t('saved')); render(); return true; } catch (e) { showError(e); return false; }
    } });
}

// ------------------------------------------------------------------ courses (manager)
async function coursesView(m) {
  const list = await call('courses.list');
  m.append(pageHead(t('courses.title'), t('courses.lead'), S.me.role !== 'area' ? btn([icon('plus'), t('courses.new')], newCourse) : null));
  if (!list.length) return m.append(empty(t('courses.none')));
  m.append(h('div', { class: 'list' }, list.map(c => h('a', { class: 'list-row', href: '#/edit/' + c.id }, icon('book'),
    h('div', { class: 'grow' }, h('strong', null, c.title), h('div', { class: 'meta' }, t('courses.counts', { s: c.sectionCount, c: c.cardCount, q: c.finalCount }), c.version ? ` · v${c.version}` : '')),
    badge(t('cstatus.' + c.status) + (c.status === 'published' && c.dirty ? ' *' : ''), c.status === 'published' ? 'ok' : c.status === 'archived' ? 'muted' : 'warn')))));
}
async function newCourse() {
  const title = input({ required: true, maxlength: 160 });
  const r = await modal(t('courses.new'), field(t('course.titleField'), title), [{ label: t('cancel'), value: null }, { label: t('create'), submit: true }], { onSubmit: async () => {
    try { return await call('courses.save', { title: title.value }); } catch (e) { showError(e); return false; }
  } });
  if (r?.id) go('/edit/' + r.id);
}

async function courseEditView(m, id) {
  const d = await call('courses.get', { id }); const c = d.course;
  const reload = () => render();
  // --- header & publish
  const publish = async () => {
    const retrain = h('input', { type: 'checkbox' });
    const r = await modal(t('edit.publish'), h('div', null, h('p', null, t('edit.publishQ')), c.status === 'published' ? h('label', { class: 'check' }, retrain, t('edit.retrain')) : null),
      [{ label: t('cancel'), value: null }, { label: t('edit.publish'), submit: true, value: true }]);
    if (!r) return;
    try { await call('courses.publish', { id, requireRetrain: retrain.checked }); toast(t('edit.published')); reload(); } catch (e) { showError(e); }
  };
  m.append(h('a', { href: '#/courses', class: 'back' }, icon('prev'), t('nav.courses')),
    pageHead(c.title, `${t('cstatus.' + c.status)}${c.version ? ' · v' + c.version : ''}${c.dirty && c.status === 'published' ? ' · ' + t('edit.unpublished') : ''}`,
      btn(t('edit.publish'), publish, 'btn-accent'), c.status !== 'archived' ? btn(t('edit.archive'), async () => { if (await confirmBox(t('edit.archive'), t('edit.archiveQ'), t('edit.archive'), true)) { await call('courses.archive', { id }); reload(); } }, 'btn-ghost')
        : btn(t('edit.restore'), async () => { await call('courses.archive', { id, restore: true }); reload(); }, 'btn-ghost')));

  // --- settings
  const f = {
    title: input({ value: c.title, required: true, maxlength: 160 }), description: h('textarea', { rows: 2, maxlength: 2000 }, c.description || ''),
    passMark: input({ type: 'number', min: 1, max: 100, value: c.passMark }), timeLimitMin: input({ type: 'number', min: 0, max: 240, value: c.timeLimitMin }),
    attemptLimit: input({ type: 'number', min: 0, max: 20, value: c.attemptLimit }), retakeHours: input({ type: 'number', min: 0, max: 720, value: c.retakeHours }),
    dueDays: input({ type: 'number', min: 0, max: 365, value: c.dueDays }), shuffle: h('input', { type: 'checkbox', checked: c.shuffle }), review: h('input', { type: 'checkbox', checked: c.review })
  };
  const saveSettings = async ev => {
    ev.preventDefault();
    try { await call('courses.save', { ...c, title: f.title.value, description: f.description.value, passMark: f.passMark.value, timeLimitMin: f.timeLimitMin.value, attemptLimit: f.attemptLimit.value, retakeHours: f.retakeHours.value, dueDays: f.dueDays.value, shuffle: f.shuffle.checked, review: f.review.checked, finalQuiz: undefined }); toast(t('saved')); reload(); } catch (e) { showError(e); }
  };
  m.append(h('details', { class: 'card panel' }, h('summary', null, h('h2', null, t('edit.settings'))),
    h('form', { class: 'form-grid', onsubmit: saveSettings }, field(t('course.titleField'), f.title), field(t('edit.description'), f.description),
      field(t('edit.passMark'), f.passMark), field(t('edit.timeLimit'), f.timeLimitMin, t('edit.zeroNone')), field(t('edit.attempts'), f.attemptLimit, t('edit.zeroNone')),
      field(t('edit.retake'), f.retakeHours, t('edit.zeroNone')), field(t('edit.dueDays'), f.dueDays),
      h('label', { class: 'check' }, f.shuffle, t('edit.shuffle')), h('label', { class: 'check' }, f.review, t('edit.review')),
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, t('save'))))));

  // --- sections & cards
  const secWrap = h('section', { class: 'sections' });
  m.append(h('div', { class: 'row-between' }, h('h2', null, t('edit.content')), btn([icon('plus'), t('edit.addSection')], () => sectionModal(null), 'btn-primary btn-sm')), secWrap);
  if (!d.sections.length) secWrap.append(empty(t('edit.noSections')));
  d.sections.forEach((s, i) => {
    const cards = d.cards.filter(x => x.sectionId === s.id);
    const move = async dir => { const ids = d.sections.map(x => x.id); const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; await call('sections.reorder', { courseId: id, ids }); reload(); };
    const moveCard = async (k, dir) => { const ids = cards.map(x => x.id); const j = k + dir; if (j < 0 || j >= ids.length) return; [ids[k], ids[j]] = [ids[j], ids[k]]; await call('cards.reorder', { sectionId: s.id, ids }); reload(); };
    secWrap.append(h('div', { class: 'card section-edit' },
      h('div', { class: 'row-between' }, h('h3', null, `${i + 1}. ${s.title}`), h('div', { class: 'icon-row' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('moveUp'), onclick: () => move(-1), disabled: i === 0 }, icon('up')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('moveDown'), onclick: () => move(1), disabled: i === d.sections.length - 1 }, icon('down')))),
      h('div', { class: 'meta' }, t('edit.sectionCounts', { c: cards.length, q: (s.quiz?.questions || []).length })),
      cards.length ? h('ol', { class: 'card-edit-list' }, cards.map((cd, k) => h('li', null,
        h('span', { class: 'grow' }, cd.title, cd.rev > 1 ? h('small', { class: 'muted' }, ` · ${t('edit.rev', { n: cd.rev })}`) : null),
        h('div', { class: 'icon-row' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('moveUp'), disabled: k === 0, onclick: () => moveCard(k, -1) }, icon('up')),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('moveDown'), disabled: k === cards.length - 1, onclick: () => moveCard(k, 1) }, icon('down')),
          btn(t('edit.preview'), () => previewCard(cd), 'btn-ghost btn-sm'),
          btn(t('edit.rename'), async () => { const v = input({ value: cd.title, required: true }); const r = await modal(t('edit.rename'), field(t('course.titleField'), v), [{ label: t('cancel'), value: null }, { label: t('save'), submit: true, value: true }]); if (r) { try { await call('cards.update', { id: cd.id, title: v.value }); reload(); } catch (e) { showError(e); } } }, 'btn-ghost btn-sm'),
          btn(t('edit.replace'), () => pickFiles(false, async ([file]) => { try { const prep = await call('cards.prepareUpload', { courseId: id, size: file.size, type: file.type }); await upload(prep.target, file); await call('cards.update', { id: cd.id, key: prep.key }); toast(t('edit.replaced')); reload(); } catch (e) { showError(e); } }), 'btn-ghost btn-sm'),
          btn(t('remove'), async () => { if (await confirmBox(t('remove'), t('edit.removeCardQ', { n: cd.title }), t('remove'), true)) { try { await call('cards.delete', { id: cd.id }); reload(); } catch (e) { showError(e); } } }, 'btn-ghost btn-sm danger-text'))))) : null,
      h('div', { class: 'actions' },
        btn([icon('file'), t('edit.uploadPdfs')], () => pickFiles(true, list => bulkUpload(s, list, cards.length)), 'btn-primary btn-sm'),
        btn(t('edit.quiz', { n: (s.quiz?.questions || []).length }), () => quizEditor(s.quiz?.questions || [], async qs => { await call('sections.save', { id: s.id, courseId: id, title: s.title, quiz: { questions: qs } }); }), 'btn-ghost btn-sm'),
        btn(t('edit.rename'), () => sectionModal(s), 'btn-ghost btn-sm'),
        !cards.length ? btn(t('remove'), async () => { if (await confirmBox(t('remove'), t('edit.removeSectionQ'), t('remove'), true)) { try { await call('sections.delete', { id: s.id }); reload(); } catch (e) { showError(e); } } }, 'btn-ghost btn-sm danger-text') : null)));
  });

  // --- final & skills
  const skills = h('textarea', { rows: 4 }, (c.skills || []).join('\n'));
  m.append(h('div', { class: 'grid two' },
    h('section', { class: 'card' }, h('h2', null, t('course.final')), h('p', { class: 'meta' }, t('edit.finalLead', { n: (c.finalQuiz?.questions || []).length })),
      btn(t('edit.quiz', { n: (c.finalQuiz?.questions || []).length }), () => quizEditor(c.finalQuiz?.questions || [], async qs => { await call('courses.save', { ...c, finalQuiz: { questions: qs } }); }), 'btn-primary btn-sm')),
    h('section', { class: 'card' }, h('h2', null, t('course.skills')), field(t('edit.skillsField'), skills, t('edit.skillsHint')),
      btn(t('save'), async () => { try { await call('courses.save', { ...c, finalQuiz: undefined, skills: skills.value.split('\n').map(x => x.trim()).filter(Boolean) }); toast(t('saved')); reload(); } catch (e) { showError(e); } }, 'btn-primary btn-sm'))));

  async function sectionModal(s) {
    const title = input({ value: s?.title || '', required: true, maxlength: 160 });
    await modal(s ? t('edit.rename') : t('edit.addSection'), field(t('edit.sectionTitle'), title, t('edit.sectionHint')), [{ label: t('cancel'), value: null }, { label: t('save'), submit: true }], { onSubmit: async () => {
      try { await call('sections.save', { id: s?.id, courseId: id, title: title.value }); reload(); return true; } catch (e) { showError(e); return false; }
    } });
  }
  async function bulkUpload(section, files, existing) {
    const items = files.map(f => ({ file: f, ...parseCardName(f.name) }))
      .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.title.localeCompare(b.title));
    const bad = items.filter(x => x.file.type && x.file.type !== 'application/pdf' || x.file.size > 20 * 1048576);
    if (bad.length) return toast(t('edit.badFiles', { n: bad.map(x => x.file.name).join(', ') }), 'error');
    const inputs = items.map(x => input({ value: x.title, required: true, maxlength: 160 }));
    const body = h('div', null, h('p', { class: 'hint' }, t('edit.uploadLead')), h('ol', { class: 'upload-list' }, items.map((x, i) => h('li', null, h('span', { class: 'muted small' }, x.file.name), inputs[i]))));
    const ok = await modal(t('edit.uploadTitle', { n: items.length, s: section.title }), body, [{ label: t('cancel'), value: null }, { label: t('edit.uploadGo'), submit: true, value: true }], { wide: true });
    if (!ok) return;
    const prog = h('div', { class: 'toast toast-ok', role: 'status' });
    document.getElementById('toasts').append(prog);
    try {
      for (const [i, x] of items.entries()) {
        prog.textContent = t('edit.uploading', { a: i + 1, b: items.length });
        const prep = await call('cards.prepareUpload', { courseId: id, size: x.file.size, type: x.file.type || 'application/pdf' });
        await upload(prep.target, x.file);
        await call('cards.create', { sectionId: section.id, title: inputs[i].value, key: prep.key, order: existing + i + 1 });
      }
      toast(t('edit.uploaded', { n: items.length }));
    } catch (e) { showError(e); } finally { prog.remove(); reload(); }
  }
}
function pickFiles(multiple, cb) {
  const f = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple, style: { display: 'none' } });
  f.onchange = () => { const list = [...f.files]; f.remove(); if (list.length) cb(list); };
  document.body.append(f); f.click();
}
async function previewCard(cd) {
  const box = h('div', { class: 'pdf-stage small' }, h('div', { class: 'spinner' }));
  modal(cd.title, box, [{ label: t('close'), value: null }], { wide: true });
  try {
    const r = await call('cards.preview', { id: cd.id }); await loadScript(CDN.pdfjs);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
    const pdf = await window.pdfjsLib.getDocument({ url: r.url, isEvalSupported: false }).promise; const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: Math.min(2, 700 / page.getViewport({ scale: 1 }).width) * Math.min(devicePixelRatio || 1, 2) });
    const cv = h('canvas', { width: vp.width, height: vp.height, class: 'pdf-page' }); await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; clear(box).append(cv);
  } catch (e) { clear(box).append(h('p', null, errText(e))); }
}
async function quizEditor(questions, save) {
  let qs = JSON.parse(JSON.stringify(questions));
  const wrap = h('div', { class: 'q-editor' });
  const draw = () => {
    clear(wrap);
    qs.forEach((q, i) => {
      const type = select([['mc', t('qe.mc')], ['tf', t('qe.tf')]], q.type);
      const text = h('textarea', { rows: 2, required: true, maxlength: 1000 }, q.text || '');
      const opts = h('textarea', { rows: 4, maxlength: 2000 }, (q.type === 'tf' ? [] : q.options || []).join('\n'));
      const ans = select([], q.answer);
      const refreshAns = () => {
        const o = type.value === 'tf' ? [t('quiz.true'), t('quiz.false')] : opts.value.split('\n').map(x => x.trim()).filter(Boolean);
        const cur = Number(ans.value || q.answer || 0); clear(ans).append(...o.map((x, k) => h('option', { value: k, selected: k === cur }, x)));
      };
      const sync = () => { q.type = type.value; q.text = text.value; q.options = type.value === 'tf' ? ['true', 'false'] : opts.value.split('\n').map(x => x.trim()).filter(Boolean); q.answer = Number(ans.value || 0); };
      type.onchange = () => { optsField.hidden = type.value === 'tf'; refreshAns(); sync(); };
      opts.oninput = () => { refreshAns(); sync(); }; text.oninput = sync; ans.onchange = sync;
      const optsField = field(t('qe.options'), opts, t('qe.optionsHint')); optsField.hidden = q.type === 'tf';
      refreshAns();
      wrap.append(h('div', { class: 'card q-edit' }, h('div', { class: 'row-between' }, h('strong', null, t('qe.question', { n: i + 1 })), h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('remove'), onclick: () => { qs.splice(i, 1); draw(); } }, icon('x'))),
        field(t('qe.type'), type), field(t('qe.text'), text), optsField, field(t('qe.answer'), ans)));
    });
    wrap.append(h('div', { class: 'actions' },
      btn([icon('plus'), t('qe.add')], () => { qs.push({ type: 'mc', text: '', options: [], answer: 0 }); draw(); }, 'btn-ghost'),
      btn(t('qe.paste'), pasteQuestions, 'btn-ghost')));
  };
  const pasteQuestions = async () => {
    const area = h('textarea', { rows: 12, dir: 'auto', placeholder: 'Q: Question text\n- wrong answer\n* correct answer\n- wrong answer' });
    const box = h('div', null, h('p', { class: 'muted' }, t('qe.pasteHint')), area);
    let added = 0;
    await modal(t('qe.paste'), box, [{ label: t('cancel'), value: null }, { label: t('qe.paste'), submit: true }], { onSubmit: () => {
      const r = parseQuizText(area.value);
      if (!r.length) { toast(t('qe.pasteNone'), 'error'); return false; }
      qs.push(...r); added = r.length; return true;
    } });
    if (added) { draw(); toast(t('qe.pasted', { n: added })); }
  };
  qs = qs.map(q => ({ ...q })); draw();
  await modal(t('qe.title'), wrap, [{ label: t('cancel'), value: null }, { label: t('save'), submit: true }], { wide: true, onSubmit: async () => {
    try { await save(qs); toast(t('saved')); render(); return true; } catch (e) { showError(e); return false; }
  } });
}

// ------------------------------------------------------------------ assignments
async function assignView(m) {
  const [courses, list] = await Promise.all([call('courses.list'), call('assign.list')]);
  let people = [];
  if (has('people.view')) { try { people = await call('people.list'); } catch { /* ignore */ } }
  const published = courses.filter(c => c.status === 'published');
  const course = select(published.map(c => [c.id, c.title]), published[0]?.id);
  const types = [['branch', t('assign.branch')], ['team', t('assign.team')], ...(people.length ? [['user', t('assign.user')]] : []), ...(S.me.role !== 'area' ? [['role', t('assign.role')], ['all', t('assign.all')]] : [])];
  const type = select(types, 'branch');
  const target = select([]);
  const due = input({ type: 'date' });
  const setDue = () => { const c = published.find(x => x.id === course.value); const dd = new Date(Date.now() + (c?.dueDays || 14) * 864e5); due.value = dd.toISOString().slice(0, 10); };
  const fillTarget = () => {
    const opts = type.value === 'branch' ? S.org.branches.filter(b => b.active).map(b => [b.id, b.name]) : type.value === 'team' ? S.org.teams.filter(b => b.active).map(b => [b.id, b.name])
      : type.value === 'user' ? people.filter(p => p.active).map(p => [p.id, `${p.name}${p.code ? ' (' + p.code + ')' : ''}`]) : type.value === 'role' ? ROLES.map(r => [r, roleLabel(r)]) : [['', t('assign.all')]];
    clear(target).append(...opts.map(([v, l]) => h('option', { value: v }, l))); target.disabled = type.value === 'all';
  };
  type.onchange = fillTarget; course.onchange = setDue; fillTarget(); setDue();
  m.append(pageHead(t('assign.title'), t('assign.lead')));
  if (!published.length) m.append(empty(t('assign.noCourses')));
  else m.append(h('form', { class: 'card form-grid', onsubmit: async ev => {
    ev.preventDefault();
    try { await call('assign.create', { courseId: course.value, targetType: type.value, targetId: target.value, targetLabel: type.value === 'all' ? t('assign.all') : target.selectedOptions[0]?.textContent, due: due.value }); toast(t('assign.done')); render(); } catch (e) { showError(e); }
  } }, field(t('assign.course'), course), field(t('assign.to'), type), field(t('assign.who'), target), field(t('assign.due'), due), h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, t('assign.go')))));
  m.append(h('h2', null, t('assign.current')), list.length ? h('div', { class: 'list' }, list.map(a => h('div', { class: 'list-row' },
    h('div', { class: 'grow' }, h('strong', null, a.courseTitle), h('div', { class: 'meta' }, t('assign.' + a.targetType), ': ', a.targetLabel || '—', ' · ', t('home.due', { date: fmtDate(a.due) }))),
    btn(t('remove'), async () => { if (await confirmBox(t('remove'), t('assign.removeQ'), t('remove'), true)) { await call('assign.delete', { id: a.id }); render(); } }, 'btn-ghost btn-sm')))) : empty(t('assign.none')));
}

// ------------------------------------------------------------------ practical sign-offs
async function signoffView(m) {
  const rows = await call('signoff.list');
  m.append(pageHead(t('signoff.title'), t('signoff.lead')));
  if (!rows.length) return m.append(empty(t('signoff.none')));
  const q = input({ type: 'search', placeholder: t('people.search'), 'aria-label': t('people.search') });
  const box = h('div', { class: 'list' });
  const draw = () => {
    const k = q.value.trim().toLowerCase();
    clear(box).append(rows.filter(r => !k || (r.name + r.courseTitle).toLowerCase().includes(k)).slice(0, 200).map(r => h('div', { class: 'card signoff' },
      h('div', { class: 'row-between' }, h('strong', null, r.name), h('span', { class: 'meta' }, r.courseTitle, ' · ', branchName(r.branchId))),
      r.skills.map(s => {
        const st = select(['passed', 'practice', 'none'].map(x => [x, t('signoff.' + x)]), s.status);
        const notes = input({ value: s.notes, placeholder: t('signoff.notes'), maxlength: 1000, 'aria-label': t('signoff.notes') });
        return h('div', { class: 'skill-row' }, h('span', { class: 'grow' }, s.skill, s.at ? h('small', { class: 'muted' }, ' · ' + fmtDate(s.at)) : null), st, notes,
          btn(t('save'), async () => { try { const res = await call('signoff.save', { uid: r.uid, courseId: r.courseId, skill: s.skill, status: st.value, notes: notes.value }); toast(res.cert ? t('signoff.certIssued') : t('saved')); } catch (e) { showError(e); } }, 'btn-primary btn-sm'));
      }))));
  };
  q.oninput = draw; m.append(h('div', { class: 'filters' }, q), box); draw();
}

// ------------------------------------------------------------------ dashboard
async function dashboardView(m, courseId = '', branchId = '', teamId = '') {
  const courses = await call('courses.list');
  const d = await call('reports.dashboard', { courseId, branchId, teamId });
  const fc = select([['', t('dash.allCourses')], ...courses.filter(c => c.status === 'published').map(c => [c.id, c.title])], courseId, { 'aria-label': t('assign.course') });
  const fb = select([['', t('people.allBranches')], ...S.org.branches.map(b => [b.id, b.name])], branchId, { 'aria-label': t('person.branch') });
  const ft = select([['', t('dash.allTeams')], ...S.org.teams.map(b => [b.id, b.name])], teamId, { 'aria-label': t('person.team') });
  const apply = () => go(`/dashboard/${fc.value}/${fb.value}/${ft.value}`.replace(/\/+$/, ''));
  fc.onchange = fb.onchange = ft.onchange = apply;
  const k = d.kpis;
  const exportCsv = () => download(`training-report-${new Date().toISOString().slice(0, 10)}.csv`, toCSV([
    [t('person.name'), t('person.code'), t('person.branch'), t('person.team'), t('assign.course'), t('dash.progress'), t('dash.status'), t('dash.avgScore'), t('dash.fails'), t('assign.due'), t('dash.signals')],
    ...d.rows.map(r => [r.name, r.code, branchName(r.branchId), teamName(r.teamId), r.courseTitle, r.percent + '%', r.complete ? t('status.complete') : r.overdue ? t('status.overdue') : t('status.inProgress'), r.avgScore ?? '', r.fails, fmtDate(r.due), r.signals.map(s => t('signal.' + s)).join(' / ')])]));
  m.append(pageHead(t('dash.title'), t('dash.lead'), btn([icon('download'), t('dash.csv')], exportCsv, 'btn-ghost'), btn(t('dash.pdf'), () => window.print(), 'btn-ghost')),
    h('div', { class: 'filters no-print' }, fc, fb, ft),
    h('div', { class: 'kpis' }, kpi(t('dash.completion'), pct(k.completion), t('dash.ofAssign', { n: k.assignments })), kpi(t('dash.overdue'), k.overdue), kpi(t('dash.avgScore'), pct(k.avgScore)),
      kpi(t('dash.passRate'), pct(k.passRate)), kpi(t('dash.firstTry'), pct(k.firstTryPass)), kpi(t('dash.retakes'), k.retakes), kpi(t('dash.median'), k.medianDays == null ? '—' : t('dash.days', { n: k.medianDays })), kpi(t('dash.signoff'), pct(k.signoff))));
  if (!d.rows.length) return m.append(empty(t('dash.empty')));
  m.append(h('h2', null, t('dash.byCourse')), h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, [t('assign.course'), t('dash.assigned'), t('dash.completion'), t('dash.overdue')].map(x => h('th', null, x)))),
    h('tbody', null, d.byCourse.map(c => h('tr', null, h('td', null, c.title), h('td', null, c.assigned), h('td', null, h('div', { class: 'bar-cell' }, progressBar(c.completion), pct(c.completion))), h('td', null, c.overdue)))))));
  m.append(h('h2', null, t('dash.support')), h('p', { class: 'meta' }, t('dash.supportLead')),
    d.support.length ? h('div', { class: 'list' }, d.support.map(r => h('div', { class: 'list-row' }, h('div', { class: 'grow' }, h('strong', null, r.name), h('div', { class: 'meta' }, r.courseTitle, ' · ', branchName(r.branchId))),
      h('div', { class: 'chips' }, r.signals.map(s => badge(t('signal.' + s), 'warn')))))) : h('p', { class: 'muted' }, t('dash.supportNone')));
  m.append(h('h2', null, t('dash.people')), h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, [t('person.name'), t('person.branch'), t('assign.course'), t('dash.progress'), t('dash.avgScore'), t('dash.status')].map(x => h('th', null, x)))),
    h('tbody', null, d.rows.slice(0, 500).map(r => h('tr', null, h('td', null, r.name), h('td', null, branchName(r.branchId)), h('td', null, r.courseTitle), h('td', null, h('div', { class: 'bar-cell' }, progressBar(r.percent), r.percent + '%')), h('td', null, pct(r.avgScore)),
      h('td', null, r.complete ? badge(t('status.complete'), 'ok') : r.overdue ? badge(t('status.overdue'), 'danger') : badge(t('status.inProgress'), 'muted'))))))));
}

// ------------------------------------------------------------------ settings / audit / profile / help
async function settingsView(m) {
  const s = await call('settings.get');
  const form = (sec, fields) => {
    const els = Object.fromEntries(fields.map(([k, type, extra]) => [k, type === 'textarea' ? h('textarea', { rows: 3 }, s[sec][k] ?? '') : type === 'lang' ? select(LANGS.map(([c]) => [c, t('lang.' + c)]), s[sec][k]) : input({ type, value: s[sec][k] ?? '', ...(extra || {}) })]));
    const reason = input({ maxlength: 500 });
    return h('form', { class: 'card form-grid', onsubmit: async ev => {
      ev.preventDefault();
      try { await call('settings.save', { section: sec, values: Object.fromEntries(Object.entries(els).map(([k, e]) => [k, e.value])), reason: reason.value }); toast(t('saved')); render(); } catch (e) { showError(e); }
    } }, h('h2', { class: 'span-all' }, t('settings.' + sec)), fields.map(([k]) => field(t(`set.${sec}.${k}`), els[k])), field(t('reason'), reason, t('reason.hint')),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, t('save'))));
  };
  m.append(pageHead(t('settings.title'), t('settings.lead')));
  if (has('settings.training')) m.append(
    form('training', [['cardSeconds', 'number', { min: 0, max: 120 }], ['dueDays', 'number', { min: 1, max: 365 }], ['passMark', 'number', { min: 1, max: 100 }], ['certTitle', 'text'], ['certText', 'text']]),
    form('kpi', [['lowScore', 'number', { min: 0, max: 100 }], ['maxFails', 'number', { min: 1, max: 20 }], ['inactiveDays', 'number', { min: 1, max: 90 }], ['dueSoonDays', 'number', { min: 1, max: 30 }]]));
  if (has('settings.system')) m.append(form('system', [['businessName', 'text'], ['certPrefix', 'text', { maxlength: 8 }], ['defaultLang', 'lang'], ['retentionMonths', 'number', { min: 6, max: 120 }], ['privacyNotice', 'textarea']]));
}
async function auditView(m) {
  const q = input({ type: 'search', placeholder: t('audit.search'), 'aria-label': t('audit.search') });
  const box = h('div', { class: 'list' });
  const load = async () => {
    const rows = await call('audit.list', { q: q.value, limit: 300 });
    clear(box).append(rows.length ? rows.map(a => h('details', { class: 'list-row audit' }, h('summary', null, h('span', { class: 'grow' }, h('strong', null, a.action), ' · ', a.target, h('div', { class: 'meta' }, fmtDate(a.at, true), ' · ', a.actorName, a.reason ? ' · ' + a.reason : ''))),
      h('div', { class: 'grid two' }, h('div', null, h('h4', null, t('audit.before')), h('pre', null, JSON.stringify(a.before, null, 1))), h('div', null, h('h4', null, t('audit.after')), h('pre', null, JSON.stringify(a.after, null, 1))))))
      : empty(t('audit.none')));
  };
  let deb; q.oninput = () => { clearTimeout(deb); deb = setTimeout(load, 300); };
  m.append(pageHead(t('audit.title'), t('audit.lead')), h('div', { class: 'filters' }, q), box); await load();
}
async function profileView(m) {
  const me = S.me;
  m.append(pageHead(me.name, `${roleLabel(me.role)}${me.branchId ? ' · ' + branchName(me.branchId) : ''}`),
    h('div', { class: 'grid two' },
      h('section', null, h('h2', null, t('password.change')), changePasswordView(null, false)),
      h('section', { class: 'card' }, h('h2', null, t('profile.account')),
        h('dl', null, h('dt', null, t('person.code')), h('dd', null, me.code || '—'), h('dt', null, t('person.email')), h('dd', null, me.email || '—')),
        h('div', { class: 'actions' }, btn(t('signout'), signOut, 'btn-ghost'), btn(t('profile.signoutAll'), async () => { if (await confirmBox(t('profile.signoutAll'), t('profile.signoutAllQ'), t('profile.signoutAll'))) { await call('auth.logoutAll'); signOut(); } }, 'btn-ghost')),
        has('backup.export') ? h('div', { class: 'backup' }, h('h3', null, t('backup.title')), h('p', { class: 'hint' }, t('backup.lead')),
          btn([icon('download'), t('backup.go')], async () => { try { const data = await call('backup.export'); download(`shrimpshack-academy-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), 'application/json'); } catch (e) { showError(e); } }, 'btn-primary')) : null,
        MODE === 'trial' ? h('div', { class: 'backup' }, h('h3', null, t('trial.reset')), h('p', { class: 'hint' }, t('trial.resetLead')),
          btn(t('trial.reset'), async () => { if (await confirmBox(t('trial.reset'), t('trial.resetQ'), t('trial.reset'), true)) { await resetTrial(); location.hash = '#/setup'; location.reload(); } }, 'btn-danger')) : null)));
}
function helpView(m) {
  m.append(pageHead(t('help.title'), t('help.lead')), h('div', { class: 'faq' }, [1, 2, 3, 4, 5, 6, 7].map(i => h('details', { class: 'card' }, h('summary', null, t(`faq.q${i}`)), h('p', null, t(`faq.a${i}`))))));
}

boot();
