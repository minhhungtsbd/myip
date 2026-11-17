const providers = [
  {
    name: 'ipapi.is', website: 'https://ipapi.is/',
    url: (ip, env) => {
      const url = new URL('https://api.ipapi.is/');
      url.searchParams.set('q', ip);
      if (env.IPAPIIS_API_KEY) url.searchParams.set('key', env.IPAPIIS_API_KEY);
      return url;
    },
    read: d => {
      const g = d.location || d;
      return {
        country: g.country, countryCode: g.country_code, region: g.state || g.region, city: g.city,
        latitude: g.latitude ?? g.lat, longitude: g.longitude ?? g.lon, timezone: g.timezone,
        postal: g.zip, organization: d.company?.name || d.asn?.org || (typeof d.company === 'string' ? d.company : null),
        asn: d.asn?.asn ?? d.asn, network: d.company?.type,
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
      const url = new URL('https://ipinfo.io/' + encodeURIComponent(ip) + '/json');
      if (env.IPINFO_API_TOKEN) url.searchParams.set('token', env.IPINFO_API_TOKEN);
      return url;
    },
    read: d => {
      const [latitude, longitude] = (d.loc || '').split(',');
      const org = d.org?.match(/^(AS\d+)\s+(.+)$/);
      return { countryCode: d.country, region: d.region, city: d.city, latitude, longitude,
        timezone: d.timezone, postal: d.postal, organization: org?.[2] || d.org, asn: org?.[1] };
    }
  },
  {
    name: 'IP2Location', website: 'https://www.ip2location.io/', key: 'IP2LOCATION_API_KEY',
    url: (ip, env) => {
      const url = new URL('https://api.ip2location.io/');
      url.search = new URLSearchParams({ ip, key: env.IP2LOCATION_API_KEY });
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
      url.searchParams.set('apikey', env.IPLOCATE_API_KEY);
      return url;
    },
    read: d => ({ country: d.country, countryCode: d.country_code, region: d.subdivision,
      city: d.city, latitude: d.latitude, longitude: d.longitude, timezone: d.timezone,
      postal: d.postal_code, organization: d.asn?.name || d.company?.name,
      asn: d.asn?.asn, vpn: d.privacy?.is_vpn, proxy: d.privacy?.is_proxy,
      tor: d.privacy?.is_tor, hosting: d.privacy?.is_hosting })
  }
];

export async function lookup(ip, env) {
  return Promise.all(providers.filter(p => !p.key || env[p.key]).map(async provider => {
    const source = { name: provider.name, website: provider.website };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(provider.url(ip, env), {
        headers: { Accept: 'application/json' }, redirect: 'manual', signal: controller.signal
      });
      if (!response.ok) return { ...source, status: 'unavailable', reason: response.status === 429 ? 'rate_limit' : 'upstream_http' };
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
