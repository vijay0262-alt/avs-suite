#!/usr/bin/env node

/**
 * Development Environment Doctor
 * 
 * Checks for required development dependencies and provides installation
 * instructions for missing tools.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHECKS = [
  {
    name: 'Node.js',
    check: () => checkCommand('node --version'),
    install: 'Download and install from https://nodejs.org/ (LTS version recommended)',
    required: true,
  },
  {
    name: 'Yarn',
    check: () => checkCommand('yarn --version'),
    install: 'Run: npm install -g yarn',
    required: true,
  },
  {
    name: 'Python',
    check: () => checkCommand('python --version') || checkCommand('python3 --version'),
    install: 'Download and install from https://www.python.org/downloads/ (Python 3.8+ recommended)',
    required: true,
  },
  {
    name: 'pip',
    check: () => checkCommand('pip --version') || checkCommand('pip3 --version'),
    install: 'Pip is included with Python. Reinstall Python if missing.',
    required: true,
  },
  {
    name: 'PyInstaller',
    check: () => checkCommand('pyinstaller --version'),
    install: 'Run: pip install pyinstaller',
    required: false,
  },
  {
    name: 'Git',
    check: () => checkCommand('git --version'),
    install: 'Download and install from https://git-scm.com/downloads',
    required: true,
  },
];

function checkCommand(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

function checkPowerShellExecutionPolicy() {
  if (process.platform !== 'win32') {
    return { ok: true, message: 'Not applicable on non-Windows platforms' };
  }

  try {
    const policy = execSync('powershell -Command "Get-ExecutionPolicy"', { encoding: 'utf-8' }).trim();
    const restrictedPolicies = ['Restricted', 'Undefined', 'AllSigned'];
    
    if (restrictedPolicies.includes(policy)) {
      return {
        ok: false,
        message: policy,
        fix: 'Run: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned',
      };
    }
    
    return { ok: true, message: policy };
  } catch (error) {
    return { ok: false, message: 'Unknown', fix: 'Run: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned' };
  }
}

function printHeader(text) {
  console.log('\n' + '='.repeat(60));
  console.log(text);
  console.log('='.repeat(60));
}

function printCheck(name, ok, install = null) {
  const symbol = ok ? '✓' : '✗';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  
  console.log(`${color}${symbol}${reset} ${name}`);
  
  if (!ok && install) {
    console.log(`  → ${install}`);
  }
}

function main() {
  printHeader('Development Environment Check');
  
  let allRequired = true;
  let missingOptional = [];
  
  // Check all dependencies
  CHECKS.forEach(({ name, check, install, required }) => {
    const ok = check();
    
    if (!ok && required) {
      allRequired = false;
    } else if (!ok && !required) {
      missingOptional.push(name);
    }
    
    printCheck(name, ok, install);
  });
  
  // Check PowerShell Execution Policy on Windows
  if (process.platform === 'win32') {
    console.log('\nPowerShell Execution Policy:');
    const psCheck = checkPowerShellExecutionPolicy();
    const symbol = psCheck.ok ? '✓' : '✗';
    const color = psCheck.ok ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    
    console.log(`${color}${symbol}${reset} Execution Policy: ${psCheck.message}`);
    
    if (!psCheck.ok && psCheck.fix) {
      console.log(`  → ${psCheck.fix}`);
      allRequired = false;
    }
  }
  
  // Summary
  printHeader('Summary');
  
  if (allRequired && missingOptional.length === 0) {
    console.log('\x1b[32m✓ All required dependencies are installed!\x1b[0m');
    console.log('Your development environment is ready.');
  } else if (allRequired) {
    console.log('\x1b[33m⚠ All required dependencies are installed, but optional tools are missing:\x1b[0m');
    missingOptional.forEach(name => {
      const check = CHECKS.find(c => c.name === name);
      console.log(`  - ${name}: ${check.install}`);
    });
  } else {
    console.log('\x1b[31m✗ Some required dependencies are missing.\x1b[0m');
    console.log('Please install the missing tools above before continuing.');
    process.exit(1);
  }
  
  console.log('\n');
}

main();
