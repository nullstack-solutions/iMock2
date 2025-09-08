param(
  [string]$BaseAdminUrl = "https://mock.alefbet.lphub.net:443/__admin",
  [string]$AuthHeader = ""
)

$ErrorActionPreference = 'Stop'

function New-Headers {
  param([hashtable]$Extra)
  $h = @{
    'Content-Type' = 'application/json'
  }
  if ($AuthHeader) { $h['Authorization'] = $AuthHeader }
  if ($Extra) { foreach ($k in $Extra.Keys) { $h[$k] = $Extra[$k] } }
  return $h
}

function Invoke-Api {
  param(
    [ValidateSet('GET','POST','PUT','DELETE')][string]$Method,
    [string]$Path,
    $Body = $null,
    [int]$TimeoutMs = 10000
  )
  $uri = ($BaseAdminUrl.TrimEnd('/')) + $Path
  $headers = New-Headers @{}
  $opt = @{ Method = $Method; Uri = $uri; Headers = $headers }
  if ($Body -ne $null) { $opt['Body'] = (ConvertTo-Json $Body -Depth 64 -Compress) }
  $cts = New-Object System.Threading.CancellationTokenSource
  $timer = [System.Timers.Timer]::new($TimeoutMs); $timer.AutoReset = $false
  $timer.add_Elapsed({ $cts.Cancel() })
  try {
    $timer.Start()
    return Invoke-RestMethod @opt -TimeoutSec ([Math]::Ceiling($TimeoutMs/1000))
  } finally { $timer.Stop(); $timer.Dispose() }
}

$IMOCK_CACHE_ID = '00000000-0000-0000-0000-00000000cace'
$IMOCK_CACHE_URL = '/__imock/cache'

function Is-ImockCache($m) {
  if (-not $m) { return $false }
  try {
    $byMeta = $m.metadata.imock.type -eq 'cache'
    $byName = (($m.name + '')).ToLower() -eq 'imock cache'
    $url = $m.request.url
    if (-not $url) { $url = $m.request.urlPath }
    $byUrl = $url -eq $IMOCK_CACHE_URL
    return ($byMeta -or $byName -or $byUrl)
  } catch { return $false }
}

function Pick-Url($req) {
  if ($req.urlPath) { return $req.urlPath }
  if ($req.urlPathPattern) { return $req.urlPathPattern }
  if ($req.urlPattern) { return $req.urlPattern }
  return $req.url
}

function Slim-Mapping($m) {
  $sid = if ($m.id) { $m.id } else { $m.uuid }
  return [ordered]@{
    id = $sid
    name = $m.name
    priority = $m.priority
    persistent = $m.persistent
    scenarioName = $m.scenarioName
    request = [ordered]@{
      method = $m.request.method
      url = Pick-Url $m.request
      headers = $m.request.headers
      queryParameters = $m.request.queryParameters
    }
    response = [ordered]@{
      status = $m.response.status
      headers = $m.response.headers
    }
    metadata = $m.metadata
  }
}

function Build-SlimList($arr) {
  $items = @()
  foreach ($x in $arr) {
    if (Is-ImockCache $x) { continue }
    $items += (Slim-Mapping $x)
  }
  return @{ mappings = $items }
}

function Hash-String([string]$s) {
  $sha = [System.Security.Cryptography.SHA1]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($s)
    $hash = $sha.ComputeHash($bytes)
    return (([System.BitConverter]::ToString($hash)).Replace('-', '')).Substring(0,16)
  } finally { $sha.Dispose() }
}

function Ensure-CacheMapping() {
  try {
    $existing = Invoke-Api -Method GET -Path "/mappings/$IMOCK_CACHE_ID"
    if ($existing) { return $true }
  } catch {}
  # Build slim from current mappings
  $all = Invoke-Api -Method GET -Path "/mappings"
  $slim = Build-SlimList $all.mappings
  $meta = @{ imock = @{ type='cache'; version=1; timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); count=($slim.mappings.Count); hash=(Hash-String ((ConvertTo-Json $slim -Depth 64 -Compress))) } }
  $stub = @{
    id = $IMOCK_CACHE_ID
    name = 'iMock Cache'
    priority = 1
    persistent = $false
    request = @{ method='GET'; url=$IMOCK_CACHE_URL }
    response = @{ status=200; jsonBody=$slim; headers=@{ 'Content-Type'='application/json; charset=utf-8' } }
    metadata = $meta
  }
  try {
    Invoke-Api -Method PUT -Path "/mappings/$IMOCK_CACHE_ID" -Body $stub | Out-Null
  } catch {
    Invoke-Api -Method POST -Path "/mappings" -Body $stub | Out-Null
  }
  return $true
}

function Bench-Step($name, [scriptblock]$action) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $ok = $false
  $err = $null
  try {
    $res = & $action
    $ok = [bool]$res
  } catch {
    $err = $_.Exception.Message
  }
  $sw.Stop()
  return [pscustomobject]@{ step=$name; ok=$ok; ms=$sw.ElapsedMilliseconds; error=$err }
}

function Test-ByFirstPriority() {
  $one = Invoke-Api -Method GET -Path "/mappings?limit=1"
  $c = $one.mappings[0]
  return (Is-ImockCache $c)
}

function Test-ById() {
  $m = Invoke-Api -Method GET -Path "/mappings/$IMOCK_CACHE_ID"
  if ($m.mapping) { $m = $m.mapping }
  return (Is-ImockCache $m)
}

function Test-ByMetadata() {
  $body = @{ imock = @{ type='cache' } }
  $res = Invoke-Api -Method POST -Path "/mappings/find-by-metadata" -Body $body
  $list = $res.mappings
  if (-not $list) { $list = $res.items }
  foreach ($x in $list) { if (Is-ImockCache $x) { return $true } }
  return $false
}

Write-Host "BaseAdminUrl = $BaseAdminUrl" -ForegroundColor Cyan
if ($AuthHeader) { Write-Host "Authorization = (set)" -ForegroundColor Cyan }

Write-Host "Ensuring cache mapping exists..." -ForegroundColor Yellow
Ensure-CacheMapping | Out-Null

$r1 = Bench-Step 'by_priority_limit1' { Test-ByFirstPriority }
$r2 = Bench-Step 'by_fixed_id' { Test-ById }
$r3 = Bench-Step 'by_metadata' { Test-ByMetadata }

$results = @($r1,$r2,$r3)
$results | Format-Table -AutoSize

$best = ($results | Sort-Object ms)[0]
Write-Host ("Fastest: {0} in {1} ms (ok={2})" -f $best.step, $best.ms, $best.ok) -ForegroundColor Green
