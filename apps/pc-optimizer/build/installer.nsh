!macro _KillAppProcesses _ID
  ; Kill all known AVS AI Shield processes (main app, backend, ClamAV)
  nsExec::ExecToLog 'taskkill /IM "AVS AI Shield.exe" /T /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM "avs-backend.exe" /T /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM "clamd.exe" /T /F'
  Pop $0
  ; Also kill via wmic for cases where the process name is truncated or
  ; an older binary is still running under a different image name.
  nsExec::ExecToLog 'wmic process where "name like ''%AVS%''" delete 2>nul'
  Pop $0
  ; Wait up to 5s until the main executable is truly gone.
  StrCpy $R1 0
  avs_loop_${_ID}:
    nsExec::ExecToLog 'taskkill /IM "AVS AI Shield.exe" /T /F'
    Pop $0
    IntCmp $0 128 avs_done_${_ID} avs_loop_${_ID}
    Sleep 1000
    IntOp $R1 $R1 + 1
    IntCmp $R1 5 avs_done_${_ID} avs_loop_${_ID} avs_done_${_ID}
  avs_done_${_ID}:
!macroend

!macro _DeleteScheduledTasks
  ; Remove the auto-elevate scheduled task so a stale task cannot
  ; relaunch the app while we are trying to install.
  nsExec::ExecToLog 'schtasks /delete /tn "AVS_AI_Shield_Elevated" /f 2>nul'
  Pop $0
  ; Remove any other potential scheduled tasks
  nsExec::ExecToLog 'schtasks /delete /tn "AVS AI Shield" /f 2>nul'
  Pop $0
  nsExec::ExecToLog 'schtasks /delete /tn "AVS AI Shield Update" /f 2>nul'
  Pop $0
!macroend

!macro customInit
  ; Force-kill any lingering AVS AI Shield processes before the installer
  ; pages are shown. Also remove any scheduled auto-elevate task.
  !insertmacro _DeleteScheduledTasks
  !insertmacro _KillAppProcesses init
!macroend

!macro customInstall
  ; Re-run the kill sequence right before copying files. Some AVS processes
  ; survive the initial kill (single-instance lock, background backend, or
  ; a scheduled task relaunching the app) and the built-in "app is running"
  ; check would otherwise prompt the user. This catches them before the
  ; actual file-copy/install section runs.
  !insertmacro _DeleteScheduledTasks
  !insertmacro _KillAppProcesses install
!macroend

!macro customUnInstall
  ; Notify the license server that this device is being uninstalled.
  ; The app writes %APPDATA%\AVS AI Shield\uninstall.json on sync with
  ; the device fingerprint, per-device uninstall token, and API URL.
  nsExec::ExecToLog "powershell -NoProfile -Command $\"try { $$p = Join-Path $$env:APPDATA 'AVS AI Shield\uninstall.json'; if (Test-Path $$p) { $$j = Get-Content $$p | ConvertFrom-Json; Invoke-RestMethod -Method Post -Uri ($$j.api_url + '/api/customer/device/uninstall-public') -Body (@{device_fingerprint=$$j.device_fingerprint; uninstall_token=$$j.uninstall_token} | ConvertTo-Json) -ContentType 'application/json' -TimeoutSec 10 } } catch {}$\""
  Pop $0
  ; Kill the running AVS AI Shield process before uninstalling.
  ; Without this, the app stays in the system tray and files are locked.
  ; Try graceful close first, then force kill after 3 seconds.
  nsExec::ExecToLog 'taskkill /IM "AVS AI Shield.exe" /T'
  Pop $0
  ; Wait briefly for graceful shutdown
  Sleep 3000
  ; Force kill if still running
  nsExec::ExecToLog 'taskkill /IM "AVS AI Shield.exe" /T /F'
  Pop $0
  ; Also kill any lingering backend processes spawned by the app
  nsExec::ExecToLog 'taskkill /IM "avs-backend.exe" /T /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM "clamd.exe" /T /F'
  Pop $0
  ; Remove the auto-elevate scheduled task to avoid a stale task relaunching
  ; the app after the install directory has been removed.
  nsExec::ExecToLog 'schtasks /delete /tn "AVS_AI_Shield_Elevated" /f 2>nul'
  Pop $0
!macroend

!macro customCheckAppRunning
  ; Override the default "app is running" check. The default NSIS logic
  ; shows a Retry/Cancel dialog if the executable is still in the process
  ; list, but AVS processes can take a few seconds to fully exit. Kill all
  ; known AVS/ClamAV/backend processes and remove any scheduled task that
  ; might relaunch them, then let the OS flush handles before continuing.
  !insertmacro _DeleteScheduledTasks
  !insertmacro _KillAppProcesses check
  Sleep 2000
!macroend

!macro customUnInit
  ; The uninstaller needs all AVS processes dead before it tries to remove
  ; the install directory. Otherwise backend/ClamAV child processes can keep
  ; files locked and the uninstaller leaves the folder behind.
  !insertmacro _DeleteScheduledTasks
  !insertmacro _KillAppProcesses uninit
!macroend
