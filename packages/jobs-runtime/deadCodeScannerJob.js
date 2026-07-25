const { execSync } = require('child_process');
const path = require('path');

function runDeadCodeScannerJob() {
  const rootDir = path.resolve(__dirname, '../..');
  const scannerScript = path.join(rootDir, 'scripts', 'dead-code-scanner.js');

  console.log(`[DeadCodeScannerJob] Running dead code scanner at: ${scannerScript}`);
  try {
    const output = execSync(`node "${scannerScript}"`, {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'inherit',
    });
    console.log('[DeadCodeScannerJob] Dead code scan job completed successfully.');
    return output;
  } catch (error) {
    console.error('[DeadCodeScannerJob] Error executing dead code scanner:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runDeadCodeScannerJob();
}

module.exports = { runDeadCodeScannerJob };
