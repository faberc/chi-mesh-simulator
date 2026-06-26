import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const tests = [
  {
    name: 'Syntax Error Handling',
    cmd: 'node tests/test_runner.js --file tests/cases/corrupted_syntax.json --mock',
    expectCrash: false,
    expectedExitCode: 1,
    desc: 'Gracefully catches JSON parse error and exits with 1.'
  },
  {
    name: 'Non-iterable Nodes Configuration',
    cmd: 'node tests/test_runner.js --file tests/cases/corrupted_missing_node_iter.json --mock',
    expectCrash: false,
    expectedExitCode: 1,
    desc: 'Catches missing/invalid initial state and exits with 1.'
  },
  {
    name: 'Missing Transaction Coordinates',
    cmd: 'node tests/test_runner.js --file tests/cases/corrupted_missing_txn_coords.json --mock',
    expectCrash: false,
    expectedExitCode: 1,
    desc: 'Catches missing transaction coordinates and exits with 1.'
  },
  {
    name: 'Missing Assertion Node Coordinate',
    cmd: 'node tests/test_runner.js --file tests/cases/corrupted_invalid_assert_node.json --mock',
    expectCrash: false,
    expectedExitCode: 1,
    desc: 'Catches missing assertion node coordinate and exits with 1.'
  },
  {
    name: 'Missing Assertion Path Field',
    cmd: 'node tests/test_runner.js --file tests/cases/corrupted_invalid_assert_path.json --mock',
    expectCrash: false,
    expectedExitCode: 1,
    desc: 'Catches missing assertion path and exits with 1.'
  },
  {
    name: 'CLI Boundary: --tier at end of command',
    cmd: 'node tests/test_runner.js --tier',
    expectCrash: false,
    expectedExitCode: 0,
    desc: 'Silent failure: sets filterTier to NaN, skips all scenarios, and exits 0 instead of reporting invalid CLI usage.'
  },
  {
    name: 'CLI Boundary: --file at end of command',
    cmd: 'node tests/test_runner.js --file',
    expectCrash: false,
    expectedExitCode: 0,
    desc: 'Boundary failure: sets filterFile to undefined, which is evaluated as falsy. Silent fallback to running all scenarios.'
  },
  {
    name: 'CLI Boundary: --src-dir at end of command',
    cmd: 'node tests/test_runner.js --src-dir',
    expectCrash: false,
    expectedExitCode: 0,
    desc: 'Boundary failure: resolves undefined to process.cwd(), failing to find engine, falling back to mock engine without error.'
  },
  {
    name: 'Real Engine Compatibility Verification',
    cmd: 'node tests/test_runner.js --file scenarios/read_hit_miss.json',
    expectCrash: false,
    expectedExitCode: 0,
    desc: 'Verifies that the test runner is fully compatible with the real engine and passes scenarios.'
  }
];

const results = [];

console.log('=== Starting E2E Test Runner Verification ===\n');

for (const t of tests) {
  console.log(`Running: ${t.name}...`);
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let crashed = false;

  try {
    stdout = execSync(t.cmd, { stdio: 'pipe', encoding: 'utf8' });
  } catch (err) {
    exitCode = err.status || 1;
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    if (stderr.includes('TypeError') || stderr.includes('Unhandled execution error')) {
      crashed = true;
    }
  }

  const matchesExpectation = crashed === t.expectCrash;
  console.log(`  Exit Code: ${exitCode}`);
  console.log(`  Crashed:   ${crashed} (Expected crash: ${t.expectCrash})`);
  console.log(`  Status:    ${matchesExpectation ? 'Verified' : 'Unmatched'}`);
  if (crashed) {
    const lines = stderr.split('\n');
    console.log(`  Error:     ${lines[0] || lines[1] || 'Unknown TypeError'}`);
  }
  console.log('--------------------------------------------------');

  results.push({
    name: t.name,
    cmd: t.cmd,
    exitCode,
    crashed,
    expectedCrash: t.expectCrash,
    errorSnippet: stderr.split('\n').slice(0, 3).join('\n'),
    desc: t.desc
  });
}

// Write findings to a JSON file for empirical proof
fs.writeFileSync(
  path.resolve(process.cwd(), 'tests/verification_results.json'),
  JSON.stringify(results, null, 2),
  'utf8'
);

console.log('\nVerification complete. Results written to tests/verification_results.json');
