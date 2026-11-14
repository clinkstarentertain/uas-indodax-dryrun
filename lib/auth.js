// Otorisasi: header "Authorization: Bearer <CRON_SECRET>". Secret hanya dari environment variable.
import crypto from 'node:crypto';
export function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;            // tanpa secret yang layak -> tolak semua
  const got = Buffer.from(request.headers.get('authorization') || '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
export const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
