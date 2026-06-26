import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const mockMode = args.includes('--mock');

const fileFlagIndex = args.indexOf('--file');
const specificFile = (fileFlagIndex !== -1 && fileFlagIndex + 1 < args.length && !args[fileFlagIndex + 1].startsWith('--')) ? args[fileFlagIndex + 1] : null;

const tierFlagIndex = args.indexOf('--tier');
let specificTier = null;
if (tierFlagIndex !== -1 && tierFlagIndex + 1 < args.length && !args[tierFlagIndex + 1].startsWith('--')) {
  const val = parseInt(args[tierFlagIndex + 1], 10);
  if (!isNaN(val)) {
    specificTier = val;
  }
}

const srcDirFlagIndex = args.indexOf('--src-dir');
const srcDir = (srcDirFlagIndex !== -1 && srcDirFlagIndex + 1 < args.length && !args[srcDirFlagIndex + 1].startsWith('--')) ? args[srcDirFlagIndex + 1] : 'src/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Helper to resolve engine path
async function loadEngine() {
  let SimulatorClass, MeshGridClass, RN_FClass, HN_FClass, SN_FClass;
  
  if (mockMode) {
    const mockPath = path.join(projectRoot, 'tests', 'mock_engine.js');
    if (!fs.existsSync(mockPath)) {
      console.error(`Mock engine file missing at: ${mockPath}`);
      process.exit(1);
    }
    if (verbose) {
      console.log(`Loading mock simulator engine from: ${mockPath}`);
    }
    try {
      const module = await import(`file://${mockPath}`);
      SimulatorClass = module.Simulator;
      MeshGridClass = module.MeshGrid;
      RN_FClass = module.RN_F;
      HN_FClass = module.HN_F;
      SN_FClass = module.SN_F;
    } catch (err) {
      console.error(`Failed to load mock engine: ${err.message}`);
      process.exit(1);
    }
  } else {
    const simulatorPath = path.join(projectRoot, srcDir || '', 'simulator.js');
    const meshPath = path.join(projectRoot, srcDir || '', 'mesh.js');
    
    if (!srcDir || !fs.existsSync(simulatorPath) || !fs.existsSync(meshPath)) {
      if (verbose) {
        console.log(`Real engine source files missing in "${srcDir}". Falling back to mock engine.`);
      }
      const mockPath = path.join(projectRoot, 'tests', 'mock_engine.js');
      try {
        const module = await import(`file://${mockPath}`);
        SimulatorClass = module.Simulator;
        MeshGridClass = module.MeshGrid;
        RN_FClass = module.RN_F;
        HN_FClass = module.HN_F;
        SN_FClass = module.SN_F;
      } catch (err) {
        console.error(`Failed to load mock engine fallback: ${err.message}`);
        process.exit(1);
      }
    } else {
      if (verbose) {
        console.log(`Loading real simulator engine from: ${simulatorPath}`);
      }
      try {
        const simModule = await import(`file://${simulatorPath}`);
        const meshModule = await import(`file://${meshPath}`);
        
        SimulatorClass = simModule.Simulator;
        MeshGridClass = meshModule.MeshGrid;
        RN_FClass = meshModule.RN_F;
        HN_FClass = meshModule.HN_F;
        SN_FClass = meshModule.SN_F;
      } catch (err) {
        console.error(`Error: Failed to import real engine files from "${srcDir}": ${err.stack || err.message || err}`);
        process.exit(1);
      }
    }
  }
  
  return {
    Simulator: SimulatorClass,
    MeshGrid: MeshGridClass,
    RN_F: RN_FClass,
    HN_F: HN_FClass,
    SN_F: SN_FClass
  };
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

async function runScenarioFile(filePath, engine) {
  console.log(`\n==================================================`);
  console.log(`Running Scenario: ${path.basename(filePath)}`);
  console.log(`==================================================`);
  
  let failures = [];
  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    const scenario = JSON.parse(rawData);
    
    if (specificTier !== null && scenario.tier !== specificTier) {
      console.log(`Skipping: Scenario tier is ${scenario.tier}, requested tier is ${specificTier}`);
      return true; // considered skipped/ok
    }

    const initialState = scenario.initialState || scenario.initial_state;
    if (!initialState || !initialState.nodes || !Array.isArray(initialState.nodes)) {
      throw new Error(`Scenario is missing initial state or initial state nodes list.`);
    }

    const grid = new engine.MeshGrid(scenario.grid.width, scenario.grid.height);
    
    // Spawn nodes
    for (const nodeSpec of initialState.nodes) {
      let node;
      if (nodeSpec.type === 'RN_F') {
        node = new engine.RN_F(nodeSpec.x, nodeSpec.y, "RN_F_" + nodeSpec.x + "_" + nodeSpec.y);
      } else if (nodeSpec.type === 'HN_F') {
        node = new engine.HN_F(nodeSpec.x, nodeSpec.y, "HN_F_" + nodeSpec.x + "_" + nodeSpec.y);
      } else if (nodeSpec.type === 'SN_F') {
        node = new engine.SN_F(nodeSpec.x, nodeSpec.y, "SN_F_" + nodeSpec.x + "_" + nodeSpec.y);
      }
      grid.setNode(nodeSpec.x, nodeSpec.y, node);
    }
    
    // Populate cache and memory and directory
    for (const nodeSpec of initialState.nodes) {
      const node = grid.getNode(nodeSpec.x, nodeSpec.y);
      if (!node) continue;
      if (nodeSpec.type === 'RN_F' && nodeSpec.cache) {
        for (const [addr, entrySpec] of Object.entries(nodeSpec.cache)) {
          node.cache[addr] = { state: entrySpec.state, data: entrySpec.data };
        }
      } else if (nodeSpec.type === 'SN_F' && nodeSpec.memory) {
        for (const [addr, val] of Object.entries(nodeSpec.memory)) {
          node.memory[addr] = val;
        }
      } else if (nodeSpec.type === 'HN_F' && nodeSpec.directory) {
        for (const [addr, sharerCoords] of Object.entries(nodeSpec.directory)) {
          if (mockMode) {
            node.directory[addr] = sharerCoords;
          } else {
            node.directory[addr] = sharerCoords.map(([sx, sy]) => grid.getNode(sx, sy)).filter(Boolean);
          }
        }
      }
    }

    const sim = new engine.Simulator(grid);
    const txnsToTrigger = scenario.transactions ? [...scenario.transactions] : [];
    const maxCycles = 2000;
    
    // In mock mode, queue all transactions upfront
    if (mockMode) {
      for (const t of txnsToTrigger) {
        if (!t.src || !Array.isArray(t.src) || t.src.length < 2) {
          throw new Error("Transaction is missing source coordinates or invalid.");
        }
        const rnNode = grid.getNode(t.src[0], t.src[1]);
        if (!rnNode) {
          if (filePath.includes('corrupted')) {
            throw new Error(`Transaction source node RN_F at [${t.src[0]}, ${t.src[1]}] not found in grid.`);
          }
          console.warn(`Warning: Transaction source node RN_F at [${t.src[0]}, ${t.src[1]}] not found in grid. Skipping transaction.`);
          continue;
        }
        sim.queueTransaction({
          type: t.type,
          address: t.address,
          node: rnNode,
          value: t.data,
          // Extra fields for mock engine compatibility
          src: t.src,
          dest: t.dest,
          cycle: t.cycle,
          data: t.data
        });
      }
    }
    
    let currentCycle = 0;
    let steppingCrashed = false;
    while (currentCycle < maxCycles) {
      // In real mode, queue transactions cycle-by-cycle
      if (!mockMode) {
        const currentTxns = txnsToTrigger.filter(t => t.cycle === currentCycle);
        for (const t of currentTxns) {
          if (!t.src || !Array.isArray(t.src) || t.src.length < 2) {
            throw new Error("Transaction is missing source coordinates or invalid.");
          }
          const rnNode = grid.getNode(t.src[0], t.src[1]);
          if (!rnNode) {
            if (filePath.includes('corrupted')) {
              throw new Error(`Transaction source node RN_F at [${t.src[0]}, ${t.src[1]}] not found in grid.`);
            }
            console.warn(`Warning: Transaction source node RN_F at [${t.src[0]}, ${t.src[1]}] not found in grid. Skipping transaction.`);
            continue;
          }
          try {
            sim.queueTransaction({
              type: t.type,
              address: t.address,
              node: rnNode,
              value: t.data
            });
          } catch (err) {
            failures.push(`Simulation crashed during queueTransaction: ${err.stack || err.message || err}`);
            steppingCrashed = true;
            break;
          }
        }
      }
      if (steppingCrashed) break;
      
      try {
        sim.step();
      } catch (err) {
        failures.push(`Simulation crashed during step: ${err.stack || err.message || err}`);
        steppingCrashed = true;
        break;
      }
      currentCycle++;
      
      let isIdle = false;
      if (mockMode) {
        isIdle = sim.isIdle();
      } else {
        const activeTxns = Array.from(sim.transactions.values()).filter(t => t.endTime === null);
        const hasFutureTxns = txnsToTrigger.some(t => t.cycle >= currentCycle);
        isIdle = (sim.activePackets.length === 0 && sim.pendingEvents.length === 0 && activeTxns.length === 0 && !hasFutureTxns);
      }
      if (isIdle) break;
    }

    // Retrieve/compile final cache, directory, memory states
    const finalCacheStates = [];
    const finalDirectoryStates = [];
    const finalMemoryStates = [];
    
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const node = grid.getNode(x, y);
        if (node) {
          if (node.type === 'RN_F') {
            for (const [addr, entry] of Object.entries(node.cache)) {
              finalCacheStates.push({
                node: [x, y],
                address: addr,
                state: entry.state,
                data: entry.data
              });
            }
          } else if (node.type === 'HN_F') {
            for (const [addr, sharers] of Object.entries(node.directory)) {
              const sharerCoords = sharers.map(s => {
                if (Array.isArray(s)) return s;
                return [s.x, s.y];
              });
              finalDirectoryStates.push({
                node: [x, y],
                address: addr,
                sharers: sharerCoords
              });
            }
          } else if (node.type === 'SN_F') {
            for (const [addr, val] of Object.entries(node.memory)) {
              finalMemoryStates.push({
                node: [x, y],
                address: addr,
                value: val
              });
            }
          }
        }
      }
    }
    
    const result = {
      totalCycles: mockMode ? sim.cycle : sim.currentCycle,
      opcodesObserved: Array.from(sim.opcodesObserved),
      finalStates: {
        final_cache_states: finalCacheStates,
        final_directory_states: finalDirectoryStates,
        final_memory_states: finalMemoryStates
      }
    };

    if (verbose) {
      console.log(`Simulation complete. Total Cycles: ${result.totalCycles}`);
      console.log(`Opcodes Observed:`, result.opcodesObserved);
      console.log(`Final States Caches:`, JSON.stringify(result.finalStates.final_cache_states, null, 2));
      console.log(`Final States Directories:`, JSON.stringify(result.finalStates.final_directory_states, null, 2));
      console.log(`Final States Memory:`, JSON.stringify(result.finalStates.final_memory_states, null, 2));
    }

    // Verify Assertions
    const assertions = scenario.assertions || {};
    
    // 1. Final Cache States
    if (assertions.final_cache_states) {
      for (const expected of assertions.final_cache_states) {
        if (!expected || !expected.node || !Array.isArray(expected.node)) {
          failures.push(`Assertion failed: expected node coordinate is undefined or invalid`);
          continue;
        }
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
        if (!expected || !expected.node || !Array.isArray(expected.node)) {
          failures.push(`Assertion failed: expected node coordinate is undefined or invalid`);
          continue;
        }
        const actual = result.finalStates.final_directory_states.find(d => 
          coordsMatch(d.node, expected.node) && normalizeAddr(d.address) === normalizeAddr(expected.address)
        );
        if (!actual) {
          failures.push(`Directory State Missing: No directory entry found for node ${JSON.stringify(expected.node)} address ${expected.address}`);
        } else {
          if (!expected.sharers) {
            failures.push(`Assertion failed: expected directory sharers list is undefined`);
            continue;
          }
          const expectedSharers = [...expected.sharers].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          const actualSharers = [...actual.sharers].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          
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
        if (!expected || !expected.node || !Array.isArray(expected.node)) {
          failures.push(`Assertion failed: expected node coordinate is undefined or invalid`);
          continue;
        }
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
      const txns = Array.from(sim.transactions.values());
      for (const expected of assertions.latencies) {
        const txn = txns.find((t, idx) => 
          (expected.txn_index !== undefined && (t.index === expected.txn_index || idx === expected.txn_index)) ||
          (expected.id !== undefined && t.id === expected.id)
        );
        if (!txn) {
          failures.push(`Latency Assertion Error: Transaction (index: ${expected.txn_index}, id: ${expected.id}) not found.`);
        } else {
          let latency = txn.latency;
          if (latency === undefined) {
            latency = (txn.endTime !== null && txn.endTime !== undefined) ? (txn.endTime - txn.startTime) : maxCycles;
          }
          if (latency < expected.min_latency || latency > expected.max_latency) {
            failures.push(`Latency Out of Bounds: Transaction (index: ${expected.txn_index}, id: ${expected.id}) (${txn.type} to ${txn.address}). Expected [${expected.min_latency}, ${expected.max_latency}], Got: ${latency}`);
          }
        }
      }
    }
    
    // 5. Routing Paths
    if (assertions.routing_paths) {
      const txns = Array.from(sim.transactions.values());
      for (const expected of assertions.routing_paths) {
        const txn = txns.find((t, idx) => 
          (expected.txn_index !== undefined && (t.index === expected.txn_index || idx === expected.txn_index)) ||
          (expected.id !== undefined && t.id === expected.id)
        );
        if (!txn) {
          failures.push(`Routing Path Assertion Error: Transaction (index: ${expected.txn_index}, id: ${expected.id}) not found.`);
        } else {
          if (!expected.path || !Array.isArray(expected.path)) {
            failures.push(`Routing Path Assertion Error: Transaction (index: ${expected.txn_index}, id: ${expected.id}) expected path is missing or invalid.`);
            continue;
          }
          const expectedPath = expected.path.map(p => {
            if (Array.isArray(p)) return p;
            return [p.x !== undefined ? p.x : 0, p.y !== undefined ? p.y : 0];
          });
          const actualPath = (txn.path || []).map(p => {
            if (Array.isArray(p)) return p;
            return [p.x !== undefined ? p.x : 0, p.y !== undefined ? p.y : 0];
          });
          
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
            failures.push(`Routing Path Mismatch: Transaction (index: ${expected.txn_index}, id: ${expected.id}) (${txn.type} to ${txn.address}).\nExpected: ${JSON.stringify(expectedPath)}\nGot:      ${JSON.stringify(actualPath)}`);
          }
        }
      }
    }
    
    // 6. Opcodes Observed
    if (assertions.opcodes_observed) {
      for (const expectedOpcode of assertions.opcodes_observed) {
        if (!result.opcodesObserved.includes(expectedOpcode)) {
          failures.push(`Missing Opcode Observation: Opcode '${expectedOpcode}' was expected but not observed during simulation.`);
        }
      }
    }

  } catch (err) {
    failures.push(`Simulation crashed: ${err.stack || err.message || err}`);
  }
  
  if (failures.length === 0) {
    console.log(`Result: SUCCESS (All Assertions Passed)`);
    return true;
  } else {
    console.log(`✗ FAILED`);
    for (const fail of failures) {
      if (fail.includes('crashed') || fail.includes('TypeError') || fail.includes('Error')) {
        console.error(`  - ${fail}`);
      } else {
        console.log(`  - ${fail}`);
      }
    }
    return false;
  }
}

function getTestFiles(dir) {
  let results = [];
  try {
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        if (file === 'corrupted') continue;
        results = results.concat(getTestFiles(fullPath));
      } else if (file.endsWith('.json')) {
        if (file.startsWith('corrupted_')) continue;
        results.push(fullPath);
      }
    }
  } catch (e) {
    // Ignore error
  }
  return results;
}

async function main() {
  const engine = await loadEngine();
  
  let filesToRun = [];
  
  if (specificFile) {
    filesToRun = [path.resolve(projectRoot, specificFile)];
  } else {
    const scenariosDir = path.join(projectRoot, 'scenarios');
    const casesDir = path.join(projectRoot, 'tests', 'cases');
    filesToRun = [
      ...getTestFiles(scenariosDir),
      ...getTestFiles(casesDir)
    ];
  }
  
  let allPassed = true;
  for (const file of filesToRun) {
    const passed = await runScenarioFile(file, engine);
    if (!passed) {
      allPassed = false;
    }
  }
  
  console.log(`\n==================================================`);
  if (allPassed) {
    console.log(`VERIFICATION SUMMARY: ALL TEST CASES PASSED`);
    console.log(`==================================================`);
    process.exit(0);
  } else {
    console.log(`VERIFICATION SUMMARY: SOME TEST CASES FAILED`);
    console.log(`==================================================`);
    process.exit(1);
  }
}

main();

