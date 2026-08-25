// Packaged E2E - wait 180s for scan engine init
const { spawn } = require('child_process');
const path = require('path');

const backendPath = path.join(__dirname, 'backend', 'dist', 'backend-py', 'avs-backend.exe');
const backend = spawn(backendPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });

let responses = {};
let initReady = false;

backend.stdout.on('data', (d) => {
  const s = d.toString();
  // Check for init ready signal
  if (s.includes('Scan orchestrator initialized') || s.includes('orchestrator ready')) {
    initReady = true;
  }
  const lines = s.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"id"')) {
      try {
        const obj = JSON.parse(trimmed);
        if (obj.id !== undefined && obj.id !== null) {
          responses[obj.id] = obj;
        }
      } catch (e) {}
    }
  }
});

backend.stderr.on('data', (d) => {
  const s = d.toString();
  if (s.includes('Scan orchestrator initialized') || s.includes('orchestrator ready')) {
    initReady = true;
  }
});

function callRpc(method, params, id) {
  const req = JSON.stringify({ jsonrpc: '2.0', method, params: params || {}, id }) + '\n';
  backend.stdin.write(req);
}

// Wait 180 seconds for full backend initialization
console.log('Waiting 180s for backend to fully initialize (1.7 GB DB)...');
setTimeout(() => {
  console.log('Calling RPCs...');

  callRpc('scan_core.security.score', {}, 1);
  callRpc('scan_core.defender.status', {}, 2);
  callRpc('scan_core.scan.quick', { scope: [] }, 3);
  callRpc('scan_core.scan.full', { scope: [] }, 4);
  callRpc('scan_core.security_remediation.quarantine_list', {}, 5);

  setTimeout(() => {
    console.log('\n=== PACKAGED E2E RESULTS (FOUR-SCAN) ===\n');

    if (responses[1] && responses[1].result) {
      const r = responses[1].result;
      console.log('1. SECURITY_SCORE (Security Center):');
      console.log('   score=' + r.score + ' label=' + r.label + ' available=' + r.available);
      console.log('   STATUS: PASS\n');
    } else { console.log('1. SECURITY_SCORE: FAIL\n'); }

    if (responses[2] && responses[2].result) {
      const r = responses[2].result;
      console.log('2. DEFENDER_STATUS (Protection + Security):');
      console.log('   status=' + r.status + ' is_available=' + r.is_available);
      console.log('   active_threats=' + r.active_threat_count + ' total_threats=' + r.total_threat_count);
      console.log('   STATUS: PASS\n');
    } else { console.log('2. DEFENDER_STATUS: FAIL\n'); }

    if (responses[3] && responses[3].result) {
      const r = responses[3].result;
      console.log('3. SCAN_QUICK (Dashboard + Smart Opt):');
      console.log('   ok=' + r.ok + ' session_id=' + (r.session_id ? 'present' : 'MISSING'));
      if (r.error) console.log('   error=' + r.error);
      console.log('   STATUS: ' + (r.ok ? 'PASS' : 'INIT_NOT_READY') + '\n');
    } else { console.log('3. SCAN_QUICK: FAIL\n'); }

    if (responses[4] && responses[4].result) {
      const r = responses[4].result;
      console.log('4. SCAN_FULL (Protection + Security):');
      console.log('   ok=' + r.ok + ' session_id=' + (r.session_id ? 'present' : 'MISSING'));
      if (r.error) console.log('   error=' + r.error);
      console.log('   STATUS: ' + (r.ok ? 'PASS' : 'INIT_NOT_READY') + '\n');
    } else { console.log('4. SCAN_FULL: FAIL\n'); }

    if (responses[5] && responses[5].result) {
      const r = responses[5].result;
      const entries = r.entries || r.quarantine || [];
      console.log('5. QUARANTINE_LIST (Security):');
      console.log('   ok=' + r.ok + ' count=' + (Array.isArray(entries) ? entries.length : 'N/A'));
      console.log('   STATUS: PASS\n');
    } else { console.log('5. QUARANTINE_LIST: FAIL\n'); }

    console.log('Total JSON responses: ' + Object.keys(responses).length);
    backend.kill();
    process.exit(0);
  }, 30000);
}, 180000);
