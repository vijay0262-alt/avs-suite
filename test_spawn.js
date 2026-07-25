const { spawn } = require('child_process');
const path = require('path');

const backendSrc = path.resolve(__dirname, 'backend/src');
const script = path.join(backendSrc, 'avs_backend', 'api', 'rpc_server.py');
const cwd = __dirname;

console.log('command: python');
console.log('args:', ['-u', script]);
console.log('cwd:', cwd);
console.log('PYTHONPATH:', backendSrc);

const child = spawn('python', ['-u', script], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONPATH: backendSrc },
  cwd,
});

child.stdout.on('data', (chunk) => {
  const lines = chunk.toString('utf8').split('\n');
  for (const line of lines) {
    if (line.trim()) console.log('[stdout]', line);
  }
});

child.stderr.on('data', (chunk) => {
  const lines = chunk.toString('utf8').split('\n');
  for (const line of lines) {
    if (line.trim()) console.log('[stderr]', line);
  }
});

child.on('exit', (code, signal) => {
  console.log('Process exited:', code, signal);
});

// Send a ping to test
setTimeout(() => {
  const req = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'system.ping' }) + '\n';
  console.log('Sending ping...');
  child.stdin.write(req);
}, 3000);

// Send license.get_info after ping
setTimeout(() => {
  const req = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'license.get_info' }) + '\n';
  console.log('Sending license.get_info...');
  child.stdin.write(req);
}, 6000);

// Exit after 10s
setTimeout(() => {
  child.kill();
  process.exit(0);
}, 10000);
