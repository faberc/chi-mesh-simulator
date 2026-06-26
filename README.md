**Disclaimer**: This is a nearly 100% vibe-coded project. I basically just gave AntiGravity a prompt to generate a browser based simulator for the AMBA CHI protocol to use a multi-agent setup and it went to town. This was done as a learning exercise for me to learn how to work with multi-agent flows, working in the Antigravity IDE, and also I wanted to understand the AMBA CHI protocol a bit better. I have not validated that this is a completely accurate representation of the AMBA CHI protocol.

Everything that follows is pretty much purely AI-generated. Other than some basic HTML I did when I was 10 years old (all I remember is `<a href>`), I have very little experience with coding webpages, nothing to say of interactive ones with animations and stuff.

---

# AMBA CHI Mesh Protocol Simulator

An interactive, visually premium, zero-dependency browser simulator designed to model and verify the **AMBA CHI (Coherent Hub Interface)** protocol over a Network-on-Chip (NoC) mesh topology.

---

## 🚀 Key Features

* **Interactive Mesh Visualization**: 
  - Real-time animated packet flows over links.
  - Graphical representation of **Request Nodes (RN-F)**, **Home Nodes (HN-F)**, and **Slave Nodes (SN-F)**.
  - Compact **Router (RTR)** NoC intersection nodes to represent routing latency.
  - Dynamic cache, directory, and memory inspector.
* **Protocol Sequence Diagram View**:
  - Dynamically drawn transaction sequence logs.
  - Lifelines for endpoints with interactive header highlights.
  - Time/cycle markers aligning individual CHI packets.
  - Detailed hover popups showing packet IDs, opcodes, and types.
* **Live Packet Log**:
  - A monospace sidebar panel tracking packet steps cycle-by-cycle (from coordinate origins/routers to targets) matching standard CHI colors.
* **Interactive Transaction Injector**:
  - Manually inject `ReadShared`, `ReadUnique`, and `WriteUnique` operations to any node at a custom address.
* **Automated Verification Suite**:
  - Run standard E2E scenarios (*Read Hit/Miss*, *Concurrent Write Conflict*, *Snoop Invalidation*) from the browser or the CLI.

---

## 📖 Architecture & Protocols

### Node Types
* **RN-F (Request Node - Fully Coherent)**: Generates memory transactions (reads/writes) and hosts local cache hierarchies (`UC` - Unique Clean, `SC` - Shared Clean, `I` - Invalid states).
* **HN-F (Home Node - Fully Coherent)**: Manages directory structures (sharer tracking) and serializes conflicting requests.
* **SN-F (Slave Node - Fully Coherent)**: Models memory controllers and backing memory stores.
* **RTR (Router Node)**: Forwarding intersections inside the NoC grid.

### Routing Algorithms
* **XY Routing (Default)**: Travel along the X-axis first, then the Y-axis (used for Requests, Snoops, and Responses).
* **YX Routing**: Travel along the Y-axis first, then the X-axis (used for Data packets to mitigate NoC congestion).

---

## 🛠️ Getting Started

### Local Development
1. Initialize dependencies (optional CLI test runners require Node.js):
   ```bash
   npm install

## Link to the Hosted Page
[https://faberc.github.io/chi-mesh-simulator/](https://faberc.github.io/chi-mesh-simulator/)