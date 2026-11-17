import { flagCodes } from '../flag-codes.js';

const button = document.getElementById('run-dns');
const status = document.getElementById('dns-status');
const results = document.getElementById('dns-results');
const rows = document.getElementById('dns-rows');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function api(path, method = 'GET') {
  const response = await fetch('/api/dns-leak/' + path, { method, signal: AbortSignal.timeout(9000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không lấy được kết quả đo.');
  return data;
}

function render(report) {
  for (const resolver of report.resolvers) {
    const row = rows.insertRow();
    row.insertCell().textContent = resolver.ip;
    row.insertCell().textContent = resolver.org || resolver.hostname || 'Chưa xác định';
    const cell = row.insertCell();
    const location = document.createElement('span');
    location.className = 'with-flag';
    if (flagCodes.includes(resolver.countryCode)) {
      const flag = document.createElement('img');
      flag.className = 'flag';
      flag.alt = '';
      flag.src = '/flags/' + resolver.countryCode.toLowerCase() + '.svg';
      location.append(flag);
    }
    location.append([resolver.city, resolver.country].filter(Boolean).join(', ') || 'Chưa xác định');
    cell.append(location);
  }
  results.hidden = false;
}

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Đang tạo phiên đo DNS…';
  rows.replaceChildren();
  results.hidden = true;
  try {
    const { id, names } = await api('start', 'POST');
    status.textContent = 'Đang gửi truy vấn DNS từ trình duyệt…';
    await Promise.allSettled(names.map(name => fetch('https://' + name + '/', {
      mode: 'no-cors', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(4200)
    })));
    let report;
    for (let attempt = 0; attempt < 3; attempt++) {
      await pause(attempt === 0 ? 500 : 1000);
      report = await api('result/' + encodeURIComponent(id));
      if (report.lookups >= names.length) break;
    }
    if (!report.resolvers.length) {
      status.textContent = 'Chưa quan sát được resolver. Hãy thử lại và kiểm tra công cụ chặn truy cập miền đo DNS.';
      return;
    }
    render(report);
    status.textContent = 'Đã quan sát ' + report.lookups + '/' + names.length + ' truy vấn thử.'
      + (report.split ? ' Có nhiều đường phân giải DNS. Hãy đối chiếu các nhà cung cấp bên dưới.' : '');
  } catch (error) {
    status.textContent = error.message || 'Không thể hoàn tất phép đo DNS.';
  } finally {
    button.disabled = false;
  }
});
