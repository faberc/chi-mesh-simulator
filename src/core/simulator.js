import { Packet } from './protocol.js';
import { MeshGrid, RN_F, HN_F, SN_F } from './mesh.js';

export class Simulator {
  constructor(meshGrid) {
    this.meshGrid = meshGrid;
    this.currentCycle = 0;
    this.activePackets = [];      // packets currently moving in the mesh
    this.pendingEvents = [];       // scheduled node processing events
    this.transactions = new Map(); // txnId -> transaction record
    this.opcodesObserved = new Set();
    this.sequenceEvents = [];
    
    // Delays (configurable)
    this.linkDelay = 1;
    this.rnDelay = 1;
    this.hnDelay = 2;
    this.snDelay = 5;
  }
  
  queueTransaction(txnRequest) {
    // txnRequest: { type: 'ReadShared'|'ReadUnique'|'WriteUnique', address, node: RN_F, value/data }
    const node = txnRequest.node;
    if (!node) {
      throw new Error(`Transaction node at coordinates is undefined`);
    }
    const address = txnRequest.address;
    const cached = node.cache[address] || { state: 'I', data: null };
    const value = txnRequest.value !== undefined ? txnRequest.value : txnRequest.data;
    
    // Hit check
    let isHit = false;
    if (txnRequest.type === 'ReadShared') {
      if (cached.state === 'SC' || cached.state === 'UC') {
        isHit = true;
      }
    } else if (txnRequest.type === 'ReadUnique') {
      if (cached.state === 'UC') {
        isHit = true;
      }
    } else if (txnRequest.type === 'WriteUnique') {
      if (cached.state === 'UC') {
        cached.data = value;
        isHit = true;
      }
    }
    
    const txnId = `txn_${Math.random().toString(36).substring(2, 9)}`;
    const txn = {
      id: txnId,
      index: this.transactions.size,
      type: txnRequest.type,
      address: address,
      rn: node,
      value: value,
      startTime: this.currentCycle,
      endTime: null,
      hops: 0,
      state: isHit ? 'COMPLETED' : 'REQ_SENT',
      pendingSnoops: new Set(),
      snoopData: undefined,
      path: [{ x: node.x, y: node.y }]
    };
    
    this.transactions.set(txnId, txn);
    
    if (isHit) {
      txn.endTime = this.currentCycle + 1; // 1 cycle hit latency
      return txnId;
    }
    
    // Send request to Home Node
    const hnNode = this.getHNForAddress(address);
    if (!hnNode) {
      console.warn(`Warning: No HN_F node found in grid. Failing transaction.`);
      txn.state = 'FAILED';
      txn.endTime = this.currentCycle + 1;
      return txnId;
    }
    
    const pkt = new Packet(
      `pkt_${Math.random().toString(36).substring(2, 9)}`,
      node,
      hnNode,
      'Req',
      txnRequest.type,
      address,
      undefined,
      txnId
    );
    this.sendPacket(pkt);
    return txnId;
  }
  
  sendPacket(packet) {
    const useYX = (packet.type === 'Dat');
    packet.path = this.meshGrid.routeXY(packet.src, packet.dest, useYX);
    packet.pathIndex = 0;
    
    this.opcodesObserved.add(packet.opcode);
    
    const txn = this.transactions.get(packet.txnId);
    if (txn) {
      txn.hops += (packet.path.length - 1);
    }

    if (packet.path.length === 1) {
      const destNode = this.meshGrid.getNode(packet.dest.x, packet.dest.y);
      const delay = this.getNodeDelay(destNode);
      this.pendingEvents.push({
        cycle: this.currentCycle + delay,
        packet: packet,
        node: destNode
      });
    } else {
      packet.nextHopCycle = this.currentCycle + this.linkDelay;
      this.activePackets.push(packet);
    }
  }
  
  getHNForAddress(address) {
    const hns = [];
    for (let y = 0; y < this.meshGrid.height; y++) {
      for (let x = 0; x < this.meshGrid.width; x++) {
        const node = this.meshGrid.getNode(x, y);
        if (node && node.type === 'HN_F') {
          hns.push(node);
        }
      }
    }
    if (hns.length === 0) return null;
    hns.sort((a, b) => a.id.localeCompare(b.id));
    const hash = typeof address === 'number' ? address : parseInt(address, 16) || 0;
    return hns[hash % hns.length];
  }
  
  getSNForAddress(address) {
    const sns = [];
    for (let y = 0; y < this.meshGrid.height; y++) {
      for (let x = 0; x < this.meshGrid.width; x++) {
        const node = this.meshGrid.getNode(x, y);
        if (node && node.type === 'SN_F') {
          sns.push(node);
        }
      }
    }
    if (sns.length === 0) return null;
    sns.sort((a, b) => a.id.localeCompare(b.id));
    const hash = typeof address === 'number' ? address : parseInt(address, 16) || 0;
    return sns[hash % sns.length];
  }
  
  step() {
    this.currentCycle++;
    const movements = [];
    
    // 1. Advance packets on links
    const continuingPackets = [];
    for (const p of this.activePackets) {
      if (this.currentCycle >= p.nextHopCycle) {
        if (p.pathIndex >= p.path.length - 1) {
          const to = p.path[p.path.length - 1];
          const delay = this.getNodeDelay(this.meshGrid.getNode(to.x, to.y));
          this.pendingEvents.push({
            cycle: this.currentCycle + delay,
            packet: p,
            node: this.meshGrid.getNode(to.x, to.y)
          });
          continue;
        }
        const from = p.path[p.pathIndex];
        p.pathIndex++;
        const to = p.path[p.pathIndex];
        
        movements.push({
          packetId: p.id,
          from: { x: from.x, y: from.y },
          to: { x: to.x, y: to.y },
          type: p.type,
          opcode: p.opcode
        });
        
        const txn = this.transactions.get(p.txnId);
        if (txn) {
          if (p.opcode !== 'Comp') {
            const lastCoord = txn.path[txn.path.length - 1];
            if (!lastCoord || lastCoord.x !== to.x || lastCoord.y !== to.y) {
              txn.path.push({ x: to.x, y: to.y });
            }
          }
        }
        
        if (p.pathIndex === p.path.length - 1) {
          // Arrived at destination. Schedule process event.
          const delay = this.getNodeDelay(this.meshGrid.getNode(to.x, to.y));
          this.pendingEvents.push({
            cycle: this.currentCycle + delay,
            packet: p,
            node: this.meshGrid.getNode(to.x, to.y)
          });
        } else {
          p.nextHopCycle = this.currentCycle + this.linkDelay;
          continuingPackets.push(p);
        }
      } else {
        continuingPackets.push(p);
      }
    }
    this.activePackets = continuingPackets;
    
    // 2. Process node events
    const currentEvents = this.pendingEvents.filter(e => e.cycle <= this.currentCycle);
    this.pendingEvents = this.pendingEvents.filter(e => e.cycle > this.currentCycle);
    
    for (const ev of currentEvents) {
      this.processPacketAtNode(ev.packet, ev.node);
    }
    
    return movements;
  }
  
  getNodeDelay(node) {
    if (!node) return 1;
    if (node.type === 'RN_F') return this.rnDelay;
    if (node.type === 'HN_F') return this.hnDelay;
    if (node.type === 'SN_F') return this.snDelay;
    return 1;
  }
  
  processPacketAtNode(p, node) {
    const txn = this.transactions.get(p.txnId);
    if (!txn) return;
    
    if (!this.sequenceEvents) {
      this.sequenceEvents = [];
    }
    this.sequenceEvents.push({
      cycle: this.currentCycle,
      srcId: p.src.id,
      destId: node.id,
      type: p.type,
      opcode: p.opcode,
      packetId: p.id
    });
    
    if (node.type === 'HN_F') {
      this.processPacketAtHN(p, node, txn);
    } else if (node.type === 'RN_F') {
      this.processPacketAtRN(p, node, txn);
    } else if (node.type === 'SN_F') {
      this.processPacketAtSN(p, node, txn);
    }
  }
  
  completeHNTransaction(hn, txn, address) {
    if (hn.activeAddressTransactions) {
      hn.activeAddressTransactions.delete(address);
    }
    if (hn.pendingRequests && hn.pendingRequests[address] && hn.pendingRequests[address].length > 0) {
      const next = hn.pendingRequests[address].shift();
      this.pendingEvents.push({
        cycle: this.currentCycle,
        packet: next.packet,
        node: hn
      });
    }
  }

  processPacketAtHN(p, hn, txn) {
    const address = p.address;
    if (!hn.directory[address]) {
      hn.directory[address] = [];
    }
    if (!hn.activeAddressTransactions) {
      hn.activeAddressTransactions = new Set();
    }
    if (!hn.pendingRequests) {
      hn.pendingRequests = {};
    }

    if (p.type === 'Req') {
      if (hn.activeAddressTransactions.has(address)) {
        if (!hn.pendingRequests[address]) {
          hn.pendingRequests[address] = [];
        }
        hn.pendingRequests[address].push({ packet: p, txn });
        return;
      }
      hn.activeAddressTransactions.add(address);
    }
    
    if (p.type === 'Req') {
      if (p.opcode === 'ReadShared') {
        const sharers = hn.directory[address];
        if (sharers.length > 0) {
          txn.state = 'SNOOPING';
          for (const sharer of sharers) {
            txn.pendingSnoops.add(sharer.id);
            this.sendPacket(new Packet(
              `pkt_${Math.random().toString(36).substring(2, 9)}`,
              hn,
              sharer,
              'Snp',
              'SnpCleanInvalid',
              address,
              undefined,
              txn.id
            ));
          }
        } else {
          txn.state = 'MEM_READ';
          const snNode = this.getSNForAddress(address);
          if (!snNode) {
            console.warn(`Warning: No SN_F node found in grid. Failing transaction.`);
            txn.state = 'FAILED';
            txn.endTime = this.currentCycle;
            this.completeHNTransaction(hn, txn, address);
            return;
          }
          this.sendPacket(new Packet(
            `pkt_${Math.random().toString(36).substring(2, 9)}`,
            hn,
            snNode,
            'Req',
            'ReadShared',
            address,
            undefined,
            txn.id
          ));
        }
      } else if (p.opcode === 'ReadUnique' || p.opcode === 'WriteUnique') {
        const sharers = hn.directory[address];
        const otherSharers = sharers.filter(s => s.id !== txn.rn.id);
        
        if (otherSharers.length > 0) {
          txn.state = 'SNOOPING';
          for (const sharer of otherSharers) {
            txn.pendingSnoops.add(sharer.id);
            this.sendPacket(new Packet(
              `pkt_${Math.random().toString(36).substring(2, 9)}`,
              hn,
              sharer,
              'Snp',
              'SnpCleanInvalid',
              address,
              undefined,
              txn.id
            ));
          }
        } else {
          txn.state = 'MEM_READ';
          const snNode = this.getSNForAddress(address);
          if (!snNode) {
            console.warn(`Warning: No SN_F node found in grid. Failing transaction.`);
            txn.state = 'FAILED';
            txn.endTime = this.currentCycle;
            this.completeHNTransaction(hn, txn, address);
            return;
          }
          this.sendPacket(new Packet(
            `pkt_${Math.random().toString(36).substring(2, 9)}`,
            hn,
            snNode,
            'Req',
            p.opcode,
            address,
            txn.value,
            txn.id
          ));
        }
      }
    } else if (p.type === 'Rsp' && p.opcode === 'Resp') {
      txn.pendingSnoops.delete(p.src.id);
      if (p.data !== undefined && p.data !== null) {
        txn.snoopData = p.data;
      }
      
      if (txn.type !== 'ReadShared') {
        hn.directory[address] = hn.directory[address].filter(s => s.id !== p.src.id);
      }
      
      if (txn.pendingSnoops.size === 0) {
        if (txn.type === 'WriteUnique') {
          txn.state = 'MEM_READ';
          const snNode = this.getSNForAddress(address);
          if (!snNode) {
            console.warn(`Warning: No SN_F node found in grid. Failing transaction.`);
            txn.state = 'FAILED';
            txn.endTime = this.currentCycle;
            this.completeHNTransaction(hn, txn, address);
            return;
          }
          this.sendPacket(new Packet(
            `pkt_${Math.random().toString(36).substring(2, 9)}`,
            hn,
            snNode,
            'Req',
            'WriteUnique',
            address,
            txn.value,
            txn.id
          ));
        } else if (txn.snoopData !== undefined && txn.snoopData !== null) {
          txn.state = 'MEM_READ';
          const snNode = this.getSNForAddress(address);
          if (!snNode) {
            console.warn(`Warning: No SN_F node found in grid. Failing transaction.`);
            txn.state = 'FAILED';
            txn.endTime = this.currentCycle;
            this.completeHNTransaction(hn, txn, address);
            return;
          }
          this.sendPacket(new Packet(
            `pkt_${Math.random().toString(36).substring(2, 9)}`,
            hn,
            snNode,
            'Req',
            'WriteUnique',
            address,
            txn.snoopData,
            txn.id
          ));
        } else {
          txn.state = 'MEM_READ';
          const snNode = this.getSNForAddress(address);
          if (!snNode) {
            console.warn(`Warning: No SN_F node found in grid. Failing transaction.`);
            txn.state = 'FAILED';
            txn.endTime = this.currentCycle;
            this.completeHNTransaction(hn, txn, address);
            return;
          }
          this.sendPacket(new Packet(
            `pkt_${Math.random().toString(36).substring(2, 9)}`,
            hn,
            snNode,
            'Req',
            txn.type,
            address,
            undefined,
            txn.id
          ));
        }
      }
    } else if (p.type === 'Dat' && p.opcode === 'CompData') {
      txn.state = 'DATA_RESP';
      if (txn.type === 'ReadShared') {
        if (!hn.directory[address].some(s => s.id === txn.rn.id)) {
          hn.directory[address].push(txn.rn);
        }
      } else {
        hn.directory[address] = [txn.rn];
      }
      this.sendPacket(new Packet(
        `pkt_${Math.random().toString(36).substring(2, 9)}`,
        hn,
        txn.rn,
        'Dat',
        'CompData',
        address,
        p.data,
        txn.id
      ));
    } else if (p.type === 'Rsp' && p.opcode === 'Comp') {
      txn.endTime = this.currentCycle;
      txn.state = 'COMPLETED';
      this.completeHNTransaction(hn, txn, address);
    }
  }
  
  processPacketAtRN(p, rn, txn) {
    const address = p.address;
    if (p.type === 'Snp' && p.opcode === 'SnpCleanInvalid') {
      const cached = rn.cache[address] || { state: 'I', data: null };
      const oldData = cached.data;
      if (txn && txn.type === 'ReadShared') {
        rn.cache[address] = { state: 'SC', data: oldData };
      } else {
        rn.cache[address] = { state: 'I', data: null };
      }
      
      this.sendPacket(new Packet(
        `pkt_${Math.random().toString(36).substring(2, 9)}`,
        rn,
        p.src,
        'Rsp',
        'Resp',
        address,
        oldData,
        txn.id
      ));
    } else if (p.type === 'Dat' && p.opcode === 'CompData') {
      const hn = this.getHNForAddress(address);
      const sharers = hn.directory[address] || [];
      const otherSharers = sharers.filter(s => s.id !== rn.id);
      
      let state = 'UC';
      if (txn.type === 'ReadShared') {
        state = otherSharers.length > 0 ? 'SC' : 'UC';
      } else {
        state = 'UC';
      }
      
      let finalData = p.data;
      if (txn.type === 'WriteUnique') {
        finalData = txn.value;
      }
      
      rn.cache[address] = { state: state, data: finalData };
      
      this.sendPacket(new Packet(
        `pkt_${Math.random().toString(36).substring(2, 9)}`,
        rn,
        p.src,
        'Rsp',
        'Comp',
        address,
        undefined,
        txn.id
      ));
    }
  }
  
  processPacketAtSN(p, sn, txn) {
    const address = p.address;
    if (p.type === 'Req') {
      if (p.opcode === 'WriteUnique') {
        sn.memory[address] = p.data;
        this.sendPacket(new Packet(
          `pkt_${Math.random().toString(36).substring(2, 9)}`,
          sn,
          p.src,
          'Dat',
          'CompData',
          address,
          p.data,
          txn.id
        ));
      } else if (p.opcode === 'ReadShared' || p.opcode === 'ReadUnique') {
        const data = sn.memory[address] !== undefined ? sn.memory[address] : 0;
        this.sendPacket(new Packet(
          `pkt_${Math.random().toString(36).substring(2, 9)}`,
          sn,
          p.src,
          'Dat',
          'CompData',
          address,
          data,
          txn.id
        ));
      }
    }
  }
  
  runScenario(scenarioObj) {
    if (!scenarioObj) {
      scenarioObj = {};
    }
    if (!scenarioObj.grid || typeof scenarioObj.grid.width !== 'number' || typeof scenarioObj.grid.height !== 'number') {
      scenarioObj.grid = { width: 0, height: 0 };
    }
    if (!scenarioObj.initial_state) {
      scenarioObj.initial_state = { nodes: [] };
    }
    if (!Array.isArray(scenarioObj.initial_state.nodes)) {
      scenarioObj.initial_state.nodes = [];
    }
    if (!scenarioObj.transactions || !Array.isArray(scenarioObj.transactions)) {
      scenarioObj.transactions = [];
    }

    const grid = new MeshGrid(scenarioObj.grid.width, scenarioObj.grid.height);
    
    // Spawn nodes
    for (const nodeSpec of scenarioObj.initial_state.nodes) {
      if (!nodeSpec || typeof nodeSpec.x !== 'number' || typeof nodeSpec.y !== 'number') {
        console.warn(`Warning: Node specification missing coordinates. Skipping.`);
        continue;
      }
      if (nodeSpec.x < 0 || nodeSpec.x >= grid.width || nodeSpec.y < 0 || nodeSpec.y >= grid.height) {
        console.warn(`Warning: Node coordinate [${nodeSpec.x}, ${nodeSpec.y}] out of bounds. Skipping node.`);
        continue;
      }
      let node;
      const id = `${nodeSpec.type}_${nodeSpec.x}_${nodeSpec.y}`;
      if (nodeSpec.type === 'RN_F') {
        node = new RN_F(nodeSpec.x, nodeSpec.y, id);
      } else if (nodeSpec.type === 'HN_F') {
        node = new HN_F(nodeSpec.x, nodeSpec.y, id);
      } else if (nodeSpec.type === 'SN_F') {
        node = new SN_F(nodeSpec.x, nodeSpec.y, id);
      }
      if (node) {
        grid.setNode(nodeSpec.x, nodeSpec.y, node);
      }
    }
    
    // Populate cache and memory and directory
    for (const nodeSpec of scenarioObj.initial_state.nodes) {
      if (!nodeSpec || typeof nodeSpec.x !== 'number' || typeof nodeSpec.y !== 'number') {
        continue;
      }
      if (nodeSpec.x < 0 || nodeSpec.x >= grid.width || nodeSpec.y < 0 || nodeSpec.y >= grid.height) {
        continue;
      }
      const node = grid.getNode(nodeSpec.x, nodeSpec.y);
      if (node) {
        if (nodeSpec.type === 'RN_F' && nodeSpec.cache) {
          for (const [addr, entrySpec] of Object.entries(nodeSpec.cache)) {
            if (entrySpec) {
              node.cache[addr] = { state: entrySpec.state, data: entrySpec.data };
            }
          }
        } else if (nodeSpec.type === 'SN_F' && nodeSpec.memory) {
          for (const [addr, val] of Object.entries(nodeSpec.memory)) {
            node.memory[addr] = val;
          }
        } else if (nodeSpec.type === 'HN_F' && nodeSpec.directory) {
          for (const [addr, sharerCoords] of Object.entries(nodeSpec.directory)) {
            if (Array.isArray(sharerCoords)) {
              node.directory[addr] = sharerCoords.map(([sx, sy]) => {
                if (typeof sx !== 'number' || typeof sy !== 'number') return null;
                const sharerNode = grid.getNode(sx, sy);
                if (!sharerNode) {
                  console.warn(`Warning: Sharer node at (${sx}, ${sy}) not found in grid`);
                }
                return sharerNode;
              }).filter(Boolean);
            }
          }
        }
      }
    }
    
    this.meshGrid = grid;
    const txnsToTrigger = [...scenarioObj.transactions];
    const txnRecordIds = [];
    let transactionsTriggeredCount = 0;
    const maxCycles = 2000;
    
    while (this.currentCycle < maxCycles) {
      // 1. Queue scheduled transactions
      const currentTxns = txnsToTrigger.filter(t => t && t.cycle === this.currentCycle);
      for (const t of currentTxns) {
        if (!t || !t.src || !Array.isArray(t.src) || t.src.length < 2 || typeof t.src[0] !== 'number' || typeof t.src[1] !== 'number') {
          console.warn(`Warning: Transaction is missing source coordinates or invalid. Skipping.`);
          transactionsTriggeredCount++;
          continue;
        }
        const rnNode = grid.getNode(t.src[0], t.src[1]);
        if (!rnNode) {
          console.warn(`Warning: Transaction source node RN_F at [${t.src[0]}, ${t.src[1]}] not found in grid. Skipping.`);
          transactionsTriggeredCount++;
          continue;
        }
        try {
          const txnId = this.queueTransaction({
            type: t.type,
            address: t.address,
            node: rnNode,
            value: t.data
          });
          txnRecordIds.push(txnId);
        } catch (err) {
          console.error(`Error: Failed to queue transaction: ${err.message}`);
        }
        transactionsTriggeredCount++;
      }
      
      // 2. Step
      this.step();
      
      // 3. Termination Check
      const activeTxns = Array.from(this.transactions.values()).filter(t => t.endTime === null);
      if (this.activePackets.length === 0 && 
          this.pendingEvents.length === 0 && 
          activeTxns.length === 0 && 
          transactionsTriggeredCount === txnsToTrigger.length) {
        break;
      }
    }
    
    // Compile summary
    const txSummary = [];
    let totalLatency = 0;
    let totalHops = 0;
    let completedCount = 0;
    
    for (const txnId of txnRecordIds) {
      const txn = this.transactions.get(txnId);
      const latency = txn.endTime ? (txn.endTime - txn.startTime) : maxCycles;
      txSummary.push({
        id: txn.id,
        type: txn.type,
        address: txn.address,
        nodeId: txn.rn.id,
        latency: latency,
        hops: txn.hops,
        status: txn.endTime ? 'COMPLETED' : 'FAILED',
        path: txn.path.map(p => [p.x, p.y])
      });
      if (txn.endTime) {
        totalLatency += latency;
        totalHops += txn.hops;
        completedCount++;
      }
    }
    
    const finalCacheStates = [];
    const finalDirectoryStates = [];
    const finalMemoryStates = [];
    
    const caches = {};
    const directories = {};
    const memory = {};
    
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const node = grid.getNode(x, y);
        if (node) {
          if (node.type === 'RN_F') {
            caches[node.id] = node.cache;
            for (const [addr, entry] of Object.entries(node.cache)) {
              finalCacheStates.push({
                node: [x, y],
                address: addr,
                state: entry.state,
                data: entry.data
              });
            }
          } else if (node.type === 'HN_F') {
            directories[node.id] = {};
            for (const [addr, sharers] of Object.entries(node.directory)) {
              directories[node.id][addr] = sharers.map(s => s.id);
              finalDirectoryStates.push({
                node: [x, y],
                address: addr,
                sharers: sharers.map(s => [s.x, s.y])
              });
            }
          } else if (node.type === 'SN_F') {
            memory[node.id] = node.memory;
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
    
    return {
      totalCycles: this.currentCycle,
      averageLatency: completedCount > 0 ? totalLatency / completedCount : 0,
      totalHops: totalHops,
      transactions: txSummary,
      opcodesObserved: Array.from(this.opcodesObserved),
      finalStates: {
        caches,
        directories,
        memory,
        final_cache_states: finalCacheStates,
        final_directory_states: finalDirectoryStates,
        final_memory_states: finalMemoryStates
      }
    };
  }
}
