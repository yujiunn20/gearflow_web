$ErrorActionPreference = 'Stop'
$port = 4173
$root = (Get-Location).Path
$server = $null

foreach ($cmd in @('py', 'python')) {
  try {
    $server = Start-Process -PassThru -WindowStyle Hidden -FilePath $cmd -ArgumentList @('-m', 'http.server', $port, '--bind', '127.0.0.1') -WorkingDirectory $root
    break
  } catch {
    continue
  }
}

if (-not $server) {
  Write-Error '找不到 Python。請安裝 Python，或告訴我我幫你改成 Node 版啟動腳本。'
  exit 1
}

Write-Host "Local server started at http://127.0.0.1:$port"
Start-Process "http://127.0.0.1:$port/index.html"
