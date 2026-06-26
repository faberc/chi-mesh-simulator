# E2E Test Suite Specification & Infrastructure

This document details the End-to-End (E2E) testing framework, CLI runner, test case inventory, and specifications for the AMBA CHI Mesh Protocol Simulator.

## 1. Overview
The E2E test framework is a zero-dependency CLI test runner (`tests/test_runner.js`) that runs against either the live simulator engine implementation in `src/core/` or a fallback/mock engine (`tests/mock_engine.js`). It executes cycle-accurate protocol scenarios defined in JSON, validating mesh routing, CHI cache coherence transitions, latencies, and state consistency.

---

## 2. Feature Inventory
The E2E test suite validates the following system behaviors:
- **Mesh Grid & XY Routing (HN-F, RN-F, SN-F)**:
  - 2D grid coordinates and routing path validation.
  - Verification of coordinate-strict XY routing paths.
  - Latency tracking based on hop counts and node types.
- **AMBA CHI Cache Coherency**:
  - Cache line state transitions (UC, SC, I).
  - Directory state tracking in HN-F (Home Nodes).
  - Snoop invalidation sequence (SnpCleanInvalid, CompData, etc.).
- **Transaction Flow**:
  - Concurrent writes on the same cache line and conflict resolution.
  - Read hits, read misses, and memory retrievals.

---

## 3. Test Cases & Tiers
Test scenarios are classified into Tiers and stored under `scenarios/` and `tests/cases/`.

### Tier 1: Basic Cache & Read Operations
- **Read Hit & Miss Scenario (`scenarios/read_hit_miss.json`)**:
  - **Goal**: Verify basic read hit and read miss flow.
  - **Inputs**: Read request to a cache line that is invalid, followed by a read to the same line (now cached).
  - **Expected Output**: 
    - First read: Cache miss. Requests data from memory (SN-F), transitions cache state to Unique Clean (UC) or Shared Clean (SC) in RN-F.
    - Second read: Cache hit. Satisfied locally in RN-F with low latency.
    - Assertions check correct state transitions and latency differences.

### Tier 2: Concurrent Transactions
- **Concurrent Write Conflict Scenario (`scenarios/concurrent_write.json`)**:
  - **Goal**: Verify conflict resolution when two nodes write to the same cache line concurrently.
  - **Inputs**: Simultaneous write requests from two different RN_F nodes targeting the same address.
  - **Expected Output**:
    - HN-F serializes the writes, processing one write transaction first and invalidating the other, or stalling one.
    - Cache lines in competing nodes are correctly updated/invalidated.
    - Final state is consistent across all nodes.

### Tier 3: Coherency & Snooping
- **Snoop Invalidation Scenario (`scenarios/snoop_inval.json`)**:
  - **Goal**: Verify that write/read-unique transactions trigger snoop invalidation of shared cache lines.
  - **Inputs**: Cache line starts shared (SC) in RN_F_1 and RN_F_2. A node requests unique access (Write/ReadUnique).
  - **Expected Output**:
    - HN-F sends snoop invalidations (`SnpCleanInvalid`) to sharing nodes.
    - Sharing nodes transition their cache line state to Invalid (`I`) and send response.
    - Requesting node receives ownership and transitions to `UC`.

---

## 4. Test Case JSON Schema
All scenario test files (`scenarios/*.json` or `tests/cases/*.json`) conform to the following schema:
```json
{
  "name": "String - Test name",
  "tier": "Integer - 1 to 5",
  "grid": {
    "width": "Integer",
    "height": "Integer"
  },
  "initial_state": {
    "nodes": [
      {
        "x": "Integer",
        "y": "Integer",
        "type": "RN_F | HN_F | SN_F",
        "cache": { "address": "state" },
        "memory": { "address": "value" },
        "directory": { "address": ["RN_F coordinates or IDs"] }
      }
    ]
  },
  "transactions": [
    {
      "cycle": "Integer - Injection cycle",
      "src": [ "x", "y" ],
      "dest": [ "x", "y" ],
      "type": "ReadShared | ReadUnique | WriteUnique | etc.",
      "address": "Hex string or Integer",
      "data": "Value"
    }
  ],
  "assertions": {
    "final_cache_states": [
      {
        "node": [ "x", "y" ],
        "address": "Hex/Int",
        "state": "UC | SC | I",
        "data": "Value"
      }
    ],
    "final_directory_states": [
      {
        "node": [ "x", "y" ],
        "address": "Hex/Int",
        "sharers": [ [ "x", "y" ] ]
      }
    ],
    "final_memory_states": [
      {
        "node": [ "x", "y" ],
        "address": "Hex/Int",
        "value": "Value"
      }
    ],
    "latencies": [
      {
        "txn_index": "Integer",
        "min_latency": "Integer",
        "max_latency": "Integer"
      }
    ],
    "routing_paths": [
      {
        "txn_index": "Integer",
        "path": [ [ "x", "y" ], [ "x", "y" ] ]
      }
    ],
    "opcodes_observed": [
      "ReadShared", "SnpCleanInvalid", "CompData"
    ]
  }
}
```

---

## 5. CLI Test Runner Reference
The runner executes using Node.js and can be invoked with various flags:

```bash
node tests/test_runner.js [options]
```

### Options:
- `--tier <number>`: Filter test cases to run only a specific tier.
- `--file <path>`: Run a single specific test case JSON.
- `--src-dir <path>`: Specify custom engine source directory (default: `src/core`).
- `--verbose`: Enable detailed cycle-by-cycle logging.
- `--mock`: Force the runner to load the mock engine (`tests/mock_engine.js`) instead of `src/core`.

---

## 6. Layout Mapping
- `tests/test_runner.js`: Main E2E CLI test runner entry point.
- `tests/mock_engine.js`: Conforming mock implementation of the core simulator engine for testing and initial verification.
- `scenarios/`: Storage for main functional scenarios.
- `tests/cases/`: Custom test cases organized by Tier.
