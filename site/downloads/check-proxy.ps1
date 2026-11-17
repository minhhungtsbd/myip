param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'

function Parse-Endpoint([string]$line) {
    $pattern = '^(\[[0-9a-fA-F:]+\]|[0-9.]+):(\d{1,5})(?::([^:]+):(.+))?$'
    if ($line -match '[\x00-\x1f\x7f]' -or $line.Length -gt 1024 -or $line -notmatch $pattern) {
        throw 'Use IP:port or IP:port:user:password. Wrap IPv6 in brackets.'
    }
    $address = $Matches[1]
    $port = [int]$Matches[2]
    $user = $Matches[3]
    $password = $Matches[4]
    $ip = $null
    if ($port -lt 1 -or $port -gt 65535 -or
        -not [System.Net.IPAddress]::TryParse($address.Trim('[', ']'), [ref]$ip)) {
        throw 'Invalid IP address or port.'
    }
    if ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6) {
        $address = '[' + $ip.ToString() + ']'
    } else {
        $address = $ip.ToString()
    }
    return @{ Address = "${address}:$port"; User = $user; Password = $password }
}

function Escape-CurlConfig([string]$text) {
    return $text.Replace('\', '\\').Replace('"', '\"')
}

function Invoke-ProxyProbe($endpoint, [string]$protocol, [bool]$authenticate) {
    $config = @(
        'proxy = "' + $protocol + '://' + $endpoint.Address + '"'
        'noproxy = ""'
        'url = "https://cloudmini-myip.pages.dev/api/me"'
        'write-out = "\n%{http_code},%{http_connect},%{time_total}"'
    )
    if ($authenticate) {
        $identity = Escape-CurlConfig ($endpoint.User + ':' + $endpoint.Password)
        $config += 'proxy-user = "' + $identity + '"'
    }
    $output = $config | & curl.exe --disable --silent --connect-timeout 4 --max-time 7 --max-filesize 16384 --config -
    $code = $LASTEXITCODE
    $data = ($output -join "`n") -split "`n"
    $meta = $data[-1] -split ','
    $egress = $null
    if ($code -eq 0 -and $meta[0] -eq '200' -and $data.Count -gt 1) {
        try {
            $answer = ($data[0..($data.Count - 2)] -join "`n") | ConvertFrom-Json
            $parsed = $null
            if ([System.Net.IPAddress]::TryParse([string]$answer.ip, [ref]$parsed)) { $egress = $parsed.ToString() }
        } catch {}
    }
    return @{ IP = $egress; Connect = $meta[1]; Time = $meta[2]; Code = $code }
}

if ($ValidateOnly) {
    if ((Parse-Endpoint '192.0.2.10:8080').Address -ne '192.0.2.10:8080') { throw 'IPv4 parsing failed.' }
    if ((Parse-Endpoint '[2001:db8::10]:1080:u:p:a').Password -ne 'p:a') { throw 'IPv6 or password parsing failed.' }
    try { Parse-Endpoint '192.0.2.10:70000'; throw 'Range check failed.' }
    catch { if ($_.Exception.Message -ne 'Invalid IP address or port.') { throw } }
    Write-Host 'Input validation passed.'
    return
}

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { throw 'curl.exe is required.' }
$masked = Read-Host 'Proxy (input hidden)' -AsSecureString
$plain = [System.Net.NetworkCredential]::new('', $masked).Password
try {
    $endpoint = Parse-Endpoint $plain
    $plain = $null
    $state = @()
    foreach ($protocol in 'https', 'socks5h', 'http') {
        $type = if ($protocol -eq 'socks5h') { 'SOCKS5' } else { $protocol.ToUpperInvariant() }
        Write-Host "Testing $type..."
        $probe = Invoke-ProxyProbe $endpoint $protocol $false
        $needsAuth = $probe.Connect -eq '407' -or ($protocol -eq 'socks5h' -and $probe.Code -eq 97)
        if ($needsAuth -and $endpoint.User) {
            $probe = Invoke-ProxyProbe $endpoint $protocol $true
        }
        if ($probe.IP) {
            Write-Host "LIVE | $type | Exit IP: $($probe.IP) | $($probe.Time) s"
            return
        }
        $state += "$type (curl $($probe.Code), CONNECT $($probe.Connect))"
    }
    Write-Host 'No working connection from this device. Check endpoint, credentials, TLS certificate and IP allowlist.'
    Write-Host ($state -join ' | ')
} finally {
    $plain = $null
    $endpoint = $null
    $masked.Dispose()
}
