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

function downloadFile(url, dest, { label } = {}) {
  return new Promise((resolve, reject) => {
    const displayName = label || `ClamAV ${CLAMAV_VERSION}`;
    console.log(`Downloading ${displayName} from ${url}...`);

    // Resolve redirects FIRST, then create the file stream.
    // This avoids a file-lock bug where multiple write streams open the same file.
    const options = {
      headers: {
        'User-Agent': 'AVS-AI-Shield/1.0 (https://avsshield.com)',
      },
    };

    https.get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        // Follow redirect — don't create file stream yet
        response.resume(); // drain the redirect response
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error(`Redirect with no Location header (HTTP ${response.statusCode})`));
          return;
        }
        downloadFile(redirectUrl, dest, { label }).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      // Now create the file stream (only after all redirects are resolved)
      const file = fs.createWriteStream(dest);
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
        file.close(() => {
          console.log('');
          resolve();
        });
      });
      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
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

  // Brief pause to ensure the file handle is fully released by the OS
  await new Promise((r) => setTimeout(r, 500));

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
    { name: 'main.cvd', urls: ['https://database.clamav.net/main.cvd', 'https://www.clamav.net/downloads/main.cvd'] },
    { name: 'daily.cvd', urls: ['https://database.clamav.net/daily.cvd', 'https://www.clamav.net/downloads/daily.cvd'] },
    { name: 'bytecode.cvd', urls: ['https://database.clamav.net/bytecode.cvd', 'https://www.clamav.net/downloads/bytecode.cvd'] },
  ];

  for (const def of DEFS) {
    const defPath = path.join(dbDir, def.name);
    if (fs.existsSync(defPath) && fs.statSync(defPath).size > 0) {
      console.log(`  ${def.name} already present, skipping.`);
      continue;
    }
    let downloaded = false;
    for (const url of def.urls) {
      // Try up to 2 times per URL
      for (let attempt = 1; attempt <= 2 && !downloaded; attempt++) {
        console.log(`  Downloading ${def.name} (attempt ${attempt}) from ${url}...`);
        try {
          await downloadFile(url, defPath, { label: def.name });
          downloaded = true;
          console.log(`  ${def.name} downloaded successfully.`);
        } catch (err) {
          console.log(`  WARNING: Attempt ${attempt} failed for ${def.name}: ${err.message}`);
          if (fs.existsSync(defPath)) {
            fs.unlinkSync(defPath);
          }
        }
      }
      if (downloaded) break;
    }
    if (!downloaded) {
      // CVD download failures are non-fatal — freshclam will fetch them at runtime.
      console.log(`  WARNING: All download attempts failed for ${def.name}.`);
      console.log(`  Definitions will be fetched by freshclam on first scan.`);
    }
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
