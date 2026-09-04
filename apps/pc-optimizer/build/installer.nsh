; ── Scheduled Task for Silent Elevation ─────────────────────────
; The app manifest uses asInvoker (no UAC on every launch). Instead,
; a Windows Scheduled Task with HIGHEST privileges runs the app elevated.
; The installer (already admin) creates this task so the user never sees
; a UAC prompt after installation. The app also creates this task on
; first launch if it doesn't exist (one-time UAC prompt for portable builds).

!define ELEVATION_TASK_NAME "AVS_AI_Shield_Elevated"

!macro customInstall
  ; Create scheduled task with HIGHEST privilege level so the app
  ; always runs with admin access without repeated UAC prompts.
  ; /sc ONLOGON also auto-starts the app on user logon (expected for security software).
  nsExec::ExecToLog 'schtasks /create /tn "${ELEVATION_TASK_NAME}" /tr "$INSTDIR\AVS AI Shield.exe" /sc ONLOGON /rl HIGHEST /f'
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
  ; Remove the elevation scheduled task
  nsExec::ExecToLog 'schtasks /delete /tn "${ELEVATION_TASK_NAME}" /f'
  Pop $0
!macroend
