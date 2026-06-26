# Original User Request

## Initial Request — 2026-06-09T22:20:32Z

<USER_REQUEST>
An interactive AMBA CHI Mesh Protocol Simulator to simulate, validate, and visualize packet routing, latency, and hardware cache coherency across a scalable 2D mesh grid.

Working directory: /Users/cfaber/teamwork_projects/chi_mesh_simulator
Integrity mode: benchmark

## Requirements

### R1. Mesh Simulator Engine
Model a 2D mesh grid consisting of Request Nodes (RN-F with local caches), Home Nodes (HN-F with directories), and Subordinate/Slave Nodes (SN-F). Implement XY routing logic for packet traversal between nodes and enforce hardware cache coherency using CHI opcodes (such as ReadShared, ReadUnique, SnpCleanInvalid, CompData, and Comp/Resp/Data packets).

### R2. Interactive Web Interface
Provide an interactive HTML/CSS/JS interface that visualizes the 2D mesh grid layout, displays active cache line states (e.g., Unique Clean, Shared Clean, Invalid) for each node, traces packet flows step-by-step, and tracks transaction latencies.

### R3. Workload and Control Interface
Allow the user to interactively trigger read and write transactions from specific Request Nodes, and support loading and executing transaction scenario files (YAML/JSON) that define custom sequence flows.

## Acceptance Criteria

### Cache Coherency Correctness
- [ ] Multiple RN-Fs requesting the same address concurrently must resolve to Shared Clean or Unique Clean state according to CHI protocol rules, with correct snoops (SnpCleanInvalid) dispatched by HN-F.
- [ ] A write request (ReadUnique/CleanUnique) from one RN-F must successfully invalidate copy/copies in other RN-Fs before the write completes.

### Packet Routing and Latency Tracking
- [ ] Packets must follow strict XY routing pathing between source and destination coordinates.
- [ ] The simulation must calculate and display average and per-transaction latency based on hops and protocol phase delays.

### Script Execution and Verification
- [ ] The web app must include a "Verification Suite" panel containing at least 3 pre-loaded coherency scenarios (e.g., read hit/miss, concurrent write conflict, snoop invalidation) that can be run automatically to verify simulator correctness.
</USER_REQUEST>
