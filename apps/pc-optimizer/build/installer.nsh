!macro customInit
  ; Force-kill any lingering AVS AI Shield processes before the installer's
  ; built-in "app is already running" check runs. Without this, users who
  ; closed the window (which only hides to tray, it does not quit the app)
  ; or who manually deleted the install folder without using the proper
  ; uninstaller can end up with a zombie process still alive in memory,
  ; causing "please close it manually and click retry" to loop forever
  ; even though the app appears fully removed.
  nsExec::ExecToLog 'taskkill /IM "AVS AI Shield.exe" /T /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM "avs-backend.exe" /T /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM "clamd.exe" /T /F'
  Pop $0
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
!macroend
