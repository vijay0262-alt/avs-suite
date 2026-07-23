# AVS PC Optimizer — Installation Guide

**Version 1.0.0** | Build 1001

## System Requirements

| Requirement | Minimum | Recommended |
|------------|---------|-------------|
| OS | Windows 10 (64-bit) | Windows 11 (64-bit) |
| RAM | 2 GB | 4 GB or more |
| Disk Space | 200 MB | 500 MB |
| Screen | 1024×768 | 1920×1080 |
| Permissions | Administrator | Administrator |

## Installation Methods

### Method 1: NSIS Installer (Recommended)

1. Download `AVS PC Optimizer-Setup-1.0.0.exe` from the official website.
2. Right-click the installer and select **Run as administrator**.
3. Follow the installation wizard:
   - Accept the License Agreement
   - Choose installation directory (default: `C:\Users\<user>\AppData\Local\Programs\AVS PC Optimizer`)
   - Select Start Menu shortcut
   - Select Desktop shortcut
4. Click **Install** and wait for completion.
5. Click **Finish** to launch the application.

### Method 2: Portable

1. Download the portable ZIP package.
2. Extract to any folder.
3. Run `AVS PC Optimizer.exe` from the extracted folder.

## Post-Installation

### First Run

- The application will request administrator privileges for full functionality.
- The backend optimization engine starts automatically.
- The Dashboard displays system health within 30-60 seconds.

### Verification

1. Open the **About** page to verify version and build number.
2. Open the **Dashboard** to confirm metrics are loading.
3. Run a **Junk Cleaner** scan to verify backend connectivity.

## Uninstallation

### NSIS Install
1. Go to **Settings > Apps > Installed apps**
2. Find "AVS PC Optimizer"
3. Click **Uninstall**
4. Follow the uninstaller wizard

### Portable
Delete the extracted folder.

## Troubleshooting

### Backend not starting
- Check Task Manager for `avs-backend.exe` process
- Verify antivirus is not blocking the application
- Try running as administrator

### Dashboard metrics unavailable
- Wait 30-60 seconds for backend module loading
- Restart the application
- Check logs in `%APPDATA%\@avs\pc-optimizer\logs\`

### RPC timeout errors
- Ensure no other instance is running
- Check system resources (CPU/memory)

## Silent Installation (Enterprise)

```cmd
AVS PC Optimizer-Setup-1.0.0.exe /S /D=C:\Program Files\AVS PC Optimizer
```

- `/S` — Silent install (no UI)
- `/D` — Installation directory
