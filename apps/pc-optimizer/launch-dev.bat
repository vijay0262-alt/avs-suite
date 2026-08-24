@echo off
set AVS_ENV=development
set ELECTRON_RUN_AS_NODE=
set AVS_NO_ELEVATE=1
cd /d "C:\Users\HPBP\Documents\GitHub\avs-suite\apps\pc-optimizer"
start "AVS Shield" "C:\Users\HPBP\Documents\GitHub\avs-suite\node_modules\electron\dist\electron.exe" "C:\Users\HPBP\Documents\GitHub\avs-suite\apps\pc-optimizer"
