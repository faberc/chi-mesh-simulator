export class Node {
  constructor(x, y, id, type) {
    this.x = x;
    this.y = y;
    this.id = id;
    this.type = type; // 'RN_F' | 'HN_F' | 'SN_F'
  }
}

export class RN_F extends Node {
  constructor(x, y, id) {
    super(x, y, id, 'RN_F');
    this.cache = {}; // address -> { state, data }
  }
}

export class HN_F extends Node {
  constructor(x, y, id) {
    super(x, y, id, 'HN_F');
    this.directory = {}; // address -> array of RN_F instances sharing it
    this.activeAddressTransactions = new Set(); // set of addresses currently being modified
    this.pendingRequests = {}; // address -> array of { packet, txn }
  }
}

export class SN_F extends Node {
  constructor(x, y, id) {
    super(x, y, id, 'SN_F');
    this.memory = {}; // address -> value
  }
}

export class MeshGrid {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.nodes = Array.from({ length: height }, () => Array(width).fill(null));
  }
  
  getNode(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.nodes[y][x];
  }
  
  setNode(x, y, node) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.nodes[y][x] = node;
    }
  }
  
  routeXY(srcNode, destNode, useYX = false) {
    if (!srcNode || !destNode) {
      throw new Error("Invalid source or destination node for routing");
    }
    if (srcNode.x === destNode.x && srcNode.y === destNode.y) {
      return [{ x: srcNode.x, y: srcNode.y }];
    }
    const path = [];
    let cx = srcNode.x;
    let cy = srcNode.y;
    path.push({ x: cx, y: cy });
    
    if (useYX) {
      // YX Routing: travel along Y first, then X
      while (cy !== destNode.y) {
        cy += destNode.y > cy ? 1 : -1;
        path.push({ x: cx, y: cy });
      }
      while (cx !== destNode.x) {
        cx += destNode.x > cx ? 1 : -1;
        path.push({ x: cx, y: cy });
      }
    } else {
      // XY Routing: travel along X first, then Y
      while (cx !== destNode.x) {
        cx += destNode.x > cx ? 1 : -1;
        path.push({ x: cx, y: cy });
      }
      while (cy !== destNode.y) {
        cy += destNode.y > cy ? 1 : -1;
        path.push({ x: cx, y: cy });
      }
    }
    return path;
  }
}
