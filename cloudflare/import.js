import sync from '../netlify/functions/sync.js';
import { html, send, oldSite, wantsPage, fetchOld, jsonOf, NOT_DATA } from './import-kit.js';

// One-off: brings the baby's entries across from the old Pip site on Netlify. It only reads from the old site and
// never changes anything there. It is safe to run again: an entry that is already here is only replaced by a newer copy.
//
// (If you now use the Baby page in the nursery app instead of Pip, the nursery app's own import covers this too.)
//
// It does nothing unless IMPORT_FROM is set in Cloudflare (Settings, Variables and secrets): the old site's address,
// then | and its passcode if it had one, like   https://old-pip.netlify.app|PASSCODE
// Then open  https://YOUR-SITE/api/import  (add ?key=PASSCODE if this site has a passcode). Delete IMPORT_FROM afterwards.

const CHUNK = 500;              // the most this site's sync takes in one go
const CHUNKS_PER_ROUND = 3;     // a free Worker may only make about 50 outside calls per visit

export default async (req) => {
  const url = new URL(req.url);
  const own = process.env.APP_PASSCODE || '';
  if (wantsPage(req, url)) return html('Moving Pip across');
  if (own && url.searchParams.get('key') !== own) return send({ error: 'passcode' }, 401);

  const src = oldSite();
  if (!src) return send({ error: 'not-configured', hint: 'Set IMPORT_FROM in Cloudflare first (see the README).' }, 404);

  const got = await fetchOld(src, '/api/sync?since=0', src.pass ? { 'x-pip-pass': src.pass } : {});
  if (got.problem) return send({ stalled: got.problem });
  if (got.missing) return send({ stalled: 'The old site has no Pip sync on it, so there is nothing to copy.' });
  const old = await jsonOf(got.res);
  if (old === undefined) return send({ stalled: NOT_DATA });
  if (!old || typeof old !== 'object' || !Array.isArray(old.entries)) return send({ stalled: 'What the old site sent did not look like Pip data, so nothing was copied.' });

  const entries = old.entries.filter((e) => e && typeof e.id === 'string' && typeof e.type === 'string');
  if (!entries.length) return send({ done: true, message: 'The old site had no entries yet, so there was nothing to copy.' });

  const from = Number(url.searchParams.get('from') || 0);
  const upto = Math.min(entries.length, from + CHUNK * CHUNKS_PER_ROUND);
  const headers = { 'content-type': 'application/json', ...(own ? { 'x-pip-pass': own } : {}) };
  for (let i = from; i < upto; i += CHUNK) {
    const res = await sync(new Request(url.origin + '/api/sync', {
      method: 'POST', headers,
      body: JSON.stringify({ since: Number.MAX_SAFE_INTEGER, entries: entries.slice(i, i + CHUNK) }),
    }));
    if (!res.ok) return send({ stalled: 'This site would not take the entries (HTTP ' + res.status + ').' });
  }
  const log = ['Copied entries ' + (from + 1) + ' to ' + upto + ' of ' + entries.length + '.'];
  if (upto < entries.length) return send({ next: upto, log });
  return send({ done: true, message: 'Done. All ' + entries.length + ' entries are across. You can delete IMPORT_FROM now.', log });
};
