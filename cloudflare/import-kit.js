// Shared by this app's /api/import. The one-off copy of your data from the old Netlify site into this one.

export const send = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// IMPORT_FROM (Cloudflare, Settings, Variables and secrets) is the old site's address, optionally followed by | and its
// passcode if it had one:   https://old-site.netlify.app|PASSCODE
export function oldSite() {
  for (const line of String(process.env.IMPORT_FROM || '').split(/[\n;]+/)) {
    const [raw, pass] = line.split('|').map((s) => s.trim());
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return { base: u.origin, pass: pass || '' };
    } catch { /* not an address */ }
  }
  return null;
}

export const wantsPage = (req, url) =>
  req.method === 'GET' && !url.searchParams.has('json') && /text\/html/.test(req.headers.get('accept') || '');

export const html = (title) =>
  new Response(page(title), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

// Reads one thing from the old site. Comes back as { res } or, when it can't be read, { problem } in plain words.
export async function fetchOld(src, path, headers = {}) {
  let res;
  try {
    res = await fetch(src.base + path, { headers, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    return { problem: 'Could not reach the old site (' + (e && e.name === 'TimeoutError' ? 'it timed out' : 'no answer') + '). If it is still paused, try again once it is back.' };
  }
  if (res.status === 401) return { problem: 'The old site wants a passcode. Add it after the address in IMPORT_FROM, like https://old-site.netlify.app|PASSCODE' };
  if (res.status === 404) return { missing: true, res };
  if (!res.ok) return { problem: 'The old site answered with an error (HTTP ' + res.status + '). If it is still paused, try again once it is back.' };
  return { res };
}

// Something that is JSON, as opposed to the "site not available" page a paused Netlify site shows.
export async function jsonOf(res) {
  if (!/json/.test(res.headers.get('content-type') || '')) return undefined;
  try { return await res.json(); } catch { return undefined; }
}

export const NOT_DATA = 'The old site did not send your data back (it looks like the "site not available" page). If it is still paused, try again once it is back.';

// The page you see when you open /api/import. It asks for the next round again and again until the server says it is done.
function page(title) {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:0 auto;padding:24px 16px}h1{font-size:1.3rem}
#log div{padding:6px 0;border-bottom:1px solid #8884}.ok{color:#1d7a3a;font-weight:600}.bad{color:#b3261e;font-weight:600}
button{font:inherit;padding:10px 18px;border-radius:10px;border:1px solid #8886;background:transparent;color:inherit;margin:14px 8px 0 0}</style></head>
<body><h1>${title}</h1><p id="now">Starting...</p><div id="log"></div><button id="again" hidden>Try again</button><button id="force" hidden>Replace what is here</button>
<script>
var log = document.getElementById('log'), now = document.getElementById('now'), again = document.getElementById('again'), force = document.getElementById('force');
var q = location.search, from = 0;
function api(f) { return location.pathname + q + (q ? '&' : '?') + 'json=1' + (from ? '&from=' + from : '') + (f ? '&force=1' : ''); }
function add(text, cls) { var d = document.createElement('div'); if (cls) d.className = cls; d.textContent = text; log.appendChild(d); }
function stop(text, cls) { now.textContent = ''; add(text, cls); again.hidden = cls === 'ok'; }
function go(n, f) {
  now.textContent = 'Copying across (round ' + n + ')...';
  fetch(api(f), { cache: 'no-store' }).then(function (r) { return r.json().then(function (d) { return { r: r, d: d }; }); }).then(function (x) {
    var d = x.d;
    if (!x.r.ok) return stop(x.r.status === 401 ? 'This site has a passcode. Open this page again with ?key=YOUR-PASSCODE on the end.' : (d.hint || d.error || 'Something went wrong.'), 'bad');
    (d.log || []).forEach(function (t) { add(t); });
    if (d.needsForce) { now.textContent = ''; add(d.needsForce, 'bad'); force.hidden = false; return; }
    if (d.stalled) return stop(d.stalled, 'bad');
    if (d.done) return stop(d.message || 'Done. Everything is across. You can delete IMPORT_FROM now.', 'ok');
    if (typeof d.next === 'number') from = d.next;
    if (n >= 300) return stop('Stopped after 300 rounds. Open this page again to carry on.', 'bad');
    go(n + 1, f);
  }).catch(function () { stop('Could not reach this site. Check your connection and try again.', 'bad'); });
}
again.onclick = function () { log.textContent = ''; again.hidden = true; from = 0; go(1, false); };
force.onclick = function () { log.textContent = ''; force.hidden = true; from = 0; go(1, true); };
go(1, false);
</script></body></html>`;
}
