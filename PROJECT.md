# Project: AMBA CHI Mesh Protocol Simulator

## Architecture
The simulator is designed as a modular, client-side web application using HTML5, CSS3, and ES6 JavaScript (Node.js-compatible core logic). This ensures portability and zero-install execution.
- **Core Engine (`src/core/`)**:
  - `mesh.js`: 2D Grid coordinates, XY routing, link/hop latency calculator, and node types (RN-F, HN-F, SN-F).
  - `cache.js`: Cache line states (UC, SC, I), directories, and CHI cache coherency transition rules.
  - `protocol.js`: CHI packet types, request/snoop/response opcodes (ReadShared, ReadUnique, SnpCleanInvalid, CompData, etc.).
  - `simulator.js`: Cycle-based event queue, transaction manager, and latency tracker.
- **Interactive UI (`src/ui/`)**:
  - `renderer.js`: HTML5 Canvas or SVG-based grid visualization, cache state badges, and animated packet paths.
  - `controls.js`: Sidebar form to trigger custom read/write requests, load custom YAML/JSON scenario files.
  - `suite.js`: verification suite panel running pre-loaded scenario checks.
- **E2E Testing Suite (`tests/`)**:
  - Opaque-box scenario runner loading JSON/YAML scenarios, executing them cycle-by-cycle, and asserting final cache states and transaction paths/latencies.

## Code Layout
```
/Users/cfaber/teamwork_projects/chi_mesh_simulator/
├── index.html                  # Main UI entry point
├── css/
│   └── main.css                # Interface styles
├── src/
│   ├── core/
│   │   ├── mesh.js             # 2D Grid & routing logic
│   │   ├── cache.js            # Cache coherency states (CHI)
│   │   ├── protocol.js         # CHI packets & opcodes
│   │   └── simulator.js        # Sim loop, queue, metrics
│   └── ui/
│       ├── renderer.js         # Visual grid and packet tracing
│       ├── controls.js         # Input handlers and file loading
│       └── suite.js            # Built-in verification suite runner
├── scenarios/                  # Verification scenario files
│   ├── read_hit_miss.json
│   ├── concurrent_write.json
│   └── snoop_inval.json
├── tests/
│   ├── test_runner.js          # E2E CLI test runner (Node.js)
│   └── cases/                  # Test definitions (Tiers 1-4)
├── PROJECT.md                  # Global index (this file)
└── TEST_READY.md               # E2E Test Suite status signal
```

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|-------------|--------|-----------------|
| 1 | E2E Testing Track | Establish test framework and create Tiers 1-4 test cases | None | IN_PROGRESS | ced7edc4-6dcd-44e4-a5c7-686a5f0e06e1 |
| 2 | Simulator Engine | Implement core grid, CHI opcodes, XY routing, coherency rules | None | IN_PROGRESS | e02a7c25-cb4c-496e-9da7-1aec32593f77 |
| 3 | Web Interface | Render grid, animate packet traversal, show cache states | M2 | PLANNED | TBD |
| 4 | Workload & Controls | YAML/JSON workload loading, Verification Suite UI panel | M1, M3 | PLANNED | TBD |
| 5 | E2E Pass & Hardening | Run E2E test suite, perform Tier 5 adversarial hardening | M1, M2, M3, M4 | PLANNED | TBD |

## Interface Contracts
### Simulator Core Engine (Node.js / Browser compatible)
- `MeshGrid` class:
  - `constructor(width, height)`
  - `getNode(x, y)` -> Node representation
  - `routeXY(srcNode, destNode)` -> Array of coordinates `[{x, y}, ...]` representing the path.
- `Node` classes (`RN_F`, `HN_F`, `SN_F` extending base `Node`):
  - `RN_F` has a cache mapping address -> state (`UC`, `SC`, `I`) and data value.
  - `HN_F` has a directory mapping address -> list of RN-F sharing it.
  - `SN_F` has memory mapping address -> data value.
- `Packet` class:
  - Properties: `id`, `src`, `dest`, `type`, `opcode`, `address`, `data`, `txnId`.
  - Types: `Req` (Request), `Snp` (Snoop), `Rsp` (Response), `Dat` (Data).
- `Simulator` class:
  - `constructor(meshGrid)`
  - `queueTransaction(txnRequest)`
  - `step()` -> advance simulation by 1 cycle, return list of packet movements.
  - `runScenario(scenarioObj)` -> run scenario to completion, returns transaction summary (hops, latency, final states).
