!macro _KillAppProcesses
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
  loop_check:
    nsExec::ExecToLog 'taskkill /IM "AVS AI Shield.exe" /T /F'
    Pop $0
    IntCmp $0 128 done_check done_check
    Sleep 1000
    IntOp $R1 $R1 + 1
    IntCmp $R1 5 done_check done_check loop_check
  done_check:
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
  !insertmacro _KillAppProcesses
!macroend

!macro customInstall
  ; Re-run the kill sequence right before copying files. Some AVS processes
  ; survive the initial kill (single-instance lock, background backend, or
  ; a scheduled task relaunching the app) and the built-in "app is running"
  ; check would otherwise prompt the user. This catches them before the
  ; actual file-copy/install section runs.
  !insertmacro _DeleteScheduledTasks
  !insertmacro _KillAppProcesses
!macroend

!macro customUnInstall
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
