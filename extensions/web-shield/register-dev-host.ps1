# Registers the AVS Web Shield native messaging host in DEV mode.
# Points Chrome/Edge at the repo's Python backend instead of the installed
# avs-backend.exe. Run once, then load the extension unpacked.
#
#   powershell -ExecutionPolicy Bypass -File register-dev-host.ps1
#
# To undo: run unregister-dev-host.ps1 (or delete the two registry keys).

$ErrorActionPreference = "Stop"

$repoRoot   = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$backendSrc = Join-Path $repoRoot "backend\src"
$python     = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "py" }

$dir         = Join-Path $env:LOCALAPPDATA "AVS AI Shield\native_host_dev"
$manifest    = Join-Path $dir "com.avsshield.webshield.json"
$launcher    = Join-Path $dir "avs-native-host-dev.bat"
$extensionId = "cpcagcaoomclfhfdekidhfjfkiagfife"

New-Item -ItemType Directory -Force -Path $dir | Out-Null

# Chrome launches the manifest "path" directly — a .bat wrapper lets us
# set PYTHONPATH and use the dev interpreter.
$bat = "@echo off`r`nset `"PYTHONPATH=$backendSrc`"`r`n`"$python`" -m avs_backend.native_messaging.host`r`n"
Set-Content -Path $launcher -Value $bat -NoNewline -Encoding ASCII

$manifestJson = @{
  name            = "com.avsshield.webshield"
  description     = "AVS AI Shield Web Shield native messaging host (DEV)"
  path            = $launcher
  type            = "stdio"
  allowed_origins = @("chrome-extension://$extensionId/")
} | ConvertTo-Json -Depth 4
Set-Content -Path $manifest -Value $manifestJson -Encoding ASCII

foreach ($browser in @("Google\Chrome", "Microsoft\Edge")) {
  $key = "HKCU:\SOFTWARE\$browser\NativeMessagingHosts\com.avsshield.webshield"
  New-Item -Force -Path $key | Out-Null
  Set-ItemProperty -Path $key -Name "(Default)" -Value $manifest
}

Write-Host "Registered dev native host -> $manifest"
Write-Host "Python: $python"
Write-Host "Extension ID (load unpacked): $extensionId"
