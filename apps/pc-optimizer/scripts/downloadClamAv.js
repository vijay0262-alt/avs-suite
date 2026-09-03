/**
 * Download and extract ClamAV portable binaries for bundling in the installer.
 *
 * Downloads clamav-1.4.3.win.x64.zip from GitHub, extracts only the runtime
 * files (no PDB debug symbols, no .lib static libraries), and places them
 * in apps/pc-optimizer/resources/clamav/.
 *
 * Total size after stripping: ~90MB (vs 560MB with debug symbols).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const CLAMAV_VERSION = '1.4.3';
const CLAMAV_URL = `https://github.com/Cisco-Talos/clamav/releases/download/clamav-${CLAMAV_VERSION}/clamav-${CLAMAV_VERSION}.win.x64.zip`;
const RESOURCES_DIR = path.resolve(__dirname, '..', 'resources', 'clamav');
const ZIP_PATH = path.resolve(__dirname, '..', 'resources', 'clamav.zip');

// Files to exclude (debug symbols, static libs, docs)
const EXCLUDE_PATTERNS = ['.pdb', '.lib', 'NEWS.md', 'README.md', 'conf_examples', 'include', 'UserManual'];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ClamAV ${CLAMAV_VERSION} from ${url}...`);
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const total = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          process.stdout.write(`\r  ${Math.round((downloaded / total) * 100)}% (${(downloaded / 1048576).toFixed(1)}MB)`);
        }
      });
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function downloadAndExtractClamAv() {
  // Check if already exists
  if (fs.existsSync(path.join(RESOURCES_DIR, 'clamd.exe'))) {
    console.log('ClamAV binaries already present, skipping download.');
    return;
  }

  // Create resources directory
  fs.mkdirSync(path.dirname(RESOURCES_DIR), { recursive: true });

  // Download
  await downloadFile(CLAMAV_URL, ZIP_PATH);

  // Extract using PowerShell (cross-platform on Windows)
  console.log('Extracting ClamAV...');
  const tempDir = path.resolve(__dirname, '..', 'resources', 'clamav-tmp');
  fs.mkdirSync(tempDir, { recursive: true });
  execSync(`powershell -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${tempDir}' -Force"`, { stdio: 'inherit' });

  // Find the extracted directory (usually clamav-VERSION.win.x64)
  const entries = fs.readdirSync(tempDir);
  let srcDir = tempDir;
  const nestedDir = entries.find((e) => e.startsWith('clamav'));
  if (nestedDir) {
    srcDir = path.join(tempDir, nestedDir);
  }

  // Create final directory
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });

  // Copy only runtime files (exclude PDB, LIB, docs)
  console.log('Copying runtime files (stripping debug symbols)...');
  const files = fs.readdirSync(srcDir);
  let copied = 0;
  for (const file of files) {
    const shouldExclude = EXCLUDE_PATTERNS.some((p) => file.endsWith(p) || file === p);
    if (shouldExclude) continue;

    const src = path.join(srcDir, file);
    const dest = path.join(RESOURCES_DIR, file);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      copyDirSync(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
    copied++;
  }
  console.log(`  Copied ${copied} runtime files`);

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.unlinkSync(ZIP_PATH);

  // Download base virus definitions (main.cvd, daily.cvd, bytecode.cvd)
  // These are bundled so first scan works immediately without internet.
  // daily.cvd updates are fetched in background by freshclam after install.
  const dbDir = path.join(RESOURCES_DIR, 'db');
  fs.mkdirSync(dbDir, { recursive: true });

  const DEFS = [
    { name: 'main.cvd', url: 'https://database.clamav.net/main.cvd' },
    { name: 'daily.cvd', url: 'https://database.clamav.net/daily.cvd' },
    { name: 'bytecode.cvd', url: 'https://database.clamav.net/bytecode.cvd' },
  ];

  for (const def of DEFS) {
    const defPath = path.join(dbDir, def.name);
    if (fs.existsSync(defPath) && fs.statSync(defPath).size > 0) {
      console.log(`  ${def.name} already present, skipping.`);
      continue;
    }
    console.log(`  Downloading ${def.name}...`);
    await downloadFile(def.url, defPath);
  }

  // Calculate final size
  const totalSize = getTotalSize(RESOURCES_DIR);
  console.log(`ClamAV binaries + definitions ready: ${(totalSize / 1048576).toFixed(1)}MB at ${RESOURCES_DIR}`);
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getTotalSize(dir) {
  let total = 0;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      total += getTotalSize(fullPath);
    } else {
      total += stat.size;
    }
  }
  return total;
}

module.exports = { downloadAndExtractClamAv };
