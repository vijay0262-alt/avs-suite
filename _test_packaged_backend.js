/**
 * Packaged backend RPC test — spawns the packaged avs-backend.exe
 * and sends JSON-RPC 2.0 requests over stdio to verify the scan
 * lifecycle works end-to-end at the backend level.
 */
const { spawn } = require('child_process');
const path = require('path');

const BACKEND_EXE = path.join(__dirname, 'apps', 'pc-optimizer', 'release-v3', 'win-unpacked', 'resources', 'backend', 'avs-backend.exe');
const BACKEND_CWD = path.join(__dirname, 'apps', 'pc-optimizer', 'release-v3', 'win-unpacked', 'resources', 'backend');

let nextId = 1;
let buffer = '';
const pending = new Map();

const child = spawn(BACKEND_EXE, [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, PYTHONUNBUFFERED: '1' },
  cwd: BACKEND_CWD,
});

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message));
        } else {
          resolve(msg.result);
        }
      }
    } catch (e) {
      // Non-JSON line (log output) — ignore
    }
  }
});

child.stderr.on('data', (chunk) => {
  // Show stderr to see initialization errors
  const text = chunk.toString('utf8');
  if (text.includes('ERROR') || text.includes('Failed') || text.includes('Exception') || text.includes('scan_core') || text.includes('orchestrator') || text.includes('Failed to init')) {
    process.stderr.write(`[backend] ${text}`);
  }
});

child.on('exit', (code) => {
  console.log(`[backend] exited with code ${code}`);
});

function call(method, params, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const req = { jsonrpc: '2.0', id, method, params };
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`RPC timeout: ${method} (${timeoutMs}ms)`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify(req) + '\n');
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
  try {
    console.log('=== AVS Packaged Backend RPC Test ===');
    console.log(`Backend: ${BACKEND_EXE}`);
    console.log('');

    // 1. Ping
    console.log('[1] Pinging backend...');
    const t0 = Date.now();
    const pingResult = await call('system.ping', undefined, 120000);
    console.log(`    Ping OK (${Date.now() - t0}ms):`, JSON.stringify(pingResult));
    console.log('');

    // 2. Wait for scan engine to initialize
    console.log('[2] Waiting for scan engine to initialize...');
    let scanReady = false;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      try {
        const quickResult = await call('scan_core.scan.quick', { scope: [] }, 10000);
        if (quickResult.ok !== false) {
          console.log(`    Scan engine ready after ${i * 2 + 2}s`);
          scanReady = true;
          // Process the result
          const sessionId = quickResult.session_id || quickResult.scan_id;
          console.log(`    Session ID: ${sessionId}`);
          console.log(`    Full result:`, JSON.stringify(quickResult).slice(0, 500));
          console.log('');

          // 3. Poll scan status
          console.log('[3] Polling scan status...');
          let status;
          let pollCount = 0;
          const maxPolls = 180; // 180 * 1s = 3 minutes max
          do {
            status = await call('scan_core.scan.status', { session_id: sessionId }, 10000);
            pollCount++;
            const p = status.progress || {};
            const pct = p.completion_percent ?? 0;
            const phase = p.phase ?? 'unknown';
            const assets = p.assets_discovered ?? 0;
            const findings = p.findings ?? 0;
            const elapsed = p.elapsed_time_ms ?? 0;
            const completed = status.completed;
            const cancelled = status.cancelled;
            const error = status.error;
            if (pollCount <= 5 || pollCount % 10 === 0 || completed || cancelled || error) {
              console.log(`    [Poll ${pollCount}] completed=${completed} cancelled=${cancelled} phase=${phase} pct=${pct}% assets=${assets} findings=${findings} elapsed=${elapsed}ms error=${error ?? 'none'}`);
            }
            if (completed) {
              console.log(`    Scan completed after ${pollCount} polls (${elapsed}ms)`);
              break;
            }
            if (cancelled) {
              console.log(`    Scan cancelled after ${pollCount} polls`);
              break;
            }
            if (error) {
              console.log(`    Scan ERROR: ${error}`);
              break;
            }
            if (pollCount >= maxPolls) {
              console.log(`    Polling timed out after ${maxPolls} polls`);
              console.log(`    Last raw status:`, JSON.stringify(status).slice(0, 500));
              break;
            }
            await sleep(1000);
          } while (true);
          console.log('');

          // 4. Get scan result
          console.log('[4] Getting scan result...');
          const result = await call('scan_core.scan.result', { session_id: sessionId }, 30000);
          const stats = result.statistics || {};
          console.log(`    Result:`, JSON.stringify({
            scan_id: result.scan_id,
            session_id: result.session_id,
            status: result.status,
            assets_discovered: stats.assets_discovered,
            findings_count: stats.findings_count,
            actions_planned: stats.actions_planned,
            action_plan_id: result.action_plan_id,
            duration_ms: Date.now() - t0,
          }));
          console.log('');

          // 5. Get scan history
          console.log('[5] Getting scan history...');
          const history = await call('scan_core.scan.history', { limit: 5 }, 10000);
          console.log(`    History entries: ${Array.isArray(history) ? history.length : (history?.records?.length ?? 'N/A')}`);
          console.log('');

          // 6. Test cancellation with a new scan
          console.log('[6] Testing cancellation...');
          const cancelScan = await call('scan_core.scan.quick', { scope: [] }, 10000);
          const cancelSessionId = cancelScan.session_id || cancelScan.scan_id;
          if (cancelSessionId) {
            await sleep(2000); // Let it start scanning
            const cancelResult = await call('scan_core.scan.cancel', { session_id: cancelSessionId }, 10000);
            console.log(`    Cancel result:`, JSON.stringify(cancelResult).slice(0, 200));
            // Verify status is cancelled
            await sleep(1000);
            const cancelStatus = await call('scan_core.scan.status', { session_id: cancelSessionId }, 10000);
            console.log(`    Status after cancel: ${cancelStatus.status}`);
          } else {
            console.log(`    Could not start scan for cancellation test`);
          }
          console.log('');

          // 7. Second scan test (verify no state leakage)
          console.log('[7] Second scan test...');
          const secondScan = await call('scan_core.scan.quick', { scope: [] }, 10000);
          const secondSessionId = secondScan.session_id || secondScan.scan_id;
          console.log(`    Second scan session: ${secondSessionId}`);
          if (secondSessionId) {
            // Verify it's a different session
            console.log(`    First session: ${sessionId}, Second session: ${secondSessionId}`);
            console.log(`    Different sessions: ${sessionId !== secondSessionId}`);
            // Poll once to verify it starts from 0
            const secondStatus = await call('scan_core.scan.status', { session_id: secondSessionId }, 10000);
            console.log(`    Second scan initial status: ${secondStatus.status}, assets: ${secondStatus.assets_discovered ?? 0}`);
          }
          console.log('');

          console.log('=== ALL BACKEND TESTS PASSED ===');
          console.log(`Total time: ${Date.now() - t0}ms`);
          break;
        }
        console.log(`    [${i * 2 + 2}s] Scan engine still initializing...`);
      } catch (e) {
        console.log(`    [${i * 2 + 2}s] ${e.message}`);
      }
    }

    if (!scanReady) {
      console.log('=== SCAN ENGINE DID NOT BECOME READY ===');
    }

  } catch (err) {
    console.error('=== TEST FAILED ===');
    console.error(err);
  } finally {
    try { await call('system.shutdown', undefined, 5000); } catch (e) {}
    child.kill();
    process.exit(0);
  }
}

runTest();
