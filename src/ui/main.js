import { Simulator } from '../core/simulator.js';
import { MeshGrid, RN_F, HN_F, SN_F } from '../core/mesh.js';
import { Renderer } from './renderer.js';
import { Controls } from './controls.js';
import { Suite } from './suite.js';

class App {
  constructor() {
    this.renderer = new Renderer('svg-container', 'svg-tooltip');
    this.controls = new Controls(this);
    this.suite = new Suite(this);
    
    this.simulator = null;
    this.isPlaying = false;
    this.playbackInterval = null;
    this.simulationSpeed = 5; // 1 to 10
    this.selectedNode = null;
    
    this.currentScenario = null;
    this.onSimulationComplete = null;
    
    this.initDefaultGrid();
  }

  // Set up standard 3x3 mesh on boot
  initDefaultGrid() {
    const defaultScenario = {
      name: "Default 3x3 Mesh Grid",
      grid: { width: 3, height: 3 },
      initial_state: {
        nodes: [
          { x: 0, y: 0, type: "RN_F" },
          { x: 2, y: 0, type: "RN_F" },
          { x: 0, y: 2, type: "RN_F" },
          { x: 2, y: 2, type: "RN_F" },
          { x: 1, y: 1, type: "HN_F" },
          { x: 0, y: 1, type: "HN_F" },
          { x: 2, y: 1, type: "HN_F" },
          { x: 1, y: 0, type: "SN_F", memory: { "0x10": 10, "0x20": 20 } },
          { x: 1, y: 2, type: "SN_F", memory: { "0x30": 30, "0x40": 40 } }
        ]
      },
      transactions: []
    };
    this.loadScenario(defaultScenario);
  }

  loadScenario(scenario) {
    this.pause();
    this.currentScenario = scenario;
    
    // Create new Simulator with empty mesh first, let runScenario build it
    this.simulator = new Simulator(new MeshGrid(scenario.grid.width, scenario.grid.height));
    
    // runScenario populates grid and transaction list natively
    const result = this.simulator.runScenario({
      ...scenario,
      transactions: [] // Don't trigger transaction list instantly inside runScenario, we want to play them cycle-by-cycle!
    });
    
    // Queue transactions manually on the simulator so we can step them cycle-by-cycle
    this.transactionsToTrigger = scenario.transactions ? [...scenario.transactions] : [];
    this.transactionsTriggeredCount = 0;
    this.totalTransactionsCount = this.transactionsToTrigger.length;

    // Reset cycle counter
    this.simulator.currentCycle = 0;

    // Reset selected node to the first RN_F if available
    this.selectedNode = null;
    for (let y = 0; y < scenario.grid.height; y++) {
      for (let x = 0; x < scenario.grid.width; x++) {
        const node = this.simulator.meshGrid.getNode(x, y);
        if (node && node.type === 'RN_F') {
          this.selectedNode = node;
          break;
        }
      }
      if (this.selectedNode) break;
    }

    // Draw the base mesh grid once
    this.renderer.drawMesh(this.simulator.meshGrid, this.selectedNode, {
      onNodeClick: (node) => this.onNodeClicked(node)
    });

    // Reset packet log in DOM
    const packetLogContainer = document.getElementById('packet-log-list');
    if (packetLogContainer) {
      packetLogContainer.innerHTML = '';
    }

    this.updateUI();
  }

  // Trigger clock tick
  step() {
    if (!this.simulator) return;

    // 1. Inject scheduled transactions for the current cycle
    const currentTxns = this.transactionsToTrigger.filter(t => t && t.cycle === this.simulator.currentCycle);
    for (const t of currentTxns) {
      if (!t.src || !Array.isArray(t.src) || t.src.length < 2) {
        console.warn("Warning: Transaction is missing source coordinates or invalid. Skipping.");
        this.transactionsTriggeredCount++;
        continue;
      }
      const rnNode = this.simulator.meshGrid.getNode(t.src[0], t.src[1]);
      if (rnNode) {
        this.simulator.queueTransaction({
          type: t.type,
          address: t.address,
          node: rnNode,
          value: t.data
        });
        this.transactionsTriggeredCount++;
      } else {
        console.warn(`Warning: Transaction source node at [${t.src[0]}, ${t.src[1]}] not found. Skipping.`);
        this.transactionsTriggeredCount++;
      }
    }

    // 2. Step the simulation
    const movements = this.simulator.step();
    if (movements.length > 0) {
      console.log(`Step cycle ${this.simulator.currentCycle} movements:`, JSON.stringify(movements));
      
      // Update live packet log in UI
      const packetLogContainer = document.getElementById('packet-log-list');
      if (packetLogContainer) {
        for (const m of movements) {
          const item = document.createElement('div');
          item.className = 'packet-item';
          
          const typeClass = `type-${m.type.toLowerCase()}`;
          
          const fromNode = this.simulator.meshGrid.getNode(m.from.x, m.from.y);
          const fromName = fromNode ? fromNode.id : `RTR_${m.from.x}_${m.from.y}`;
          const toNode = this.simulator.meshGrid.getNode(m.to.x, m.to.y);
          const toName = toNode ? toNode.id : `RTR_${m.to.x}_${m.to.y}`;
          
          item.innerHTML = `
            <div class="packet-item-header">
              <span class="packet-item-cycle">Cyc ${this.simulator.currentCycle}</span>
              <span class="packet-item-id">${m.packetId}</span>
            </div>
            <div class="packet-item-desc">
              <span class="tag ${typeClass}">${m.type}</span>
              <strong>${m.opcode}</strong> from ${fromName} to ${toName}
            </div>
          `;
          packetLogContainer.appendChild(item);
        }
        packetLogContainer.scrollTop = packetLogContainer.scrollHeight;
      }
    }

    // 3. Trigger visual animations
    this.renderer.animatePackets(movements, this.simulationSpeed);

    // 4. Update UI displays
    this.updateUI();

    // 5. Check termination
    const activeTxns = Array.from(this.simulator.transactions.values()).filter(t => t.endTime === null);
    const hasFutureTxns = this.transactionsToTrigger.some(t => t.cycle > this.simulator.currentCycle);
    
    if (this.simulator.activePackets.length === 0 && 
        this.simulator.pendingEvents.length === 0 && 
        activeTxns.length === 0 && 
        !hasFutureTxns &&
        this.transactionsTriggeredCount >= this.totalTransactionsCount) {
      this.pause();
      document.getElementById('sim-status-badge').className = 'status-badge passed';
      document.getElementById('sim-status-badge').textContent = 'Finished';
      
      if (this.onSimulationComplete) {
        this.onSimulationComplete();
      }
    }
  }

  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.controls.updatePlaybackUI(true);
    document.getElementById('sim-status-badge').className = 'status-badge running';
    document.getElementById('sim-status-badge').textContent = 'Running';

    const tick = () => {
      this.step();
      if (this.isPlaying) {
        // Interval dynamically adjusted by speed slider
        const speedDelay = Math.max(200, 1000 - (this.simulationSpeed * 85));
        this.playbackInterval = setTimeout(tick, speedDelay);
      }
    };
    tick();
  }

  pause() {
    this.isPlaying = false;
    if (this.playbackInterval) {
      clearTimeout(this.playbackInterval);
      this.playbackInterval = null;
    }
    if (this.controls) {
      this.controls.updatePlaybackUI(false);
    }
    
    const statusBadge = document.getElementById('sim-status-badge');
    if (this.simulator) {
      const activeTxns = Array.from(this.simulator.transactions.values()).filter(t => t.endTime === null);
      if (activeTxns.length > 0) {
        if (statusBadge) {
          statusBadge.className = 'status-badge running';
          statusBadge.textContent = 'Paused';
        }
      } else {
        if (statusBadge) {
          statusBadge.className = 'status-badge';
          statusBadge.textContent = 'Idle';
        }
      }
    } else {
      if (statusBadge) {
        statusBadge.className = 'status-badge';
        statusBadge.textContent = 'Idle';
      }
    }
  }

  reset() {
    if (this.currentScenario) {
      this.loadScenario(this.currentScenario);
    } else {
      this.initDefaultGrid();
    }
  }

  setSpeed(value) {
    this.simulationSpeed = value;
  }

  injectManualTransaction(txn) {
    if (!this.simulator) return;
    const node = this.simulator.meshGrid.getNode(txn.x, txn.y);
    if (node) {
      this.simulator.queueTransaction({
        type: txn.type,
        address: txn.address,
        node: node,
        value: txn.data
      });
      this.updateUI();
      // Auto-start simulation if paused to let user witness path
      if (!this.isPlaying) {
        this.play();
      }
    }
  }

  onNodeClicked(node) {
    this.selectedNode = node;
    this.controls.fillCoordinates(node.x, node.y);
    this.updateUI();
  }

  drawSequenceDiagram() {
    if (this.renderer && this.simulator) {
      this.renderer.drawSequenceDiagram('sequence-diagram-container', this.simulator);
    }
  }

  updateUI() {
    if (!this.simulator) return;
    const grid = this.simulator.meshGrid;
    
    // Update dynamic node states without resetting SVG DOM
    this.renderer.updateNodeDynamicStates(grid, this.selectedNode);

    // Update cycle count text
    document.getElementById('cycle-count').textContent = this.simulator.currentCycle;

    // Update node details panel
    const inspectorPlaceholder = document.getElementById('inspector-placeholder');
    const inspectorContent = document.getElementById('inspector-content');
    
    if (this.selectedNode) {
      inspectorPlaceholder.style.display = 'none';
      inspectorContent.style.display = 'flex';
      
      document.getElementById('inspect-node-id').textContent = this.selectedNode.id;
      
      const typeBadge = document.getElementById('inspect-node-type');
      typeBadge.textContent = this.selectedNode.type.replace('_', '-');
      typeBadge.className = `suite-badge ${this.selectedNode.type === 'RN_F' ? 'passed' : this.selectedNode.type === 'HN_F' ? 'running' : 'pending'}`;
      
      let detailsHtml = '';
      if (this.selectedNode.type === 'RN_F') {
        detailsHtml += '<strong>Caches List:</strong>';
        const cacheEntries = Object.entries(this.selectedNode.cache);
        if (cacheEntries.length === 0) {
          detailsHtml += '<div style="color:var(--text-secondary); margin-top:4px;">No active cache lines.</div>';
        } else {
          for (const [addr, entry] of cacheEntries) {
            const stateColor = entry.state === 'UC' ? '#34d399' : entry.state === 'SC' ? '#38bdf8' : '#64748b';
            detailsHtml += `<div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.2); padding:6px 10px; border-radius:4px; font-family:monospace; margin-top:4px;">
              <span>${addr}</span>
              <span style="color:${stateColor}; font-weight:bold;">${entry.state}</span>
              <span style="color:#ffd166;">Val: ${entry.data !== null ? entry.data : '-'}</span>
            </div>`;
          }
        }
      } else if (this.selectedNode.type === 'HN_F') {
        detailsHtml += '<strong>Directory Sharers:</strong>';
        const dirEntries = Object.entries(this.selectedNode.directory);
        if (dirEntries.length === 0) {
          detailsHtml += '<div style="color:var(--text-secondary); margin-top:4px;">Directory empty.</div>';
        } else {
          for (const [addr, sharers] of dirEntries) {
            const sharerText = sharers.map(s => `[${s.x},${s.y}]`).join(', ') || 'None';
            detailsHtml += `<div style="display:flex; flex-direction:column; background:rgba(0,0,0,0.2); padding:6px 10px; border-radius:4px; font-family:monospace; margin-top:4px; gap:2px;">
              <span style="color:var(--rn-color)">Addr: ${addr}</span>
              <span style="color:var(--text-secondary); font-size:0.75rem;">Sharers: ${sharerText}</span>
            </div>`;
          }
        }
      } else if (this.selectedNode.type === 'SN_F') {
        detailsHtml += '<strong>Memory Blocks:</strong>';
        const memEntries = Object.entries(this.selectedNode.memory);
        if (memEntries.length === 0) {
          detailsHtml += '<div style="color:var(--text-secondary); margin-top:4px;">Memory empty.</div>';
        } else {
          for (const [addr, val] of memEntries) {
            detailsHtml += `<div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.2); padding:6px 10px; border-radius:4px; font-family:monospace; margin-top:4px;">
              <span>${addr}</span>
              <span style="color:#ffd166;">Value: ${val}</span>
            </div>`;
          }
        }
      }
      document.getElementById('inspect-details-block').innerHTML = detailsHtml;
    } else {
      inspectorPlaceholder.style.display = 'block';
      inspectorContent.style.display = 'none';
    }

    // Update metrics cards
    let totalLatency = 0;
    let totalHops = 0;
    let completedCount = 0;
    const txLogList = document.getElementById('transaction-log-list');
    txLogList.innerHTML = '';

    const txns = Array.from(this.simulator.transactions.values()).sort((a,b) => b.index - a.index);
    
    for (const tx of txns) {
      const latency = tx.endTime ? (tx.endTime - tx.startTime) : (this.simulator.currentCycle - tx.startTime);
      totalHops += tx.hops;
      if (tx.endTime) {
        totalLatency += latency;
        completedCount++;
      }

      // Add to sidebar transaction log list
      const txItem = document.createElement('div');
      txItem.className = 'tx-item';
      
      const statusBadgeClass = tx.endTime ? 'completed' : 'pending';
      const statusText = tx.endTime ? 'Comp' : 'Active';
      
      txItem.innerHTML = `
        <div class="tx-info">
          <span class="tx-op">${tx.type}</span>
          <span class="tx-addr">Addr: ${tx.address}</span>
          <span style="font-size:0.65rem; color:var(--text-secondary)">Node: ${tx.rn.id}</span>
        </div>
        <div class="tx-meta">
          <span class="tx-latency">${latency} cyc</span>
          <span class="tx-status ${statusBadgeClass}">${statusText}</span>
        </div>
      `;
      txLogList.appendChild(txItem);
    }

    document.getElementById('metric-hops').textContent = totalHops;
    const avgLatency = completedCount > 0 ? (totalLatency / completedCount).toFixed(1) : '0.0';
    document.getElementById('metric-latency').textContent = `${avgLatency} cyc`;

    // Update sequence diagram if active
    const seqTab = document.querySelector('.tab-btn[data-tab="sequence-view"]');
    if (seqTab && seqTab.classList.contains('active')) {
      this.drawSequenceDiagram();
    }
  }
}

// Start application on page load
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
  });
} else {
  window.app = new App();
}
