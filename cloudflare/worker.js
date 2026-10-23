import sync from '../netlify/functions/sync.js';
import importer from './import.js';

// The Cloudflare version of Pip. The page, service worker, manifest and icons are served straight from the repo's top
// folder (see "assets" in wrangler.jsonc); only /api/ comes here. The function is the same file Netlify runs
// (netlify/functions/sync.js), and the Durable Object in store.js takes the place of Netlify Blobs.

export { Store } from './store.js';

const routes = { '/api/sync': sync, '/api/import': importer };
const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const send = (body, status) => new Response(JSON.stringify(body), { status, headers });

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const handler = routes[pathname];
    if (handler) {
      try { return await handler(request); }
      catch (e) { console.error(pathname, e && e.stack || e); return send({ error: 'server' }, 500); }
    }
    if (pathname.startsWith('/api/')) return send({ error: 'not-found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
