import { flagCodes } from './flag-codes.js';

const byId = id => document.getElementById(id);
const countries = new Intl.DisplayNames(['vi'], { type: 'region' });
const englishCountries = new Intl.DisplayNames(['en'], { type: 'region' });
const supportedCodes = new Set(flagCodes.filter(code => code !== 'XX' && code !== 'ZZ'));
const codeByName = new Map([...supportedCodes].map(code => [englishCountries.of(code).toUpperCase(), code]));
for (const [name, code] of Object.entries({
  'UNITED STATES OF AMERICA': 'US', 'VIET NAM': 'VN', 'RUSSIAN FEDERATION': 'RU',
  'CZECH REPUBLIC': 'CZ', 'REPUBLIC OF KOREA': 'KR', 'KOREA, REPUBLIC OF': 'KR'
})) codeByName.set(name, code);
const value = input => input === undefined || input === null || input === '' ? 'Chưa có dữ liệu' : String(input);
function countryCode(data) {
  const input = (data.countryCode || data.country || '').trim().toUpperCase();
  const code = input === 'UK' ? 'GB' : input;
  return supportedCodes.has(code) ? code : codeByName.get((data.country || '').trim().toUpperCase()) || '';
}
const countryName = data => countryCode(data) ? countries.of(countryCode(data)) : data.country;
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

function placeLabel(data, text) {
  const label = document.createElement('span');
  const code = countryCode(data);
  if (code) {
    const flag = document.createElement('img');
    flag.className = 'flag';
    flag.src = '/flags/' + code.toLowerCase() + '.svg';
    flag.alt = '';
    flag.addEventListener('error', () => flag.remove(), { once: true });
    label.className = 'with-flag';
    label.append(flag);
  }
  label.append(value(text));
  return label;
}

function fillList(target, pairs) {
  const container = byId(target);
  container.replaceChildren();
  for (const [label, data, state] of pairs) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const answer = document.createElement('dd');
    term.textContent = label;
    answer.append(data instanceof Node ? data : value(data));
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

function renderSignals(sources) {
  fillList('signals', signals(sources));
  const names = sources.filter(source => signalFields.some(([, field]) => typeof source[field] === 'boolean'))
    .map(source => source.name);
  byId('signal-note').textContent = names.length ? 'Nguồn: ' + names.join(', ') : 'Các nguồn hiện chưa trả dữ liệu phân loại.';
  const scores = [];
  for (const source of sources) {
    if (Number.isFinite(source.abuseScore)) {
      const reports = Number.isFinite(source.reports) ? ' · ' + source.reports + ' báo cáo trong 90 ngày' : '';
      scores.push(['AbuseIPDB', source.abuseScore + '/100' + reports]);
    }
    if (Number.isFinite(source.fraudScore)) scores.push(['Rủi ro IP theo Scamalytics', source.fraudScore + '/100']);
  }
  if (scores.length) {
    fillList('reputation', scores);
    byId('reputation').hidden = false;
  }
}

function setupWebRtc(baseIp) {
  const button = byId('run-webrtc');
  const status = byId('webrtc-status');
  button.addEventListener('click', async () => {
    if (!window.RTCPeerConnection) {
      status.textContent = 'Trình duyệt không hỗ trợ WebRTC.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Đang thu thập địa chỉ từ STUN…';
    let peer;
    let timer;
    try {
      peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      const publicIps = new Set();
      const done = new Promise(resolve => {
        timer = setTimeout(resolve, 4500);
        peer.addEventListener('icecandidate', ({ candidate }) => {
          if (!candidate) resolve();
          else if (candidate.type === 'srflx' && candidate.address) publicIps.add(candidate.address);
        });
      });
      peer.createDataChannel('ip-check');
      await peer.setLocalDescription(await peer.createOffer());
      await done;
      const canonical = ip => ip.includes(':') ? new URL('https://[' + ip + ']/').hostname : ip;
      const comparable = baseIp ? [...publicIps].filter(ip => ip.includes(':') === baseIp.includes(':')) : [];
      const differing = comparable.some(ip => canonical(ip) !== canonical(baseIp));
      let explanation = 'Không thu được IP công khai từ STUN. Kết quả này chưa đủ để xác định rò rỉ.';
      if (publicIps.size) {
        explanation = differing ? 'STUN thấy IP khác với kết nối web: '
          : comparable.length ? 'IP cùng phiên bản khớp với kết nối web: ' : 'Địa chỉ STUN (khác phiên bản IP kết nối web): ';
        explanation += [...publicIps].join(', ');
      }
      status.textContent = explanation;
    } catch {
      status.textContent = 'Không thể hoàn tất kiểm tra WebRTC trên trình duyệt này.';
    } finally {
      clearTimeout(timer);
      peer?.close();
      button.disabled = false;
    }
  });
}

async function home() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const agent = navigator.userAgent;
  const browsers = [['Microsoft Edge', /Edg(?:A|iOS)?\/(\d+)/], ['Opera', /OPR\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/], ['Chrome', /(?:Chrome|CriOS)\/(\d+)/], ['Safari', /Version\/(\d+)/]];
  const browserLabel = browsers.map(([name, pattern]) => {
    const version = agent.match(pattern)?.[1];
    return version ? name + ' ' + version : '';
  }).find(Boolean) || 'Trình duyệt web';
  const platform = navigator.userAgentData?.platform || [
    ['Android', /Android/], ['iOS', /iPhone|iPad/], ['Windows', /Windows/],
    ['ChromeOS', /CrOS/], ['macOS', /Macintosh/], ['Linux', /Linux/]
  ].find(([, pattern]) => pattern.test(agent))?.[0];
  let connection;
  try {
    connection = await request('/api/me');
  } catch {
    byId('current-ip').textContent = 'Không có dữ liệu';
    byId('current-location').textContent = 'Chưa đọc được IP công khai. Hãy tải lại trang.';
  }
  const data = connection || {};
  setupWebRtc(data.ip);
  fillList('network', [
    ['Quốc gia', placeLabel(data, countryName(data))], ['Khu vực / Thành phố', [data.region, data.city].filter(Boolean).join(' · ')],
    ['ISP / Tổ chức', data.organization], ['ASN', formatAsn(data.asn)],
    ['Múi giờ theo IP', data.timezone], ['Múi giờ trình duyệt', timezone],
    ['Trình duyệt', browserLabel], ['Hệ điều hành', platform], ['Ngôn ngữ trình duyệt', navigator.language],
    ['Điểm kết nối Cloudflare', data.colo]
  ]);
  fillList('signals', signals([]));
  if (!connection) {
    byId('signal-note').textContent = 'Cần địa chỉ IP để đọc tín hiệu kết nối.';
    return;
  }
  byId('current-ip').textContent = data.ip;
  byId('version').textContent = 'IPv' + data.version;
  byId('version').hidden = false;
  byId('current-location').replaceChildren(placeLabel(data, formatLocation(data)));
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
    renderSignals(result.sources);
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
    if (source.status === 'ok') locationCell.append(placeLabel(source, formatLocation(source)));
    else locationCell.textContent = source.reason === 'rate_limit' ? 'Nguồn đang giới hạn lượt tra cứu' : 'Tạm không có kết quả';
    row.insertCell().textContent = value(source.organization);
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
  const geo = result.sources.filter(source => source.kind !== 'reputation');
  const available = geo.filter(source => source.status === 'ok');
  byId('result-version').textContent = 'ĐỊA CHỈ IPv' + result.version;
  byId('result-ip').textContent = result.ip;
  byId('sources-count').textContent = available.length + '/' + geo.length + ' nguồn có kết quả';
  showSources(geo);
  renderSignals(result.sources);
  if (available.length) {
    const main = available.find(source => source.city && source.latitude !== undefined && source.longitude !== undefined) || available[0];
    fillList('details', [
      ['Quốc gia', placeLabel(main, countryName(main))], ['Khu vực', main.region], ['Thành phố', main.city],
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
