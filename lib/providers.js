const key = (env, name) => env[name]?.split(',').map(value => value.trim()).find(Boolean);
function endpoint(base, params) {
  const url = new URL(base);
  url.search = new URLSearchParams(params);
  return url;
}
const legacyIpinfo = ip => 'https://ipinfo.io/' + encodeURIComponent(ip) + '/json';

const providers = [
  {
    name: 'ipapi.is', website: 'https://ipapi.is/',
    url: (ip, env) => {
      const url = new URL('https://api.ipapi.is/');
      url.searchParams.set('q', ip);
      if (key(env, 'IPAPIIS_API_KEY')) url.searchParams.set('key', key(env, 'IPAPIIS_API_KEY'));
      return url;
    },
    read: d => {
      const g = d.location || d;
      const asn = typeof d.asn === 'string' ? d.asn.match(/^AS(\d+)(?:\s+(.*))?$/i) : null;
      return {
        country: g.country, countryCode: g.country_code, region: g.state || g.region, city: g.city,
        latitude: g.latitude ?? g.lat, longitude: g.longitude ?? g.lon, timezone: g.timezone,
        postal: g.zip, organization: d.company?.name || d.asn?.org || (typeof d.company === 'string' ? d.company : null) || asn?.[2],
        asn: d.asn?.asn ?? asn?.[1] ?? d.asn, network: d.company?.type,
        vpn: d.is_vpn, proxy: d.is_proxy, tor: d.is_tor, hosting: d.is_datacenter
      };
    }
  },
  {
    name: 'IP.SB', website: 'https://ip.sb/',
    url: ip => 'https://api.ip.sb/geoip/' + encodeURIComponent(ip),
    read: d => ({ country: d.country, countryCode: d.country_code, region: d.region,
      city: d.city, latitude: d.latitude, longitude: d.longitude, timezone: d.timezone,
      postal: d.postal_code, organization: d.isp || d.organization, asn: d.asn })
  },
  {
    name: 'IPinfo', website: 'https://ipinfo.io/',
    url: (ip, env) => {
      const address = encodeURIComponent(ip);
      return key(env, 'IPINFO_API_TOKEN')
        ? 'https://api.ipinfo.io/lite/' + address
        : legacyIpinfo(ip);
    },
    headers: env => {
      const token = key(env, 'IPINFO_API_TOKEN');
      return token ? { Authorization: 'Bearer ' + token } : {};
    },
    anonymousFallback: legacyIpinfo,
    read: d => {
      const [latitude, longitude] = (d.loc || '').split(',');
      const org = d.org?.match(/^(AS\d+)\s+(.+)$/);
      return { country: d.country_code ? d.country : undefined, countryCode: d.country_code || d.country,
        region: d.region, city: d.city, latitude, longitude, timezone: d.timezone, postal: d.postal,
        organization: d.as_name || org?.[2] || d.org, asn: d.asn || org?.[1] };
    }
  },
  {
    name: 'IP2Location.io', website: 'https://www.ip2location.io/',
    url: (ip, env) => {
      const url = new URL('https://api.ip2location.io/');
      url.searchParams.set('ip', ip);
      const apiKey = key(env, 'IP2LOCATION_API_KEY');
      if (apiKey) url.searchParams.set('key', apiKey);
      return url;
    },
    read: d => ({ country: d.country_name, countryCode: d.country_code, region: d.region_name,
      city: d.city_name, latitude: d.latitude, longitude: d.longitude, timezone: d.time_zone,
      postal: d.zip_code, organization: d.as, asn: d.asn, proxy: d.is_proxy })
  },
  {
    name: 'IPLocate', website: 'https://iplocate.io/', key: 'IPLOCATE_API_KEY',
    url: (ip, env) => {
      const url = new URL('https://iplocate.io/api/lookup/' + encodeURIComponent(ip));
      url.searchParams.set('apikey', key(env, 'IPLOCATE_API_KEY'));
      return url;
    },
    read: d => ({ country: d.country, countryCode: d.country_code, region: d.subdivision,
      city: d.city, latitude: d.latitude, longitude: d.longitude, timezone: d.timezone,
      postal: d.postal_code, organization: d.asn?.name || d.company?.name,
      asn: d.asn?.asn, vpn: d.privacy?.is_vpn, proxy: d.privacy?.is_proxy,
      tor: d.privacy?.is_tor, hosting: d.privacy?.is_hosting })
  },
  {
    name: 'IPGeolocation.io', website: 'https://ipgeolocation.io/', key: 'IPGEOLOCATION_API_KEY',
    url: (ip, env) => endpoint('https://api.ipgeolocation.io/ipgeo', { ip, apiKey: key(env, 'IPGEOLOCATION_API_KEY') }),
    read: d => ({ country: d.country_name, countryCode: d.country_code2, region: d.state_prov,
      city: d.city, latitude: d.latitude, longitude: d.longitude, postal: d.zipcode,
      timezone: d.time_zone?.name, organization: d.isp || d.organization, asn: d.asn })
  },
  {
    name: 'IPregistry', website: 'https://ipregistry.co/', key: 'IPREGISTRY_API_KEY',
    url: (ip, env) => endpoint('https://api.ipregistry.co/' + encodeURIComponent(ip), { key: key(env, 'IPREGISTRY_API_KEY') }),
    read: d => ({ country: d.location?.country?.name, countryCode: d.location?.country?.code,
      region: d.location?.region?.name, city: d.location?.city, postal: d.location?.postal,
      latitude: d.location?.latitude, longitude: d.location?.longitude, timezone: d.time_zone?.id,
      organization: d.connection?.organization || d.company?.name, asn: d.connection?.asn,
      network: d.connection?.type, vpn: d.security?.is_vpn, proxy: d.security?.is_proxy,
      tor: d.security?.is_tor, hosting: d.security?.is_cloud_provider })
  },
  {
    name: 'AbuseIPDB', website: 'https://www.abuseipdb.com/', key: 'ABUSEIPDB_API_KEY', kind: 'reputation',
    url: ip => endpoint('https://api.abuseipdb.com/api/v2/check', { ipAddress: ip, maxAgeInDays: '90' }),
    headers: env => ({ Key: key(env, 'ABUSEIPDB_API_KEY') }),
    read: ({ data }) => ({ abuseScore: data?.abuseConfidenceScore, reports: data?.totalReports })
  },
  {
    name: 'Scamalytics', website: 'https://scamalytics.com/ip', key: 'SCAMALYTICS_API_KEY', kind: 'reputation',
    url: (ip, env) => endpoint('https://api12.scamalytics.com/v3/cloudmini/', { ip, key: key(env, 'SCAMALYTICS_API_KEY') }),
    read: ({ scamalytics: data }) => {
      if (data?.status !== 'ok') return {};
      const raw = data.scamalytics_score ?? data.score;
      const score = /^\d{1,3}$/.test(String(raw)) ? Number(raw) : undefined;
      return { fraudScore: score <= 100 ? score : undefined,
        vpn: data.scamalytics_proxy?.is_vpn, hosting: data.scamalytics_proxy?.is_datacenter };
    }
  }
];

export function providerCacheVariant(env) {
  return ['IPAPIIS_API_KEY', 'IPINFO_API_TOKEN', 'IP2LOCATION_API_KEY',
    ...providers.map(provider => provider.key).filter(Boolean)]
    .map(name => key(env, name) ? '1' : '0').join('');
}

export async function lookup(ip, env) {
  return Promise.all(providers.filter(p => !p.key || key(env, p.key)).map(async provider => {
    const source = { name: provider.name, website: provider.website, kind: provider.kind || 'geolocation' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      let response = await fetch(provider.url(ip, env), {
        headers: { Accept: 'application/json', ...provider.headers?.(env) },
        redirect: 'manual', signal: controller.signal
      });
      if (provider.anonymousFallback && key(env, 'IPINFO_API_TOKEN') && [401, 403].includes(response.status)) {
        await response.body?.cancel();
        response = await fetch(provider.anonymousFallback(ip), {
          headers: { Accept: 'application/json' }, redirect: 'manual', signal: controller.signal
        });
      }
      if (!response.ok) {
        await response.body?.cancel();
        return { ...source, status: 'unavailable', reason: response.status === 429 ? 'rate_limit' : 'upstream_http' };
      }
      const data = await response.json();
      if (data.error || data.success === false || data.bogon || data.is_bogon) {
        return { ...source, status: 'unavailable', reason: 'no_data' };
      }
      const fields = Object.fromEntries(Object.entries(provider.read(data)).filter(([, value]) =>
        typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
        || (typeof value === 'string' && value.trim() && value !== '-')));
      if (!Object.keys(fields).length) return { ...source, status: 'unavailable', reason: 'no_data' };
      return { ...source, status: 'ok', ...fields };
    } catch {
      return { ...source, status: 'unavailable', reason: controller.signal.aborted ? 'timeout' : 'fetch_error' };
    } finally {
      clearTimeout(timeout);
    }
  }));
}
