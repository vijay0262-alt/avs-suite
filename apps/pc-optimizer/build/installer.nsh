!macro customInit
  ; Force-kill any lingering AVS AI Shield processes before the installer
  ; built-in "app is already running" check runs. Without this, users who
  ; closed the window (which only hides to tray, it does not quit the app)
  ; or who manually deleted the install folder without using the proper
  ; uninstaller can end up with a zombie process still alive in memory,
  ; causing "please close it manually and click retry" to loop forever
  ; even though the app appears fully removed.
  ;
  ; Also remove the autostart scheduled task so a stale task cannot
  ; relaunch the app while we are trying to install.

  ; 1. Delete the auto-elevate scheduled task (ignore errors)
  nsExec::ExecToLog 'schtasks /delete /tn "AVS_AI_Shield_Elevated" /f 2>nul'
  Pop $0

  ; 2. Force-kill the main app, Python backend, and ClamAV daemon
  nsExec::ExecToLog 'taskkill /IM "AVS AI Shield.exe" /T /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM "avs-backend.exe" /T /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM "clamd.exe" /T /F'
  Pop $0

  ; 3. Wait until the main process is gone. taskkill returns 0 when it
  ; kills a process and 128 when no matching process exists. Loop up to
  ; 5 times so the built-in "app is running" check does not race with
  ; the force-kill and produce a false-positive retry dialog.
  StrCpy $R1 0
  loop_check_init:
    nsExec::ExecToLog 'taskkill /IM "AVS AI Shield.exe" /T /F'
    Pop $0
    IntCmp $0 128 done_init done_init
    Sleep 1000
    IntOp $R1 $R1 + 1
    IntCmp $R1 5 done_init done_init loop_check_init
  done_init:
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
