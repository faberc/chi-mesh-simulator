export class Suite {
  constructor(mainApp) {
    this.app = mainApp;
    
    // Scenarios data matching E2E definitions
    this.scenarios = {
      read: {
        name: "Read Hit / Miss Scenario",
        grid: { "width": 3, "height": 3 },
        initial_state: {
          nodes: [
            { "x": 0, "y": 0, "type": "RN_F" },
            { "x": 1, "y": 1, "type": "HN_F" },
            { "x": 2, "y": 2, "type": "SN_F", "memory": { "0x10": 42 } }
          ]
        },
        transactions: [
          { "cycle": 1, "src": [0, 0], "type": "ReadShared", "address": "0x10" },
          { "cycle": 18, "src": [0, 0], "type": "ReadShared", "address": "0x10" }
        ],
        assertions: {
          final_cache_states: [
            { "node": [0, 0], "address": "0x10", "state": "UC", "data": 42 }
          ]
        }
      },
      write: {
        name: "Concurrent Write Conflict",
        grid: { "width": 3, "height": 3 },
        initial_state: {
          nodes: [
            { "x": 0, "y": 0, "type": "RN_F" },
            { "x": 2, "y": 0, "type": "RN_F" },
            { "x": 1, "y": 1, "type": "HN_F" },
            { "x": 2, "y": 2, "type": "SN_F", "memory": { "0x10": 42 } }
          ]
        },
        transactions: [
          { "cycle": 1, "src": [0, 0], "type": "ReadShared", "address": "0x10" },
          { "cycle": 1, "src": [2, 0], "type": "WriteUnique", "address": "0x10", "data": 99 }
        ],
        assertions: {
          final_cache_states: [
            { "node": [2, 0], "address": "0x10", "state": "UC", "data": 99 },
            { "node": [0, 0], "address": "0x10", "state": "I" }
          ]
        }
      },
      snoop: {
        name: "Snoop Invalidation",
        grid: { "width": 3, "height": 3 },
        initial_state: {
          nodes: [
            { "x": 0, "y": 0, "type": "RN_F", "cache": { "0x10": { "state": "SC", "data": 42 } } },
            { "x": 2, "y": 0, "type": "RN_F", "cache": { "0x10": { "state": "SC", "data": 42 } } },
            { "x": 1, "y": 1, "type": "HN_F", "directory": { "0x10": [[0, 0], [2, 0]] } },
            { "x": 2, "y": 2, "type": "SN_F", "memory": { "0x10": 42 } }
          ]
        },
        transactions: [
          { "cycle": 1, "src": [0, 0], "type": "WriteUnique", "address": "0x10", "data": 88 }
        ],
        assertions: {
          final_cache_states: [
            { "node": [0, 0], "address": "0x10", "state": "UC", "data": 88 },
            { "node": [2, 0], "address": "0x10", "state": "I" }
          ]
        }
      }
    };
    
    this.buttons = document.querySelectorAll('.btn-run-suite');
    this.initEvents();
  }

  initEvents() {
    this.buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const suiteId = btn.getAttribute('data-suite');
        const scenario = this.scenarios[suiteId];
        if (scenario) {
          this.runSuiteScenario(suiteId, scenario);
        }
      });
    });
  }

  runSuiteScenario(suiteId, scenario) {
    // 1. Update UI state to running
    const badge = document.getElementById(`suite-badge-${suiteId}`);
    badge.className = 'suite-badge running';
    badge.textContent = 'Running';

    // 2. Load the scenario into the app
    this.app.loadScenario(scenario);
    
    // Set callback to execute when simulation finishes
    this.app.onSimulationComplete = () => {
      const assertionsPassed = this.verifyAssertions(scenario);
      
      if (assertionsPassed) {
        badge.className = 'suite-badge passed';
        badge.textContent = 'Passed';
      } else {
        badge.className = 'suite-badge failed';
        badge.textContent = 'Failed';
      }
      
      // Clear callback
      this.app.onSimulationComplete = null;
    };
    
    // 3. Play at high speed automatically
    this.app.setSpeed(8);
    this.app.play();
  }

  // Check E2E assertions for the active browser simulation run
  verifyAssertions(scenario) {
    const assertions = scenario.assertions || {};
    const grid = this.app.simulator.meshGrid;

    // Helper to compare coordinates
    const coordsMatch = (c1, c2) => c1[0] === c2[0] && c1[1] === c2[1];
    
    // Helper to normalize addresses
    const normalizeAddr = (addr) => {
      if (typeof addr === 'number') return `0x${addr.toString(16)}`;
      if (typeof addr === 'string') {
        if (addr.startsWith('0x') || addr.startsWith('0X')) {
          return `0x${parseInt(addr, 16).toString(16)}`;
        }
        return `0x${parseInt(addr, 10).toString(16)}`;
      }
      return addr;
    };

    // Verify cache states
    if (assertions.final_cache_states) {
      for (const expected of assertions.final_cache_states) {
        if (!expected || !expected.node || !Array.isArray(expected.node) || expected.node.length < 2) {
          console.warn("Suite verification: invalid cache state assertion coordinates");
          return false;
        }
        const node = grid.getNode(expected.node[0], expected.node[1]);
        if (!node || node.type !== 'RN_F') return false;
        
        const cached = node.cache[expected.address];
        if (!cached) return false;
        if (cached.state !== expected.state) return false;
        if (expected.data !== undefined && cached.data !== expected.data) return false;
      }
    }

    // Verify directory states
    if (assertions.final_directory_states) {
      for (const expected of assertions.final_directory_states) {
        if (!expected || !expected.node || !Array.isArray(expected.node) || expected.node.length < 2) {
          console.warn("Suite verification: invalid directory assertion coordinates");
          return false;
        }
        const node = grid.getNode(expected.node[0], expected.node[1]);
        if (!node || node.type !== 'HN_F') return false;
        
        const sharers = node.directory[expected.address] || [];
        const expectedSharers = expected.sharers;
        if (!expectedSharers || !Array.isArray(expectedSharers)) return false;
        
        if (sharers.length !== expectedSharers.length) return false;
        
        const mapCoords = s => Array.isArray(s) ? s : [s.x, s.y];
        const s1 = sharers.map(mapCoords).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
        const s2 = [...expectedSharers].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
        
        for (let i = 0; i < s1.length; i++) {
          if (!coordsMatch(s1[i], s2[i])) return false;
        }
      }
    }

    return true;
  }
}
