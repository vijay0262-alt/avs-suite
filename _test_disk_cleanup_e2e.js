/**
 * V1.0 Disk Cleanup+ — Packaged E2E test
 *
 * Launches the packaged backend and exercises the full Dashboard workflow:
 *   SCAN → DETECT → CLEAN AUTOMATICALLY → VERIFY → SHOW RESULTS
 *
 * The backend communicates via JSON-RPC over stdin/stdout (line-delimited).
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND_PATH = path.join(
  __dirname,
  'apps', 'pc-optimizer', 'release', 'win-unpacked', 'resources', 'backend', 'avs-backend.exe'
);

const METADATA_DB = path.join(
  process.env.LOCALAPPDATA || '', 'AVS Shield', 'metadata.db'
);

let backendProc = null;
let msgId = 0;
const pending = new Map();
let buffer = '';

function sendRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const req = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    pending.set(id, { resolve, reject });
    backendProc.stdin.write(req + '\n');
  });
}

function handleData(data) {
  buffer += data.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    // Skip non-JSON log lines
    if (!line.startsWith('{')) continue;
    try {
      const json = JSON.parse(line);
      if (json.id && pending.has(json.id)) {
        const { resolve, reject } = pending.get(json.id);
        pending.delete(json.id);
        if (json.error) reject(new Error(JSON.stringify(json.error)));
        else resolve(json.result);
      }
    } catch (e) {
      // Not a JSON-RPC response, ignore
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollStatus(method, params, maxPolls = 400, intervalMs = 2000) {
  for (let i = 1; i <= maxPolls; i++) {
    const status = await sendRequest(method, params);
    const progressObj = status.progress;
    const isProgressDict = typeof progressObj === 'object' && progressObj !== null;
    const phase = status.phase || (isProgressDict ? progressObj.phase : '') || 'unknown';
    const progressVal = isProgressDict ? progressObj.completion_percent : status.progress;
    const discovered = isProgressDict ? progressObj.assets_discovered : status.discovered;
    const findings = isProgressDict ? progressObj.findings : status.findings;

    process.stdout.write(`  Poll ${i}: ${progressVal}% | phase=${phase}`);
    if (discovered !== undefined) process.stdout.write(` | discovered=${discovered}`);
    if (findings !== undefined) process.stdout.write(` | findings=${findings}`);
    if (status.executed !== undefined) process.stdout.write(` | exec=${status.executed}/${status.total_actions || status.total || '?'}`);
    process.stdout.write('\n');

    if (status.completed || phase === 'complete' || phase === 'completed' || phase === 'error' || phase === 'cancelled') {
      return status;
    }
    await sleep(intervalMs);
  }
  throw new Error('Polling timed out');
}

async function main() {
  console.log('Starting packaged backend:', BACKEND_PATH);

  // Delete metadata DB for fresh scan
  try { fs.unlinkSync(METADATA_DB); } catch (e) {}

  // Start backend (stdin/stdout JSON-RPC)
  backendProc = spawn(BACKEND_PATH, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  backendProc.stdout.on('data', handleData);
  backendProc.stderr.on('data', (data) => {
    const text = data.toString();
    if (text.includes('ERROR') || text.includes('error') || text.includes('Failed')) {
      process.stderr.write(`[backend stderr] ${text}`);
    }
  });

  backendProc.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
  });

  try {
    // 1. Ping
    console.log('\n=== 1. system.ping ===');
    const ping = await sendRequest('system.ping');
    console.log('Ping:', JSON.stringify(ping), '\n');

    // 2. Start quick scan (V1.0 Dashboard mode) — retry until engine is ready
    // The scan engine initializes lazily and DB creation can take 60s+.
    console.log('=== 2. scan_core.scan.quick (V1.0 Dashboard mode) ===');
    const scanStart = Date.now();
    let scanResult = null;
    let sessionId = null;
    for (let attempt = 1; attempt <= 60; attempt++) {
      scanResult = await sendRequest('scan_core.scan.quick', {});
      if (scanResult.ok && scanResult.session_id) {
        sessionId = scanResult.session_id;
        break;
      }
      if (attempt === 1 || attempt % 10 === 0) {
        console.log(`  Attempt ${attempt}: ${scanResult.error || 'failed'}, retrying...`);
      }
      await sleep(2000);
    }
    if (!sessionId) {
      throw new Error('Failed to start scan after 120s: ' + JSON.stringify(scanResult));
    }
    console.log('Scan started:', JSON.stringify(scanResult), '\n');

    // 3. Poll scan status
    console.log('=== 3. Polling scan status ===');
    const scanStatus = await pollStatus(
      'scan_core.scan.status',
      { session_id: sessionId }, 400, 2000
    );
    const scanDuration = ((Date.now() - scanStart) / 1000).toFixed(1);
    console.log(`\nScan completed in ${scanDuration}s\n`);

    // 4. Get scan result
    console.log('=== 4. scan_core.scan.result ===');
    const scanRes = await sendRequest('scan_core.scan.result', { session_id: sessionId });
    const result = scanRes.result || scanRes;
    const planId = result.plan_id || result.action_plan_id;
    console.log('  plan_id:', planId);
    console.log('  assets_discovered:', result.assets_discovered || result.statistics?.assets_discovered);
    console.log('  findings_count (V1.0 safe only):', result.findings_count);
    console.log('  actions_planned:', result.actions_planned);
    console.log('  actions_review_required:', result.actions_review_required);
    console.log('  actions_blocked:', result.actions_blocked);
    console.log('  dashboard_excluded_count:', result.dashboard_excluded_count);
    console.log('  actionability_summary:', JSON.stringify(result.actionability_summary || {}).substring(0, 200));
    console.log('');

    // 5. Start auto-optimize
    console.log('=== 5. scan_core.dashboard.auto_optimize ===');
    const optStart = Date.now();
    const optResult = await sendRequest('scan_core.dashboard.auto_optimize', {
      plan_id: planId,
      mode: 'live',
    });
    const optSessionId = optResult.session_id;
    console.log('Auto-optimize started:', JSON.stringify(optResult), '\n');

    // 6. Poll auto-optimize status
    console.log('=== 6. Polling auto-optimize status ===');
    const optStatus = await pollStatus(
      'scan_core.dashboard.auto_optimize_status',
      { session_id: optSessionId }, 400, 2000
    );
    const optDuration = ((Date.now() - optStart) / 1000).toFixed(1);
    console.log(`\nAuto-optimize completed in ${optDuration}s\n`);

    // 7. Get final result
    console.log('=== 7. Final Results ===');
    const r = optStatus.result || {};
    const totalDuration = ((Date.now() - scanStart) / 1000).toFixed(1);

    console.log('========================================');
    console.log('  V1.0 DISK CLEANUP+ E2E — FINAL RESULTS');
    console.log('========================================\n');

    console.log('── User-facing fields ──');
    console.log('Detected:', r.detected);
    console.log('Cleaned:', r.cleaned);
    console.log('Remaining:', r.remaining);
    console.log('Failed:', r.failed);
    console.log('Space recovered (bytes):', r.space_recovered);
    const mb = r.space_recovered ? (r.space_recovered / 1024 / 1024).toFixed(1) : '0';
    console.log(`Space recovered (formatted): ${mb} MB`);
    console.log('Health before:', r.health_before);
    console.log('Health after:', r.health_after);

    if (r._diagnostics) {
      console.log('\n── Internal diagnostics (NOT shown to user) ──');
      console.log('Total actions:', r._diagnostics.total);
      console.log('Rejected by SafetyGate:', r._diagnostics.rejected);
      console.log('Skipped:', r._diagnostics.skipped);
      console.log('Requires review (input):', r._diagnostics.requires_review);
      console.log('Review required input:', r._diagnostics.review_required_input);
      console.log('Blocked input:', r._diagnostics.blocked_input);

      if (r._diagnostics.failed_details && r._diagnostics.failed_details.length > 0) {
        console.log('\n── Failed action details (internal) ──');
        console.log('Count:', r._diagnostics.failed_details.length);
        for (let i = 0; i < Math.min(10, r._diagnostics.failed_details.length); i++) {
          const f = r._diagnostics.failed_details[i];
          console.log(`  [${i+1}] reason=${f.reason}`);
          console.log(`      existed_before=${f.existed_before} | existed_after=${f.existed_after} | locked_before=${f.locked_before}`);
        }
      }
    }

    console.log('\n── Acceptance check ──');
    const detected = r.detected || 0;
    const cleaned = r.cleaned || 0;
    const failed = r.failed || 0;
    const remaining = r.remaining || 0;
    console.log(`detected (${detected}) >= cleaned (${cleaned}):`, detected >= cleaned);
    console.log(`detected - cleaned (${detected - cleaned}) ≈ remaining + failed (${remaining + failed}):`,
      Math.abs((detected - cleaned) - (remaining + failed)) <= 1);
    console.log('failed close to zero:', failed <= Math.max(5, detected * 0.05));
    console.log('detected ≈ cleaned:', detected > 0 && Math.abs(detected - cleaned) <= Math.max(5, detected * 0.05));

    console.log('\n── Performance ──');
    console.log(`Scan duration (s): ${scanDuration}`);
    console.log(`Auto-optimize duration (s): ${optDuration}`);
    console.log(`Total workflow (s): ${totalDuration}`);

    console.log('\n========================================');
    console.log('  V1.0 DISK CLEANUP+ E2E TEST COMPLETE');
    console.log('========================================\n');

  } catch (err) {
    console.error('ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    if (backendProc) {
      try { backendProc.kill(); } catch (e) {}
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  if (backendProc) backendProc.kill();
  process.exit(1);
});
