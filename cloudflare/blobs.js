import { env } from 'cloudflare:workers';

// Stands in for @netlify/blobs (the build swaps this file in, see "alias" in wrangler.jsonc), so the functions
// from the Netlify version run on Cloudflare exactly as they are. It offers the calls they use, backed by the
// Durable Object in store.js.

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesOf(data) {
  if (typeof data === 'string') return enc.encode(data).buffer;
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  throw new TypeError('Unsupported value');
}

function shape(buf, opts) {
  const type = opts && opts.type;
  if (type === 'arrayBuffer') return buf;
  const text = dec.decode(buf);
  return type === 'json' ? JSON.parse(text) : text;
}

export function getStore(options) {
  const name = typeof options === 'string' ? options : options.name;
  // Created near Australia the first time it is used.
  const stub = () => env.STORE.getByName(name, { locationHint: 'oc' });

  // Reads made in the same moment (a list of records fetched with Promise.all) go as one call.
  let queue = null;
  function read(key) {
    return new Promise((resolve, reject) => {
      if (!queue) {
        const q = queue = { keys: [], waits: [] };
        Promise.resolve().then(async () => {
          queue = null;
          try {
            const got = await stub().getMany(q.keys);
            q.waits.forEach((w, i) => w.resolve(got[i]));
          } catch (e) { q.waits.forEach((w) => w.reject(e)); }
        });
      }
      queue.keys.push(key);
      queue.waits.push({ resolve, reject });
    });
  }

  return {
    async get(key, opts) {
      const buf = await read(key);
      return buf == null ? null : shape(buf, opts);
    },
    async getWithMetadata(key, opts) {
      const r = await stub().getWithMeta(key);
      return r == null ? null : { data: shape(r.data, opts), etag: '', metadata: r.metadata };
    },
    async getMetadata(key) {
      const r = await stub().getMeta(key);
      return r == null ? null : { etag: '', metadata: r.metadata };
    },
    async set(key, data, opts) { await stub().put(key, bytesOf(data), opts && opts.metadata); },
    async setJSON(key, value, opts) { await stub().put(key, enc.encode(JSON.stringify(value)).buffer, opts && opts.metadata); },
    async delete(key) { await stub().remove(key); },
    async list(opts) {
      const keys = await stub().keys((opts && opts.prefix) || '');
      return { blobs: keys.map((key) => ({ key, etag: '' })), directories: [] };
    },
  };
}
