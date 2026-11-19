# Removes the DEV native messaging host registration.
$host_ = "com.avsshield.webshield"
foreach ($browser in @("Google\Chrome", "Microsoft\Edge")) {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue `
    "HKCU:\SOFTWARE\$browser\NativeMessagingHosts\$host_"
}
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue `
  (Join-Path $env:LOCALAPPDATA "AVS AI Shield\native_host_dev")
Write-Host "Dev native host registration removed."
