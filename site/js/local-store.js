// Trial-copy storage: everything stays in this browser (IndexedDB). Nothing is sent anywhere.
const DB = 'shrimpshack-academy-trial';

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('docs'); r.result.createObjectStore('files'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
let dbp;
const db = () => (dbp ||= open());
function tx(storeName, mode, fn) {
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction(storeName, mode); const s = t.objectStore(storeName);
    let out; Promise.resolve(fn(s, v => { out = v; })).catch(rej);
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

export function idbStore() {
  const all = coll => tx('docs', 'readonly', async (s, set) => set(await req(s.getAll(IDBKeyRange.bound(coll + '/', coll + '/￿')))));
  return {
    get: (coll, id) => tx('docs', 'readonly', async (s, set) => set(clone(await req(s.get(coll + '/' + id))) || null)),
    all: async coll => clone(await all(coll)) || [],
    find: async (coll, where) => (clone(await all(coll)) || []).filter(d => Object.entries(where).every(([k, v]) => d[k] === v)),
    put: (coll, doc) => tx('docs', 'readwrite', s => { s.put(clone(doc), coll + '/' + doc.id); }),
    del: (coll, id) => tx('docs', 'readwrite', s => { s.delete(coll + '/' + id); })
  };
}

export function idbFiles() {
  const urls = new Map();
  return {
    uploadTarget: async key => ({ kind: 'local', key }),
    put: (key, blob) => tx('files', 'readwrite', s => { s.put(blob, key); }),
    readUrl: async key => {
      if (urls.has(key)) return urls.get(key);
      const blob = await tx('files', 'readonly', async (s, set) => set(await req(s.get(key))));
      if (!blob) throw new Error('missing file');
      const u = URL.createObjectURL(blob); urls.set(key, u); return u;
    },
    remove: key => tx('files', 'readwrite', s => { s.delete(key); })
  };
}

export async function wipeTrial() {
  try { (await db()).close(); } catch { /* ignore */ }
  dbp = null;
  await new Promise(res => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); });
}

// In-memory store used by the automated tests.
export function memoryStore() {
  const m = new Map();
  const all = coll => [...m.entries()].filter(([k]) => k.startsWith(coll + '/')).map(([, v]) => clone(v));
  return {
    get: async (coll, id) => clone(m.get(coll + '/' + id)) || null,
    all: async coll => all(coll),
    find: async (coll, where) => all(coll).filter(d => Object.entries(where).every(([k, v]) => d[k] === v)),
    put: async (coll, doc) => { m.set(coll + '/' + doc.id, clone(doc)); },
    del: async (coll, id) => { m.delete(coll + '/' + id); },
    _map: m
  };
}
export function memoryFiles() {
  const m = new Map();
  return { uploadTarget: async key => ({ kind: 'local', key }), put: async (k, b) => m.set(k, b), readUrl: async k => 'mem://' + k, remove: async k => m.delete(k) };
}
