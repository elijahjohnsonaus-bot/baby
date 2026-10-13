import { getStore } from '@netlify/blobs';

const KEY = 'state.json';
const MAX_ATTEMPTS = 4;

const headers = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-pip-pass',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const reply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

function store() {
  return getStore({ name: 'pip-entries', consistency: 'strong' });
}

async function load(s) {
  const raw = await s.get(KEY, { type: 'json' });
  if (!raw || typeof raw !== 'object') return { entries: {}, seq: 0 };
  return { entries: raw.entries || {}, seq: raw.seq || 0 };
}

// An incoming entry wins only if it is strictly newer than what we hold.
// Entries are keyed by id, so a repeated send is a no-op rather than a duplicate.
function newer(incoming, existing) {
  if (!existing) return true;
  return (incoming.updated || 0) > (existing.updated || 0);
}

function sanitise(e) {
  if (!e || typeof e !== 'object') return null;
  if (typeof e.id !== 'string' || e.id.length < 6 || e.id.length > 64) return null;
  if (typeof e.type !== 'string' || e.type.length > 24) return null;
  const out = {};
  for (const [k, v] of Object.entries(e)) {
    if (k === 'srv') continue; // server owns this field
    if (typeof v === 'string' && v.length > 2000) out[k] = v.slice(0, 2000);
    else out[k] = v;
  }
  if (typeof out.updated !== 'number') out.updated = Date.now();
  return out;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers });

  const expected = process.env.APP_PASSCODE || '';
  if (expected && req.headers.get('x-pip-pass') !== expected) {
    return reply({ error: 'passcode' }, 401);
  }

  const s = store();

  if (req.method === 'GET') {
    const url = new URL(req.url);
    if (url.searchParams.get('health') !== null) return reply({ ok: true });
    const since = Number(url.searchParams.get('since') || 0);
    const state = await load(s);
    const entries = Object.values(state.entries).filter((e) => (e.srv || 0) > since);
    return reply({ seq: state.seq, entries, ack: [] });
  }

  if (req.method !== 'POST') return reply({ error: 'method' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'bad json' }, 400);
  }

  const since = Number(body.since || 0);
  const incoming = Array.isArray(body.entries)
    ? body.entries.map(sanitise).filter(Boolean).slice(0, 500)
    : [];

  let state;
  let ack = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    state = await load(s);
    let seq = state.seq;
    let changed = false;

    for (const entry of incoming) {
      if (newer(entry, state.entries[entry.id])) {
        state.entries[entry.id] = { ...entry, srv: ++seq };
        changed = true;
      }
    }

    if (changed) {
      state.seq = seq;
      await s.setJSON(KEY, state);
      // Read back: if a concurrent write clobbered us, retry. The client keeps
      // anything we don't acknowledge in its outbox, so nothing is lost either way.
      const check = await load(s);
      const landed = incoming.every((e) => {
        const held = check.entries[e.id];
        return held && (held.updated || 0) >= (e.updated || 0);
      });
      if (!landed && attempt < MAX_ATTEMPTS) continue;
      state = check;
    }

    ack = incoming
      .filter((e) => {
        const held = state.entries[e.id];
        return held && (held.updated || 0) >= (e.updated || 0);
      })
      .map((e) => e.id);
    break;
  }

  const entries = Object.values(state.entries).filter((e) => (e.srv || 0) > since);
  return reply({ seq: state.seq, entries, ack });
};

export const config = { path: '/api/sync' };
