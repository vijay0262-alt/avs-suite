# AVS Suite

AVS Suite — monorepo hosting AVS PC Optimizer, Security, Driver Updater, File Recovery, and VPN products.

## Development Environment Setup

This guide covers setting up a Windows development environment for AVS Suite.

### Prerequisites

Before starting, ensure you have the following installed:

- **Node.js** (18.18.0 or later) - [Download](https://nodejs.org/)
- **Yarn** (1.22.0 or later) - Install via `npm install -g yarn`
- **Python** (3.8 or later) - [Download](https://www.python.org/downloads/)
- **Git** - [Download](https://git-scm.com/downloads)
- **PyInstaller** - Install via `pip install pyinstaller`

### Quick Setup Check

Run the doctor script to verify your development environment:

```bash
yarn doctor
```

This will check for all required dependencies and provide installation instructions for any missing tools.

### Windows-Specific Setup

#### PowerShell Execution Policy

On Windows, you may need to adjust the PowerShell execution policy to allow running Yarn scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

To verify the current policy:

```powershell
Get-ExecutionPolicy
```

If the policy is `Restricted`, `Undefined`, or `AllSigned`, you need to change it to `RemoteSigned` or `Unrestricted` for development.

### Installation Steps

1. **Clone the repository**

```bash
git clone https://github.com/your-org/avs-suite.git
cd avs-suite
```

2. **Install dependencies**

```bash
yarn install
```

3. **Install Python backend dependencies**

```bash
yarn backend:install
```

4. **Verify environment**

```bash
yarn doctor
```

### Development Commands

- `yarn doctor` - Check development environment
- `yarn dev:pc-optimizer` - Start PC Optimizer in development mode
- `yarn build:pc-optimizer` - Build PC Optimizer
- `yarn package:pc-optimizer` - Package PC Optimizer for distribution
- `yarn lint` - Run ESLint
- `yarn typecheck` - Run TypeScript type checking
- `yarn test` - Run unit tests
- `yarn backend:test` - Run Python backend tests

### Building for Production

To build the PC Optimizer installer and portable executable:

```bash
# Build NSIS installer only
yarn workspace @avs/pc-optimizer package:installer

# Build portable executable only
yarn workspace @avs/pc-optimizer package:portable

# Build both installer and portable
yarn workspace @avs/pc-optimizer package:all
```

Build artifacts will be placed in `apps/pc-optimizer/release/`.

### Troubleshooting

#### Yarn scripts fail with "running scripts is disabled"

This is a PowerShell execution policy issue. Run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

#### Python not found

Ensure Python is installed and added to your PATH. You may need to restart your terminal after installation.

#### PyInstaller not found

Install PyInstaller using pip:

```bash
pip install pyinstaller
```

#### Node.js version too old

Update Node.js to version 18.18.0 or later from [nodejs.org](https://nodejs.org/).

### CI/CD

The CI pipeline runs the following checks:

- Linting (ESLint)
- Type checking (TypeScript)
- Unit tests (Vitest)
- Backend tests (pytest)

The CI environment is pre-configured with all required tools. Local development environment issues (missing tools) will not cause CI failures for code/test issues.

### License

UNLICENSED - Copyright © 2024 Advanced Vision Software LLC. All rights reserved.

