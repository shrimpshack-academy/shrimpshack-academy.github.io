// Shrimp Shack Academy — live server (Supabase Edge Function "academy").
// tools/build-function.ps1 joins this file with site/js/core.js into supabase/functions/academy/index.ts,
// so the live server runs exactly the same rules as the trial copy and the automated tests.
//
// Settings it reads (Supabase → Edge Functions → Secrets). Typed by the owner in the dashboard, never in code:
//   SETUP_CODE      first-run / admin-recovery code (remove it after setup; add it back only to recover)
//   ALLOWED_ORIGIN  the website address, e.g. https://shrimpshack-academy.github.io (comma-separate several)
// Provided automatically by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (secret — stays on the server).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { createCore, requestCache } from '../site/js/core.js';

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
