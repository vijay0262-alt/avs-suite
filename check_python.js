const { execSync } = require('child_process');
try {
  const out = execSync('python -c "import sys; print(sys.executable)"', { encoding: 'utf8' });
  console.log('Python executable:', out.trim());
  const out2 = execSync('python -c "import avs_license_sdk; print(avs_license_sdk.__file__)"', { encoding: 'utf8' });
  console.log('SDK location:', out2.trim());
} catch (e) {
  console.error('Error:', e.message);
  console.error('stderr:', e.stderr?.toString());
}
