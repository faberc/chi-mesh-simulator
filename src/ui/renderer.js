export class Renderer {
  constructor(svgContainerId, tooltipId) {
    this.container = document.getElementById(svgContainerId);
    this.tooltip = document.getElementById(tooltipId);
    this.nodePositions = new Map(); // "x,y" -> {x, y} pixel coordinates
    this.padding = 60;
    
    // Theme colors
    this.colors = {
      RN_F: '#00d2ff',
      HN_F: '#9d4edd',
      SN_F: '#10b981',
      link: 'rgba(255, 255, 255, 0.08)',
      linkActive: 'rgba(0, 210, 255, 0.25)',
      Req: '#ffd166',
      Snp: '#b500ff',
      Rsp: '#00e5ff',
      Dat: '#06d6a0'
    };
  }

  // Draw the whole mesh grid
  drawMesh(grid, selectedNode, simState = {}) {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.nodePositions.clear();

    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 450;
    
    const cols = grid.width;
    const rows = grid.height;
    
    const gapX = cols > 1 ? (width - 2 * this.padding) / (cols - 1) : 0;
    const gapY = rows > 1 ? (height - 2 * this.padding) / (rows - 1) : 0;

    // 1. Calculate and store node positions
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = cols > 1 ? this.padding + x * gapX : width / 2;
        const py = rows > 1 ? this.padding + y * gapY : height / 2;
        this.nodePositions.set(`${x},${y}`, { x: px, y: py });
      }
    }

    // Create SVG root
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    
    // Draw grid connections (links)
    const linksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    linksGroup.setAttribute('id', 'links-group');
    svg.appendChild(linksGroup);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const start = this.nodePositions.get(`${x},${y}`);
        
        // Horizontal connection to right adjacent
        if (x < cols - 1) {
          const end = this.nodePositions.get(`${x+1},${y}`);
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', start.x);
          line.setAttribute('y1', start.y);
          line.setAttribute('x2', end.x);
          line.setAttribute('y2', end.y);
          line.setAttribute('class', 'link-line');
          line.setAttribute('id', `link-h-${x}-${y}`);
          linksGroup.appendChild(line);
        }
        
        // Vertical connection to bottom adjacent
        if (y < rows - 1) {
          const end = this.nodePositions.get(`${x},${y+1}`);
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', start.x);
          line.setAttribute('y1', start.y);
          line.setAttribute('x2', end.x);
          line.setAttribute('y2', end.y);
          line.setAttribute('class', 'link-line');
          line.setAttribute('id', `link-v-${x}-${y}`);
          linksGroup.appendChild(line);
        }
      }
    }

    // Group for nodes
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodesGroup.setAttribute('id', 'nodes-group');
    svg.appendChild(nodesGroup);

    // Draw nodes
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const node = grid.getNode(x, y);
        const pos = this.nodePositions.get(`${x},${y}`);
        if (!pos) continue;

        const nodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeG.setAttribute('id', `node-group-${x}-${y}`);
        nodeG.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

        if (!node) {
          // Render a smaller Router (RTR) node
          nodeG.setAttribute('class', 'node-group rtr-node-group');

          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('class', 'node-circle rtr-circle');
          circle.setAttribute('r', '9'); // Smaller circle
          circle.setAttribute('fill', '#0a0d16'); // Background matching page
          circle.setAttribute('stroke', '#475569'); // Gray border
          circle.setAttribute('stroke-width', '1.5');
          nodeG.appendChild(circle);

          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('class', 'node-text rtr-text');
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'middle');
          text.setAttribute('font-size', '8px');
          text.setAttribute('fill', '#64748b');
          text.textContent = 'RTR';
          nodeG.appendChild(text);

          const rtrNode = { x, y, type: 'RTR', id: `RTR_${x}_${y}` };

          nodeG.addEventListener('mouseenter', (e) => {
            this.showTooltip(rtrNode, e.clientX, e.clientY);
          });
          nodeG.addEventListener('mousemove', (e) => {
            this.moveTooltip(e.clientX, e.clientY);
          });
          nodeG.addEventListener('mouseleave', () => {
            this.hideTooltip();
          });

          nodesGroup.appendChild(nodeG);
          continue;
        }

        nodeG.setAttribute('class', 'node-group');
        
        // Highlight ring if selected
        if (selectedNode && selectedNode.x === x && selectedNode.y === y) {
          const selectedRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          selectedRing.setAttribute('class', 'selected-ring');
          selectedRing.setAttribute('r', '26');
          selectedRing.setAttribute('fill', 'none');
          selectedRing.setAttribute('stroke', '#facc15');
          selectedRing.setAttribute('stroke-width', '2');
          selectedRing.setAttribute('stroke-dasharray', '4 2');
          
          // Pulsing animation
          const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
          animate.setAttribute('attributeName', 'stroke-dashoffset');
          animate.setAttribute('values', '0;12');
          animate.setAttribute('dur', '1.5s');
          animate.setAttribute('repeatCount', 'indefinite');
          selectedRing.appendChild(animate);
          
          nodeG.appendChild(selectedRing);
        }

        // Node main circle
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', 'node-circle');
        circle.setAttribute('r', '20');
        circle.setAttribute('fill', '#151d30');
        circle.setAttribute('stroke', this.colors[node.type] || '#fff');
        circle.setAttribute('stroke-width', '2.5');
        nodeG.appendChild(circle);

        // Node ID label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'node-text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('dy', '-2');
        text.textContent = node.type.split('_')[0]; // RN, HN, SN
        nodeG.appendChild(text);

        // Coordinates Label
        const coordText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        coordText.setAttribute('class', 'node-coord-text');
        coordText.setAttribute('text-anchor', 'middle');
        coordText.setAttribute('dy', '12');
        coordText.textContent = `[${x},${y}]`;
        nodeG.appendChild(coordText);

        // Display cache state badge beside Request Nodes (RN_F)
        if (node.type === 'RN_F') {
          // If node has cache entries, show state badge of the active address (or last one)
          const addresses = Object.keys(node.cache);
          if (addresses.length > 0) {
            const lastAddr = addresses[addresses.length - 1];
            const cacheEntry = node.cache[lastAddr];
            const state = cacheEntry.state;
            
            const badgeBgColor = state === 'UC' ? 'var(--state-uc)' : state === 'SC' ? 'var(--state-sc)' : 'var(--state-i)';
            
            const badgeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            badgeG.setAttribute('class', 'badge-group');
            badgeG.setAttribute('transform', 'translate(14, -14)');
            
            const badgeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            badgeRect.setAttribute('x', '-8');
            badgeRect.setAttribute('y', '-6');
            badgeRect.setAttribute('width', '16');
            badgeRect.setAttribute('height', '12');
            badgeRect.setAttribute('rx', '3');
            badgeRect.setAttribute('fill', badgeBgColor);
            badgeRect.setAttribute('stroke', 'rgba(0,0,0,0.2)');
            badgeG.appendChild(badgeRect);

            const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badgeText.setAttribute('class', 'cache-badge');
            badgeText.textContent = state;
            badgeG.appendChild(badgeText);
            
            nodeG.appendChild(badgeG);
          }
        }

        // Attach mouse events
        nodeG.addEventListener('click', (e) => {
          if (simState.onNodeClick) {
            simState.onNodeClick(node);
          }
        });

        nodeG.addEventListener('mouseenter', (e) => {
          this.showTooltip(node, e.clientX, e.clientY);
        });

        nodeG.addEventListener('mousemove', (e) => {
          this.moveTooltip(e.clientX, e.clientY);
        });

        nodeG.addEventListener('mouseleave', () => {
          this.hideTooltip();
        });

        nodesGroup.appendChild(nodeG);
      }
    }

    // Group for active animating packets
    const packetsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    packetsGroup.setAttribute('id', 'packets-group');
    svg.appendChild(packetsGroup);

    this.container.appendChild(svg);
  }

  // Animate dynamic packets smoothly along links
  animatePackets(movements, speedValue) {
    const packetsGroup = document.getElementById('packets-group');
    if (!packetsGroup || !movements || movements.length === 0) return;

    // Animation transition speed derived from slider (duration between steps)
    const transitionDuration = Math.max(150, 1000 / speedValue - 50);

    for (const m of movements) {
      const startPos = this.nodePositions.get(`${m.from.x},${m.from.y}`);
      const endPos = this.nodePositions.get(`${m.to.x},${m.to.y}`);
      if (!startPos || !endPos) {
        console.warn(`ANIMATE PACKET: Missing position for ${m.from.x},${m.from.y} or ${m.to.x},${m.to.y}`);
        continue;
      }
      console.log(`ANIMATE PACKET: ${m.packetId} from [${m.from.x},${m.from.y}] (${startPos.x},${startPos.y}) to [${m.to.x},${m.to.y}] (${endPos.x},${endPos.y})`);

      const packetColor = this.colors[m.type] || '#ffd166';

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'packet-dot');
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', packetColor);
      circle.setAttribute('stroke', '#0a0d16');
      circle.setAttribute('stroke-width', '1.5');
      circle.style.setProperty('--color', packetColor);
      
      // Set initial position
      circle.setAttribute('cx', startPos.x);
      circle.setAttribute('cy', startPos.y);

      // Glow style
      circle.setAttribute('style', `transition: cx ${transitionDuration}ms linear, cy ${transitionDuration}ms linear;`);
      
      packetsGroup.appendChild(circle);

      // Force layout calculation, then trigger CSS slide to destination
      requestAnimationFrame(() => {
        circle.setAttribute('cx', endPos.x);
        circle.setAttribute('cy', endPos.y);
      });

      // Remove the packet indicator from SVG once transition completes
      setTimeout(() => {
        if (circle.parentNode) {
          circle.parentNode.removeChild(circle);
        }
      }, transitionDuration + 50);
    }
  }

  // Interactive tooltip behaviors
  showTooltip(node, x, y) {
    if (!this.tooltip) return;
    
    let headerText = `${node.type} Node: [${node.x}, ${node.y}]`;
    let bodyHtml = '';

    if (node.type === 'RN_F') {
      const keys = Object.keys(node.cache);
      if (keys.length === 0) {
        bodyHtml = '<div style="color:var(--text-secondary)">Cache empty (Invalid state)</div>';
      } else {
        bodyHtml = '<table style="width:100%; border-collapse:collapse; margin-top:5px;">';
        bodyHtml += '<tr style="border-bottom:1px solid rgba(255,255,255,0.06); text-align:left; color:var(--text-secondary);"><th style="padding-bottom:4px;">Addr</th><th style="padding-bottom:4px;">State</th><th style="padding-bottom:4px;">Data</th></tr>';
        for (const [addr, entry] of Object.entries(node.cache)) {
          const stateColor = entry.state === 'UC' ? '#34d399' : entry.state === 'SC' ? '#38bdf8' : '#64748b';
          bodyHtml += `<tr><td style="font-family:monospace; padding:3px 0;">${addr}</td><td style="color:${stateColor}; font-weight:600;">${entry.state}</td><td style="font-family:monospace; color:#ffd166;">${entry.data !== null ? entry.data : '-'}</td></tr>`;
        }
        bodyHtml += '</table>';
      }
    } else if (node.type === 'HN_F') {
      const keys = Object.keys(node.directory);
      if (keys.length === 0) {
        bodyHtml = '<div style="color:var(--text-secondary)">No active directory tracks</div>';
      } else {
        bodyHtml = '<table style="width:100%; border-collapse:collapse; margin-top:5px;">';
        bodyHtml += '<tr style="border-bottom:1px solid rgba(255,255,255,0.06); text-align:left; color:var(--text-secondary);"><th style="padding-bottom:4px;">Addr</th><th style="padding-bottom:4px;">Sharer Nodes</th></tr>';
        for (const [addr, sharers] of Object.entries(node.directory)) {
          const names = sharers.map(s => `[${s.x},${s.y}]`).join(', ');
          bodyHtml += `<tr><td style="font-family:monospace; padding:3px 0;">${addr}</td><td style="color:var(--text-primary);">${names || 'None'}</td></tr>`;
        }
        bodyHtml += '</table>';
      }
    } else if (node.type === 'SN_F') {
      const keys = Object.keys(node.memory);
      if (keys.length === 0) {
        bodyHtml = '<div style="color:var(--text-secondary)">Memory holds defaults (0)</div>';
      } else {
        bodyHtml = '<table style="width:100%; border-collapse:collapse; margin-top:5px;">';
        bodyHtml += '<tr style="border-bottom:1px solid rgba(255,255,255,0.06); text-align:left; color:var(--text-secondary);"><th style="padding-bottom:4px;">Addr</th><th style="padding-bottom:4px;">Value</th></tr>';
        for (const [addr, val] of Object.entries(node.memory)) {
          bodyHtml += `<tr><td style="font-family:monospace; padding:3px 0;">${addr}</td><td style="font-family:monospace; color:#ffd166;">${val}</td></tr>`;
        }
        bodyHtml += '</table>';
      }
    } else if (node.type === 'RTR') {
      bodyHtml = '<div style="color:var(--text-secondary)">NoC router forwarding packets along grid paths.</div>';
    }

    document.getElementById('tooltip-header').textContent = headerText;
    document.getElementById('tooltip-body').innerHTML = bodyHtml;
    
    this.tooltip.style.opacity = '1';
    this.moveTooltip(x, y);
  }

  moveTooltip(x, y) {
    if (!this.tooltip) return;
    // Offset slightly from cursor
    const offsetX = 15;
    const offsetY = 15;
    
    // Bounds control inside viewport
    const tooltipWidth = this.tooltip.clientWidth;
    const tooltipHeight = this.tooltip.clientHeight;
    
    let left = x + offsetX;
    let top = y + offsetY;
    
    if (left + tooltipWidth > window.innerWidth) {
      left = x - tooltipWidth - offsetX;
    }
    if (top + tooltipHeight > window.innerHeight) {
      top = y - tooltipHeight - offsetY;
    }
    
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.style.opacity = '0';
  }

  // Update dynamic states without resetting the entire SVG DOM and wiping packets
  updateNodeDynamicStates(grid, selectedNode) {
    if (!this.container) return;
    
    const svg = this.container.querySelector('svg');
    if (!svg) return;

    // 1. Update Selected Node Highlight Ring
    const existingRings = svg.querySelectorAll('.selected-ring');
    existingRings.forEach(ring => {
      if (ring.parentNode) {
        ring.parentNode.removeChild(ring);
      }
    });

    if (selectedNode) {
      const nodeG = svg.getElementById(`node-group-${selectedNode.x}-${selectedNode.y}`);
      if (nodeG) {
        const selectedRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        selectedRing.setAttribute('class', 'selected-ring');
        selectedRing.setAttribute('r', '26');
        selectedRing.setAttribute('fill', 'none');
        selectedRing.setAttribute('stroke', '#facc15');
        selectedRing.setAttribute('stroke-width', '2');
        selectedRing.setAttribute('stroke-dasharray', '4 2');
        
        const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        animate.setAttribute('attributeName', 'stroke-dashoffset');
        animate.setAttribute('values', '0;12');
        animate.setAttribute('dur', '1.5s');
        animate.setAttribute('repeatCount', 'indefinite');
        selectedRing.appendChild(animate);
        
        // Insert selection ring before the main circle so it renders underneath
        nodeG.insertBefore(selectedRing, nodeG.firstChild);
      }
    }

    // 2. Update Cache Badges for RN_F Nodes
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const node = grid.getNode(x, y);
        if (!node) continue;

        const nodeG = svg.getElementById(`node-group-${x}-${y}`);
        if (!nodeG) continue;

        const existingBadge = nodeG.querySelector('.badge-group');
        if (existingBadge) {
          existingBadge.parentNode.removeChild(existingBadge);
        }

        if (node.type === 'RN_F') {
          const addresses = Object.keys(node.cache);
          if (addresses.length > 0) {
            const lastAddr = addresses[addresses.length - 1];
            const cacheEntry = node.cache[lastAddr];
            const state = cacheEntry.state;
            
            const badgeBgColor = state === 'UC' ? 'var(--state-uc)' : state === 'SC' ? 'var(--state-sc)' : 'var(--state-i)';
            
            const badgeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            badgeG.setAttribute('class', 'badge-group');
            badgeG.setAttribute('transform', 'translate(14, -14)');
            
            const badgeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            badgeRect.setAttribute('x', '-8');
            badgeRect.setAttribute('y', '-6');
            badgeRect.setAttribute('width', '16');
            badgeRect.setAttribute('height', '12');
            badgeRect.setAttribute('rx', '3');
            badgeRect.setAttribute('fill', badgeBgColor);
            badgeRect.setAttribute('stroke', 'rgba(0,0,0,0.2)');
            badgeG.appendChild(badgeRect);

            const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badgeText.setAttribute('class', 'cache-badge');
            badgeText.textContent = state;
            badgeG.appendChild(badgeText);
            
            nodeG.appendChild(badgeG);
          }
        }
      }
    }
  }

  // Draw dynamic protocol sequence diagram
  drawSequenceDiagram(containerId, simulator) {
    const container = document.getElementById(containerId);
    if (!container || !simulator) return;

    container.innerHTML = '';

    const grid = simulator.meshGrid;
    const functionalNodes = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const node = grid.getNode(x, y);
        if (node) {
          functionalNodes.push(node);
        }
      }
    }

    const typeOrder = { 'RN_F': 0, 'HN_F': 1, 'SN_F': 2 };
    functionalNodes.sort((a, b) => {
      if (typeOrder[a.type] !== typeOrder[b.type]) {
        return typeOrder[a.type] - typeOrder[b.type];
      }
      return a.id.localeCompare(b.id);
    });

    if (functionalNodes.length === 0) {
      container.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:40px;">No functional nodes configured.</div>';
      return;
    }

    const leftMargin = 100;
    const columnWidth = 155;
    const headerHeight = 80;
    const rowHeight = 55;
    const paddingBottom = 40;
    const events = simulator.sequenceEvents || [];
    const N = events.length;

    const svgWidth = leftMargin + functionalNodes.length * columnWidth + 50;
    const svgHeight = Math.max(450, headerHeight + N * rowHeight + paddingBottom);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', svgHeight);
    svg.style.background = 'transparent';

    // Create defs
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    // Arrowheads for packet types
    const packetTypes = ['Req', 'Snp', 'Rsp', 'Dat'];
    packetTypes.forEach(type => {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', `seq-arrow-${type}`);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '8');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '6');
      marker.setAttribute('markerHeight', '6');
      marker.setAttribute('orient', 'auto');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M 0 1.5 L 8 5 L 0 8.5 z');
      path.setAttribute('fill', this.colors[type] || '#ffd166');
      marker.appendChild(path);
      defs.appendChild(marker);
    });

    // Glow filter
    const glowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    glowFilter.setAttribute('id', 'seq-glow');
    glowFilter.setAttribute('x', '-20%');
    glowFilter.setAttribute('y', '-20%');
    glowFilter.setAttribute('width', '140%');
    glowFilter.setAttribute('height', '140%');

    const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '4');
    blur.setAttribute('result', 'blur');
    glowFilter.appendChild(blur);

    const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const node1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    node1.setAttribute('in', 'blur');
    const node2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    node2.setAttribute('in', 'SourceGraphic');
    merge.appendChild(node1);
    merge.appendChild(node2);
    glowFilter.appendChild(merge);
    defs.appendChild(glowFilter);

    svg.appendChild(defs);

    // Draw timeline vertical path
    const timeLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    timeLine.setAttribute('x1', '60');
    timeLine.setAttribute('y1', headerHeight);
    timeLine.setAttribute('x2', '60');
    timeLine.setAttribute('y2', svgHeight - paddingBottom);
    timeLine.setAttribute('stroke', 'rgba(255, 255, 255, 0.15)');
    timeLine.setAttribute('stroke-width', '2');
    svg.appendChild(timeLine);

    // Draw lifelines
    functionalNodes.forEach((node, i) => {
      const cx = leftMargin + i * columnWidth + columnWidth / 2;
      const lifeline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      lifeline.setAttribute('x1', cx);
      lifeline.setAttribute('y1', headerHeight);
      lifeline.setAttribute('x2', cx);
      lifeline.setAttribute('y2', svgHeight - paddingBottom);
      lifeline.setAttribute('stroke', 'rgba(255, 255, 255, 0.08)');
      lifeline.setAttribute('stroke-width', '1.5');
      lifeline.setAttribute('stroke-dasharray', '5 5');
      lifeline.setAttribute('class', 'sequence-lifeline');
      lifeline.setAttribute('id', `seq-lifeline-${node.id}`);
      svg.appendChild(lifeline);
    });

    // Draw headers
    functionalNodes.forEach((node, i) => {
      const cx = leftMargin + i * columnWidth + columnWidth / 2;
      const boxWidth = 125;
      const boxHeight = 44;
      const rx = 8;

      const headerG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      headerG.setAttribute('transform', `translate(${cx - boxWidth / 2}, 15)`);
      headerG.setAttribute('class', 'seq-header-node');
      headerG.style.cursor = 'pointer';

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', boxWidth);
      rect.setAttribute('height', boxHeight);
      rect.setAttribute('rx', rx);
      rect.setAttribute('fill', '#151d30');
      rect.setAttribute('stroke', this.colors[node.type] || '#fff');
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('filter', 'drop-shadow(0 4px 6px rgba(0,0,0,0.35))');
      headerG.appendChild(rect);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', boxWidth / 2);
      text.setAttribute('y', 18);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#ffffff');
      text.setAttribute('font-family', 'var(--font-title)');
      text.setAttribute('font-weight', '700');
      text.setAttribute('font-size', '12px');
      text.textContent = node.id;
      headerG.appendChild(text);

      const typeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      typeText.setAttribute('x', boxWidth / 2);
      typeText.setAttribute('y', 32);
      typeText.setAttribute('text-anchor', 'middle');
      typeText.setAttribute('fill', 'var(--text-secondary)');
      typeText.setAttribute('font-family', 'var(--font-body)');
      typeText.setAttribute('font-size', '9px');
      typeText.textContent = node.type.replace('_', '-');
      headerG.appendChild(typeText);

      headerG.addEventListener('mouseenter', () => {
        rect.setAttribute('fill', 'rgba(30, 41, 69, 0.8)');
        rect.setAttribute('stroke-width', '2.5');
        const lifeline = svg.getElementById(`seq-lifeline-${node.id}`);
        if (lifeline) {
          lifeline.setAttribute('stroke', this.colors[node.type]);
          lifeline.setAttribute('stroke-width', '2.5');
          lifeline.removeAttribute('stroke-dasharray');
        }
      });
      headerG.addEventListener('mouseleave', () => {
        rect.setAttribute('fill', '#151d30');
        rect.setAttribute('stroke-width', '2');
        const lifeline = svg.getElementById(`seq-lifeline-${node.id}`);
        if (lifeline) {
          lifeline.setAttribute('stroke', 'rgba(255, 255, 255, 0.08)');
          lifeline.setAttribute('stroke-width', '1.5');
          lifeline.setAttribute('stroke-dasharray', '5 5');
        }
      });

      svg.appendChild(headerG);
    });

    // Draw message arrows
    if (N === 0) {
      const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      placeholder.setAttribute('x', svgWidth / 2);
      placeholder.setAttribute('y', svgHeight / 2);
      placeholder.setAttribute('text-anchor', 'middle');
      placeholder.setAttribute('fill', 'var(--text-secondary)');
      placeholder.setAttribute('font-size', '13px');
      placeholder.setAttribute('font-family', 'var(--font-body)');
      placeholder.textContent = 'Awaiting transactions. Step or Play simulation to visualize sequence.';
      svg.appendChild(placeholder);
    } else {
      events.forEach((ev, idx) => {
        const y = headerHeight + idx * rowHeight + rowHeight / 2;

        // Cycle annotation on time axis
        const timeTick = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        timeTick.setAttribute('cx', '60');
        timeTick.setAttribute('cy', y);
        timeTick.setAttribute('r', '4');
        timeTick.setAttribute('fill', 'var(--rn-color)');
        svg.appendChild(timeTick);

        const timeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        timeText.setAttribute('x', '45');
        timeText.setAttribute('y', y + 3.5);
        timeText.setAttribute('text-anchor', 'end');
        timeText.setAttribute('fill', 'var(--text-secondary)');
        timeText.setAttribute('font-family', 'monospace');
        timeText.setAttribute('font-size', '10px');
        timeText.textContent = `Cyc ${ev.cycle}`;
        svg.appendChild(timeText);

        const srcIdx = functionalNodes.findIndex(n => n.id === ev.srcId);
        const destIdx = functionalNodes.findIndex(n => n.id === ev.destId);

        if (srcIdx !== -1 && destIdx !== -1) {
          const xSrc = leftMargin + srcIdx * columnWidth + columnWidth / 2;
          const xDest = leftMargin + destIdx * columnWidth + columnWidth / 2;
          const arrowColor = this.colors[ev.type] || '#ffd166';

          const msgG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          msgG.setAttribute('class', 'message-group');
          msgG.style.cursor = 'pointer';

          const offset = 8;
          let x1, x2;
          if (xSrc < xDest) {
            x1 = xSrc + offset;
            x2 = xDest - offset;
          } else if (xSrc > xDest) {
            x1 = xSrc - offset;
            x2 = xDest + offset;
          } else {
            x1 = xSrc;
            x2 = xSrc;
          }

          let path;
          if (x1 === x2) {
            path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const loopRadius = 15;
            path.setAttribute('d', `M ${x1} ${y - 10} C ${x1 + loopRadius * 2} ${y - loopRadius}, ${x1 + loopRadius * 2} ${y + loopRadius}, ${x1} ${y + 10}`);
            path.setAttribute('stroke', arrowColor);
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', `url(#seq-arrow-${ev.type})`);
          } else {
            path = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            path.setAttribute('x1', x1);
            path.setAttribute('y1', y);
            path.setAttribute('x2', x2);
            path.setAttribute('y2', y);
            path.setAttribute('stroke', arrowColor);
            path.setAttribute('stroke-width', '2');
            path.setAttribute('marker-end', `url(#seq-arrow-${ev.type})`);
          }

          const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          label.setAttribute('x', (xSrc + xDest) / 2 + (x1 === x2 ? 24 : 0));
          label.setAttribute('y', y - 6);
          label.setAttribute('text-anchor', x1 === x2 ? 'start' : 'middle');
          label.setAttribute('fill', arrowColor);
          label.setAttribute('font-family', 'var(--font-body)');
          label.setAttribute('font-weight', '600');
          label.setAttribute('font-size', '11px');
          label.textContent = ev.opcode;

          const subLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          subLabel.setAttribute('x', (xSrc + xDest) / 2 + (x1 === x2 ? 24 : 0));
          subLabel.setAttribute('y', y + 13);
          subLabel.setAttribute('text-anchor', x1 === x2 ? 'start' : 'middle');
          subLabel.setAttribute('fill', 'var(--text-secondary)');
          subLabel.setAttribute('font-family', 'monospace');
          subLabel.setAttribute('font-size', '8.5px');
          subLabel.textContent = ev.packetId;

          msgG.appendChild(path);
          msgG.appendChild(label);
          msgG.appendChild(subLabel);

          msgG.addEventListener('mouseenter', (e) => {
            path.setAttribute('stroke-width', '3.5');
            path.setAttribute('filter', 'url(#seq-glow)');
            this.showPacketTooltip(ev, e.clientX, e.clientY);

            const srcLifeline = svg.getElementById(`seq-lifeline-${ev.srcId}`);
            const destLifeline = svg.getElementById(`seq-lifeline-${ev.destId}`);
            if (srcLifeline) {
              srcLifeline.setAttribute('stroke', 'rgba(255, 255, 255, 0.4)');
              srcLifeline.setAttribute('stroke-width', '2');
            }
            if (destLifeline) {
              destLifeline.setAttribute('stroke', 'rgba(255, 255, 255, 0.4)');
              destLifeline.setAttribute('stroke-width', '2');
            }
          });

          msgG.addEventListener('mousemove', (e) => {
            this.moveTooltip(e.clientX, e.clientY);
          });

          msgG.addEventListener('mouseleave', () => {
            path.setAttribute('stroke-width', '2');
            path.removeAttribute('filter');
            this.hideTooltip();

            const srcLifeline = svg.getElementById(`seq-lifeline-${ev.srcId}`);
            const destLifeline = svg.getElementById(`seq-lifeline-${ev.destId}`);
            if (srcLifeline) {
              srcLifeline.setAttribute('stroke', 'rgba(255, 255, 255, 0.08)');
              srcLifeline.setAttribute('stroke-width', '1.5');
            }
            if (destLifeline) {
              destLifeline.setAttribute('stroke', 'rgba(255, 255, 255, 0.08)');
              destLifeline.setAttribute('stroke-width', '1.5');
            }
          });

          svg.appendChild(msgG);
        }
      });
    }

    container.appendChild(svg);

    const parentContainer = container.closest('.sequence-container');
    if (parentContainer) {
      parentContainer.scrollTop = parentContainer.scrollHeight;
    }
  }

  // Display detailed information about sequence events in the tooltip
  showPacketTooltip(event, x, y) {
    if (!this.tooltip) return;

    const headerText = `Packet Info`;
    const bodyHtml = `
      <div style="display:flex; flex-direction:column; gap:6px; font-family:monospace; min-width:180px;">
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-secondary)">ID:</span>
          <span style="color:#fff; font-weight:bold;">${event.packetId}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="color:var(--text-secondary)">Type:</span>
          <span class="tag type-${event.type.toLowerCase()}">${event.type}</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-secondary)">Opcode:</span>
          <span style="color:var(--rn-color); font-weight:bold;">${event.opcode}</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-secondary)">Processed:</span>
          <span style="color:#ffd166; font-weight:bold;">Cyc ${event.cycle}</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-secondary)">Source:</span>
          <span style="color:#fff;">${event.srcId}</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-secondary)">Dest:</span>
          <span style="color:#fff;">${event.destId}</span>
        </div>
      </div>
    `;

    document.getElementById('tooltip-header').textContent = headerText;
    document.getElementById('tooltip-body').innerHTML = bodyHtml;

    this.tooltip.style.opacity = '1';
    this.moveTooltip(x, y);
  }
}

