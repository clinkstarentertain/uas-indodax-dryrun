// Penyimpanan state & log. Produksi: Vercel Blob PRIVATE (token hanya dari env BLOB_READ_WRITE_TOKEN).
// Uji lokal: folder (STORE_DIR) dengan semantik sama (etag, tanpa-timpa).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class ConflictError extends Error {}

export async function blobStore() {
  const blob = await import('@vercel/blob');
  return {
    kind: 'vercel-blob',
    async getJson(p) {
      const r = await blob.get(p, { access: 'private', useCache: false });
      if (!r || r.statusCode !== 200) return null;
      // ETag dari get() bisa berbentuk lemah W/"..." (kompresi); ifMatch butuh ETag kuat
      return { data: JSON.parse(await new Response(r.stream).text()), etag: String(r.blob.etag).replace(/^W\//, '') };
    },
    async putJson(p, data, { ifMatch, noOverwrite } = {}) {
      const opt = { access: 'private', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60 };
      if (ifMatch) opt.ifMatch = ifMatch; else opt.allowOverwrite = !noOverwrite;
      try { return await blob.put(p, JSON.stringify(data), opt); }
      catch (e) {
        if (e instanceof blob.BlobPreconditionFailedError || /already exists|precondition/i.test(String(e && e.message))) throw new ConflictError(String(e.message));
        throw e;
      }
    },
    async list(prefix) {
      const out = []; let cursor;
      do { const r = await blob.list({ prefix, cursor, limit: 1000 }); out.push(...r.blobs.map((b) => b.pathname)); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
      return out.sort();
    },
  };
}

export function dirStore(dir) {
  const f = (p) => path.join(dir, p);
  const etagOf = (s) => crypto.createHash('md5').update(s).digest('hex');
  return {
    kind: 'folder',
    async getJson(p) { if (!fs.existsSync(f(p))) return null; const s = fs.readFileSync(f(p), 'utf8'); return { data: JSON.parse(s), etag: etagOf(s) }; },
    async putJson(p, data, { ifMatch, noOverwrite } = {}) {
      const exists = fs.existsSync(f(p));
      if (noOverwrite && exists) throw new ConflictError('already exists');
      if (ifMatch && (!exists || etagOf(fs.readFileSync(f(p), 'utf8')) !== ifMatch)) throw new ConflictError('precondition');
      fs.mkdirSync(path.dirname(f(p)), { recursive: true }); fs.writeFileSync(f(p), JSON.stringify(data)); return { pathname: p };
    },
    async list(prefix) {
      const base = f(prefix.endsWith('/') ? prefix : path.dirname(prefix));
      if (!fs.existsSync(base)) return [];
      return fs.readdirSync(base).map((x) => path.posix.join(prefix.endsWith('/') ? prefix.slice(0, -1) : path.posix.dirname(prefix), x)).filter((x) => x.startsWith(prefix)).sort();
    },
  };
}

export const getStore = async () => (process.env.STORE_DIR ? dirStore(process.env.STORE_DIR) : blobStore());
