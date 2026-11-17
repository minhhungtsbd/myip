import { isIP } from 'node:net';

const host = 'https://dnsleak.dev';
const testIdPattern = /^[a-z0-9]{10}$/;
const label = value => typeof value === 'string' ? value.slice(0, 180) : undefined;

export async function dnsLeak(request, env, path, json) {
  const start = path === '/api/dns-leak/start';
  if (request.method !== (start ? 'POST' : 'GET')) return json({ error: 'Phương thức không được hỗ trợ.' }, 405);
  const testId = path.split('/').at(-1);
  if (!start && !testIdPattern.test(testId)) return json({ error: 'Mã kiểm tra không hợp lệ.' }, 400);
  if (start) {
    if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Nguồn yêu cầu không hợp lệ.' }, 403);
    const guard = await env.LOOKUP_GUARD?.fetch('https://lookup-guard.internal/dns', {
      headers: { 'X-Visitor-IP': request.headers.get('CF-Connecting-IP') || 'unknown' }
    }).catch(() => null);
    if (guard?.status === 429) return json({ error: 'Thử lại sau một phút.' }, 429);
    if (guard?.status !== 204) return json({ error: 'Dịch vụ đo DNS tạm thời bận.' }, 503);
  }
  try {
    const response = await fetch(host + (start ? '/api/new' : '/api/result/' + testId), {
      headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(6000)
    });
    if (response.status === 429) return json({ error: 'Dịch vụ đo DNS đang giới hạn lượt thử.' }, 429);
    if (!response.ok) return json({ error: 'Không lấy được kết quả từ dịch vụ đo DNS.' }, 502);
    const data = await response.json();
    if (start) {
      if (!testIdPattern.test(data.testId) || !Array.isArray(data.hostnames)) throw new Error('Invalid session');
      const pattern = new RegExp('^' + data.testId + '-[aq]\\d{2}\\.t\\.dnsleak\\.dev$');
      const names = data.hostnames.slice(0, 24).filter(name => typeof name === 'string' && pattern.test(name));
      if (!names.length) throw new Error('Empty session');
      return json({ id: data.testId, names });
    }
    const resolvers = Array.isArray(data.resolvers) ? data.resolvers : [];
    return json({
      lookups: Number(data.lookups) || 0,
      split: data.verdict?.status === 'split',
      resolvers: resolvers.filter(row => row?.role !== 'observer' && isIP(row?.ip || '')).slice(0, 50)
        .map(row => ({ ip: row.ip, org: label(row.operator) || label(row.org), hostname: label(row.hostname),
          country: label(row.country), countryCode: label(row.countryCode), city: label(row.city), anycast: row.anycast === true }))
    });
  } catch {
    return json({ error: 'Dịch vụ đo DNS tạm thời không phản hồi.' }, 502);
  }
}
