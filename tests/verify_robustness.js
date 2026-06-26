import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Import the simulator directly
import { Simulator } from '../src/core/simulator.js';

function getTestFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file === 'corrupted') return;
      results = results.concat(getTestFiles(fullPath));
    } else if (file.endsWith('.json')) {
      if (file.startsWith('corrupted_')) return;
      results.push(fullPath);
    }
  });
  return results;
}

// Coordinate matching helper
function coordsMatch(c1, c2) {
  if (Array.isArray(c1) && Array.isArray(c2)) {
    return c1[0] === c2[0] && c1[1] === c2[1];
  }
  if (c1 && c2 && typeof c1 === 'object' && typeof c2 === 'object') {
    const x1 = c1.x !== undefined ? c1.x : c1[0];
    const y1 = c1.y !== undefined ? c1.y : c1[1];
    const x2 = c2.x !== undefined ? c2.x : c2[0];
    const y2 = c2.y !== undefined ? c2.y : c2[1];
    return x1 === x2 && y1 === y2;
  }
  return false;
}

// Normalize hex/number address
function normalizeAddr(addr) {
  if (typeof addr === 'number') return `0x${addr.toString(16)}`;
  if (typeof addr === 'string') {
    if (addr.startsWith('0x') || addr.startsWith('0X')) {
      return `0x${parseInt(addr, 16).toString(16)}`;
    }
    return `0x${parseInt(addr, 10).toString(16)}`;
  }
  return addr;
}

async function verifyScenario(filePath) {
  const relPath = path.relative(projectRoot, filePath);
  console.log(`\n--------------------------------------------------`);
  console.log(`Running Scenario: ${relPath}`);
  console.log(`--------------------------------------------------`);

  let scenario;
  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    scenario = JSON.parse(rawData);
  } catch (err) {
    console.log(`Result: PARSE_ERROR (${err.message})`);
    return { status: 'PARSE_ERROR', error: err.message };
  }

  try {
    const sim = new Simulator(null);
    const result = sim.runScenario(scenario);

    // Verify Assertions
    const assertions = scenario.assertions || {};
    let failures = [];

    // 1. Final Cache States
    if (assertions.final_cache_states) {
      for (const expected of assertions.final_cache_states) {
        const actual = result.finalStates.final_cache_states.find(c => 
          coordsMatch(c.node, expected.node) && normalizeAddr(c.address) === normalizeAddr(expected.address)
        );
        if (!actual) {
          failures.push(`Cache State Missing: No cache entry found for node ${JSON.stringify(expected.node)} address ${expected.address}`);
        } else {
          if (actual.state !== expected.state) {
            failures.push(`Cache State Mismatch: Node ${JSON.stringify(expected.node)} address ${expected.address}. Expected state: ${expected.state}, Got: ${actual.state}`);
          }
          if (expected.data !== undefined && actual.data !== expected.data) {
            failures.push(`Cache Data Mismatch: Node ${JSON.stringify(expected.node)} address ${expected.address}. Expected data: ${expected.data}, Got: ${actual.data}`);
          }
        }
      }
    }

    // 2. Final Directory States
    if (assertions.final_directory_states) {
      for (const expected of assertions.final_directory_states) {
        const actual = result.finalStates.final_directory_states.find(d => 
          coordsMatch(d.node, expected.node) && normalizeAddr(d.address) === normalizeAddr(expected.address)
        );
        if (!actual) {
          failures.push(`Directory State Missing: No directory entry found for node ${JSON.stringify(expected.node)} address ${expected.address}`);
        } else {
          const expectedSharers = Array.isArray(expected.sharers) ? [...expected.sharers].sort((a, b) => a[0] - b[0] || a[1] - b[1]) : [];
          const actualSharers = Array.isArray(actual.sharers) ? [...actual.sharers].sort((a, b) => a[0] - b[0] || a[1] - b[1]) : [];
          
          if (expectedSharers.length !== actualSharers.length) {
            failures.push(`Directory Sharers Count Mismatch: Node ${JSON.stringify(expected.node)} address ${expected.address}. Expected: ${JSON.stringify(expected.sharers)}, Got: ${JSON.stringify(actual.sharers)}`);
          } else {
            for (let i = 0; i < expectedSharers.length; i++) {
              if (!coordsMatch(expectedSharers[i], actualSharers[i])) {
                failures.push(`Directory Sharer Mismatch: Node ${JSON.stringify(expected.node)} address ${expected.address}. Expected: ${JSON.stringify(expected.sharers)}, Got: ${JSON.stringify(actual.sharers)}`);
                break;
              }
            }
          }
        }
      }
    }

    // 3. Final Memory States
    if (assertions.final_memory_states) {
      for (const expected of assertions.final_memory_states) {
        const actual = result.finalStates.final_memory_states.find(m => 
          coordsMatch(m.node, expected.node) && normalizeAddr(m.address) === normalizeAddr(expected.address)
        );
        if (!actual) {
          failures.push(`Memory State Missing: No memory entry found for node ${JSON.stringify(expected.node)} address ${expected.address}`);
        } else {
          if (actual.value !== expected.value) {
            failures.push(`Memory Value Mismatch: Node ${JSON.stringify(expected.node)} address ${expected.address}. Expected value: ${expected.value}, Got: ${actual.value}`);
          }
        }
      }
    }

    // 4. Latencies
    if (assertions.latencies) {
      for (const expected of assertions.latencies) {
        const txn = result.transactions[expected.txn_index];
        if (!txn) {
          failures.push(`Latency Assertion Error: Transaction index ${expected.txn_index} not found.`);
        } else {
          if (txn.latency < expected.min_latency || txn.latency > expected.max_latency) {
            failures.push(`Latency Out of Bounds: Transaction index ${expected.txn_index} (${txn.type} to ${txn.address}). Expected [${expected.min_latency}, ${expected.max_latency}], Got: ${txn.latency}`);
          }
        }
      }
    }

    // 5. Routing Paths
    if (assertions.routing_paths) {
      for (const expected of assertions.routing_paths) {
        const txn = result.transactions[expected.txn_index];
        if (!txn) {
          failures.push(`Routing Path Assertion Error: Transaction index ${expected.txn_index} not found.`);
        } else {
          const expectedPath = Array.isArray(expected.path) ? expected.path.map(p => {
            if (Array.isArray(p)) return p;
            return [p.x !== undefined ? p.x : 0, p.y !== undefined ? p.y : 0];
          }) : [];
          const actualPath = Array.isArray(txn.path) ? txn.path.map(p => {
            if (Array.isArray(p)) return p;
            return [p.x !== undefined ? p.x : 0, p.y !== undefined ? p.y : 0];
          }) : [];
          
          let pathMismatch = false;
          if (expectedPath.length !== actualPath.length) {
            pathMismatch = true;
          } else {
            for (let i = 0; i < expectedPath.length; i++) {
              if (!coordsMatch(expectedPath[i], actualPath[i])) {
                pathMismatch = true;
                break;
              }
            }
          }
          if (pathMismatch) {
            failures.push(`Routing Path Mismatch: Transaction index ${expected.txn_index}.\nExpected: ${JSON.stringify(expectedPath)}\nGot:      ${JSON.stringify(actualPath)}`);
          }
        }
      }
    }

    // 6. Opcodes Observed
    if (assertions.opcodes_observed) {
      for (const expectedOpcode of assertions.opcodes_observed) {
        if (!result.opcodesObserved.includes(expectedOpcode)) {
          failures.push(`Missing Opcode Observation: Opcode '${expectedOpcode}' was expected but not observed.`);
        }
      }
    }

    if (failures.length === 0) {
      console.log(`Result: SUCCESS`);
      return { status: 'SUCCESS' };
    } else {
      console.log(`Result: ASSERTION_FAILED`);
      failures.forEach(f => console.log(`  - ${f}`));
      return { status: 'ASSERTION_FAILED', failures };
    }

  } catch (err) {
    console.log(`Result: CRASHED`);
    console.log(`  Stack trace:`, err.stack || err);
    return { status: 'CRASHED', error: err.message, stack: err.stack };
  }
}

async function main() {
  const testsDir = path.join(projectRoot, 'tests', 'cases');
  const testFiles = getTestFiles(testsDir);
  
  console.log(`Found ${testFiles.length} test cases.`);
  
  const summary = {
    SUCCESS: 0,
    PARSE_ERROR: 0,
    ASSERTION_FAILED: 0,
    CRASHED: 0
  };
  
  for (const file of testFiles) {
    const res = await verifyScenario(file);
    summary[res.status]++;
  }
  
  console.log(`\n==================================================`);
  console.log(`ROBUSTNESS RUN SUMMARY:`);
  console.log(`  SUCCESS:          ${summary.SUCCESS}`);
  console.log(`  PARSE_ERROR:      ${summary.PARSE_ERROR}`);
  console.log(`  ASSERTION_FAILED: ${summary.ASSERTION_FAILED}`);
  console.log(`  CRASHED:          ${summary.CRASHED}`);
  console.log(`==================================================`);
  
  if (summary.CRASHED > 0) {
    process.exit(2);
  } else if (summary.ASSERTION_FAILED > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Runner failed:", err);
  process.exit(3);
});
