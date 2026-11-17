import { isIP } from 'node:net';
import { dnsLeak } from '../../lib/dns-leak.js';
import { lookup, providerCacheVariant } from '../../lib/providers.js';

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

export async function onRequest({ request, env, waitUntil }) {
  const url = new URL(request.url);
  if (url.pathname === '/api/dns-leak/start' || /^\/api\/dns-leak\/result\/[^/]+$/.test(url.pathname)) {
    return dnsLeak(request, env, url.pathname, json);
  }
  if (request.method !== 'GET') return json({ error: 'Chỉ hỗ trợ GET.' }, 405);
  if (url.pathname === '/api/health') return json({ ok: true });
  if (url.pathname === '/api/me') {
    const ip = request.headers.get('CF-Connecting-IP');
    if (!isIP(ip || '')) return json({ error: 'Không xác định được IP kết nối.' }, 503);
    const { country, city, region, timezone, asn, asOrganization, postalCode,
      latitude, longitude, colo } = request.cf || {};
    return json({ ip, version: isIP(ip), country, city, region, timezone, asn,
      organization: asOrganization, postal: postalCode, latitude, longitude, colo });
  }
  if (url.pathname !== '/api/lookup') return json({ error: 'Không tìm thấy API.' }, 404);
  const input = (url.searchParams.get('ip') || '').trim();
  const version = isIP(input);
  if (!version || input.includes('%')) return json({ error: 'Nhập một địa chỉ IPv4 hoặc IPv6 hợp lệ.' }, 400);
  const ip = version === 6 ? new URL('https://[' + input + ']/').hostname.slice(1, -1) : input;
  const cacheUrl = new URL('/api/lookup', url.origin);
  cacheUrl.searchParams.set('ip', ip);
  cacheUrl.searchParams.set('schema', '4-' + providerCacheVariant(env));
  const cached = await caches.default.match(cacheUrl);
  if (cached) return json(await cached.json());
  const visitor = request.headers.get('CF-Connecting-IP') || 'unknown';
  const guard = await env.LOOKUP_GUARD?.fetch('https://lookup-guard.internal/', {
    headers: { 'X-Visitor-IP': visitor }
  }).catch(() => null);
  if (guard?.status === 429) return json({ error: 'Bạn đã tra cứu quá nhiều IP. Vui lòng thử lại sau một phút.' }, 429);
  if (guard?.status !== 204) {
    return json({ error: 'Dịch vụ tra cứu đang bận. Vui lòng thử lại sau.' }, 503);
  }
  const sources = await lookup(ip, env);
  const available = sources.filter(source => source.status === 'ok');
  const data = { ip, version, sources };
  if (available.length) {
    const ttl = sources.some(source => source.status === 'unavailable') ? 120 : 900;
    waitUntil(caches.default.put(cacheUrl, Response.json(data, {
      headers: { 'Cache-Control': 'public, max-age=' + ttl }
    })).catch(() => {}));
  }
  return json(data);
}
