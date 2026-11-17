const byId = id => document.getElementById(id);
const countries = new Intl.DisplayNames(['vi'], { type: 'region' });
const value = input => input === undefined || input === null || input === '' ? 'Chưa có dữ liệu' : String(input);
const countryName = data => {
  const code = data.countryCode || data.country;
  return /^[A-Z]{2}$/.test(code || '') ? countries.of(code) : data.country || code;
};
const formatLocation = data => [data.city, data.region, countryName(data)]
  .filter((part, index, parts) => part && parts.indexOf(part) === index).join(', ');
const formatAsn = asn => asn ? 'AS' + String(asn).replace(/^AS/i, '') : '';
const lookupPath = ip => '/ip-lookup/?query=' + encodeURIComponent(ip);

async function request(path) {
  const response = await fetch(path, { signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không tải được dữ liệu.');
  return data;
}

function fillList(target, pairs) {
  const container = byId(target);
  container.replaceChildren();
  for (const [label, data, state] of pairs) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const answer = document.createElement('dd');
    term.textContent = label;
    answer.textContent = value(data);
    if (typeof state === 'boolean') answer.dataset.state = state;
    row.append(term, answer);
    container.append(row);
  }
}

const signalFields = [['Proxy', 'proxy'], ['VPN', 'vpn'], ['Tor', 'tor'], ['Trung tâm dữ liệu', 'hosting']];
function signals(sources) {
  return signalFields.map(([label, field]) => {
    const available = sources.filter(source => typeof source[field] === 'boolean');
    const first = available[0]?.[field];
    if (available.some(source => source[field] !== first)) return [label, 'Nguồn trả kết quả khác nhau'];
    return [label, first === true ? 'Phát hiện' : first === false ? 'Không phát hiện' : null, first];
  });
}

async function home() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const browser = navigator.userAgentData?.brands?.filter(item => /Chrom|Edge|Opera|Firefox/i.test(item.brand))
    .at(-1)?.brand || navigator.userAgent.match(/(Edg|Firefox|Chrome|Version)\//)?.[1] || 'Trình duyệt web';
  const browserLabel = ({ Edg: 'Microsoft Edge', Version: 'Safari' })[browser] || browser;
  let connection;
  try {
    connection = await request('/api/me');
  } catch {
    byId('current-ip').textContent = 'Không có dữ liệu';
    byId('current-location').textContent = 'Chưa đọc được IP công khai. Hãy tải lại trang.';
  }
  const data = connection || {};
  fillList('network', [
    ['Quốc gia', countryName(data)], ['Khu vực / Thành phố', [data.region, data.city].filter(Boolean).join(' · ')],
    ['ISP / Tổ chức', data.organization], ['ASN', formatAsn(data.asn)],
    ['Múi giờ theo IP', data.timezone], ['Múi giờ trình duyệt', timezone],
    ['Trình duyệt', browserLabel], ['Ngôn ngữ trình duyệt', navigator.language]
  ]);
  fillList('signals', signals([]));
  if (!connection) {
    byId('signal-note').textContent = 'Cần địa chỉ IP để đọc tín hiệu kết nối.';
    return;
  }
  byId('current-ip').textContent = data.ip;
  byId('version').textContent = 'IPv' + data.version;
  byId('version').hidden = false;
  byId('current-location').textContent = formatLocation(data) || 'Chưa có dữ liệu vị trí';
  byId('compare').href = lookupPath(data.ip);
  const copy = byId('copy');
  copy.disabled = false;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(data.ip);
      copy.textContent = 'Đã sao chép';
    } catch {
      copy.textContent = 'Hãy sao chép IP thủ công';
    }
  });
  try {
    const result = await request('/api/lookup?ip=' + encodeURIComponent(data.ip));
    fillList('signals', signals(result.sources));
    const names = result.sources.filter(source => signalFields.some(([, field]) => typeof source[field] === 'boolean'))
      .map(source => source.name);
    byId('signal-note').textContent = names.length ? 'Nguồn: ' + names.join(', ') : 'Các nguồn hiện chưa trả dữ liệu phân loại.';
  } catch {
    byId('signal-note').textContent = 'Chưa tải được tín hiệu kết nối.';
  }
}

function showMap(data) {
  if (data.latitude === undefined || data.longitude === undefined) return;
  const lat = Number(data.latitude);
  const lon = Number(data.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return;
  byId('map-panel').hidden = false;
  byId('coordinates').textContent = lat.toFixed(4) + ', ' + lon.toFixed(4) + ' · Nguồn: ' + data.name;
  const button = byId('show-map');
  button.addEventListener('click', () => {
    const url = new URL('https://www.openstreetmap.org/export/embed.html');
    url.searchParams.set('bbox', [Math.max(-180, lon - .15), lat - .09, Math.min(180, lon + .15), lat + .09].join(','));
    url.searchParams.set('marker', [lat, lon].join(','));
    url.searchParams.set('layer', 'mapnik');
    const frame = document.createElement('iframe');
    frame.title = 'Vị trí IP ước tính trên OpenStreetMap';
    frame.referrerPolicy = 'no-referrer';
    frame.src = url.href;
    byId('map').append(frame);
    button.hidden = true;
  }, { once: true });
}

function showSources(sources) {
  for (const source of sources) {
    const row = byId('sources').insertRow();
    const link = document.createElement('a');
    link.href = source.website;
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    link.textContent = source.name;
    row.insertCell().append(link);
    const locationCell = row.insertCell();
    locationCell.textContent = source.status === 'ok' ? value(formatLocation(source))
      : source.reason === 'rate_limit' ? 'Nguồn đang giới hạn lượt tra cứu' : 'Tạm không có kết quả';
    row.insertCell().textContent = value(source.organization);
    row.insertCell().textContent = value(formatAsn(source.asn));
  }
}

async function lookupPage() {
  const status = byId('lookup-status');
  const input = byId('query');
  const button = byId('use-my-ip');
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { location.assign(lookupPath((await request('/api/me')).ip)); }
    catch (error) { status.textContent = error.message; button.disabled = false; }
  });
  const query = new URLSearchParams(location.search).get('query');
  if (!query) return;
  input.value = query;
  status.textContent = 'Đang đối chiếu các nguồn…';
  let result;
  try { result = await request('/api/lookup?ip=' + encodeURIComponent(query)); }
  catch (error) { status.textContent = error.message; return; }
  const available = result.sources.filter(source => source.status === 'ok');
  byId('result-version').textContent = 'ĐỊA CHỈ IPv' + result.version;
  byId('result-ip').textContent = result.ip;
  byId('sources-count').textContent = available.length + '/' + result.sources.length + ' nguồn có kết quả';
  showSources(result.sources);
  if (available.length) {
    const main = available.find(source => source.city && source.latitude !== undefined && source.longitude !== undefined) || available[0];
    fillList('details', [
      ['Quốc gia', countryName(main)], ['Khu vực', main.region], ['Thành phố', main.city],
      ['ISP / Tổ chức', main.organization], ['ASN', formatAsn(main.asn)], ['Loại mạng', main.network],
      ['Múi giờ', main.timezone], ['Mã bưu chính', main.postal]
    ]);
    byId('detail-source').textContent = 'Nguồn tóm tắt: ' + main.name + ' · Vị trí IP chỉ mang tính ước tính.';
    showMap(main);
  }
  byId('results').hidden = false;
  status.textContent = available.length ? '' : 'Chưa có nguồn nào trả kết quả cho IP này. Bạn có thể thử lại sau.';
}

if (document.body.dataset.page === 'home') void home();
else void lookupPage();
