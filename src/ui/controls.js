export class Controls {
  constructor(mainApp) {
    this.app = mainApp;
    
    // Bind controls
    this.btnPlayPause = document.getElementById('btn-play-pause');
    this.btnStep = document.getElementById('btn-step');
    this.btnReset = document.getElementById('btn-reset');
    this.speedRange = document.getElementById('speed-range');
    
    this.injectType = document.getElementById('inject-type');
    this.injectSrcX = document.getElementById('inject-src-x');
    this.injectSrcY = document.getElementById('inject-src-y');
    this.injectAddr = document.getElementById('inject-addr');
    this.injectData = document.getElementById('inject-data');
    this.injectDataGroup = document.getElementById('inject-data-group');
    this.btnInject = document.getElementById('btn-inject');
    
    this.dropzone = document.getElementById('workload-dropzone');
    this.fileInput = document.getElementById('workload-file-input');
    
    this.initEvents();
  }

  initEvents() {
    // Workspace Tab Switching
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const tabId = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        
        if (tabId === 'sequence-view') {
          this.app.drawSequenceDiagram();
        }
      });
    });

    // Play / Pause Simulation
    this.btnPlayPause.addEventListener('click', () => {
      if (this.app.isPlaying) {
        this.app.pause();
      } else {
        this.app.play();
      }
    });

    // Single Step
    this.btnStep.addEventListener('click', () => {
      this.app.pause();
      this.app.step();
    });

    // Reset Simulation
    this.btnReset.addEventListener('click', () => {
      this.app.reset();
    });

    // Speed Slider
    this.speedRange.addEventListener('input', (e) => {
      this.app.setSpeed(parseInt(e.target.value, 10));
    });

    // Transaction Type selector behavior: show/hide data field
    this.injectType.addEventListener('change', () => {
      if (this.injectType.value === 'WriteUnique') {
        this.injectDataGroup.style.display = 'flex';
      } else {
        this.injectDataGroup.style.display = 'none';
      }
    });
    // Initialize correct state
    this.injectType.dispatchEvent(new Event('change'));

    // Manual Injection Click
    this.btnInject.addEventListener('click', () => {
      const type = this.injectType.value;
      const x = parseInt(this.injectSrcX.value, 10);
      const y = parseInt(this.injectSrcY.value, 10);
      const addr = this.injectAddr.value.trim();
      const val = parseInt(this.injectData.value, 10);

      // Simple validation
      const grid = this.app.simulator.meshGrid;
      if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
        alert(`Coordinates [${x}, ${y}] are out of bounds for the current grid dimensions.`);
        return;
      }
      const node = grid.getNode(x, y);
      if (!node || node.type !== 'RN_F') {
        alert(`Node at [${x}, ${y}] must be a Request Node (RN-F) to start transactions.`);
        return;
      }
      if (!addr) {
        alert('Please specify a valid memory address.');
        return;
      }

      this.app.injectManualTransaction({ type, x, y, address: addr, data: val });
    });

    // Dropzone logic for scenario JSON files
    this.dropzone.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.handleScenarioFile(file);
    });

    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzone.classList.add('dragover');
    });

    this.dropzone.addEventListener('dragleave', () => {
      this.dropzone.classList.remove('dragover');
    });

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) this.handleScenarioFile(file);
    });
  }

  handleScenarioFile(file) {
    if (!file.name.endsWith('.json')) {
      alert('Scenario file must be in JSON format.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const scenario = JSON.parse(e.target.result);
        this.app.loadScenario(scenario);
      } catch (err) {
        alert(`Failed to parse scenario file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // Helper: auto-fill injector coordinates when user clicks a node on the grid
  fillCoordinates(x, y) {
    this.injectSrcX.value = x;
    this.injectSrcY.value = y;
  }

  updatePlaybackUI(isPlaying) {
    const icon = this.btnPlayPause.querySelector('svg');
    if (isPlaying) {
      this.btnPlayPause.classList.add('active');
      icon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
      this.btnPlayPause.setAttribute('title', 'Pause Simulation');
    } else {
      this.btnPlayPause.classList.remove('active');
      icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
      this.btnPlayPause.setAttribute('title', 'Play Simulation');
    }
  }
}
