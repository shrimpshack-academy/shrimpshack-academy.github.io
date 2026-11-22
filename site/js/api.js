// Talks to the server. Trial mode runs the same server core inside the browser.
import { createCore } from './core.js';
import { idbStore, idbFiles, wipeTrial } from './local-store.js';

const cfg = window.APP_CONFIG || {};
// On this computer (localhost) the site always runs as the trial copy, so previews never touch live data.
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const MODE = cfg.supabaseUrl && cfg.publishableKey && !LOCAL ? 'live' : 'trial';
export const TRIAL_SETUP_CODE = 'trial-setup';
const TOKEN_KEY = 'ssa.token';

const safeLS = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } }
};
export const getToken = () => safeLS.get(TOKEN_KEY);
export const setToken = t => safeLS.set(TOKEN_KEY, t);
export const prefs = safeLS;

let core, trialFiles;
function trialCore() {
  if (!core) {
    trialFiles = idbFiles();
    core = createCore({ store: idbStore(), files: trialFiles, env: { setupCode: TRIAL_SETUP_CODE, mode: 'trial' } });
  }
  return core;
}

export class ApiFailure extends Error {
  constructor(code, status, extra) { super(code); this.code = code; this.status = status; this.extra = extra || {}; }
}

export async function call(action, params = {}) {
  let r;
  if (MODE === 'trial') {
    r = await trialCore().handle(action, params, getToken());
  } else {
    let res;
    try {
      // forceFunctionRegion: run next to the database instead of the nearest edge (each DB read stays local)
      const region = cfg.functionRegion ? `?forceFunctionRegion=${encodeURIComponent(cfg.functionRegion)}` : '';
      res = await fetch(`${cfg.supabaseUrl.replace(/\/$/, '')}/functions/v1/${cfg.functionName || 'academy'}${region}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: cfg.publishableKey, ...(getToken() ? { 'x-session': getToken() } : {}) },
        body: JSON.stringify({ action, params })
      });
    } catch { throw new ApiFailure('network', 0); }
    try { r = await res.json(); } catch { throw new ApiFailure(res.status === 401 ? 'function_jwt' : 'server_error', res.status); }
    if (!('ok' in r)) throw new ApiFailure(res.status === 401 ? 'function_jwt' : 'server_error', res.status);
  }
  if (!r.ok) {
    if (r.error === 'unauthorized') setToken(null);
    throw new ApiFailure(r.error, r.status, r.extra);
  }
  return r.data;
}

// Upload a PDF to the place the server prepared.
export async function upload(target, file) {
  if (target.kind === 'local') { trialCore(); await trialFiles.put(target.key, file); return; }
  const res = await fetch(target.url, { method: 'PUT', headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' }, body: file });
  if (!res.ok) throw new ApiFailure('upload_failed', res.status);
}

export async function resetTrial() { if (MODE === 'trial') { core = null; setToken(null); await wipeTrial(); } }
