export class Packet {
  constructor(id, src, dest, type, opcode, address, data, txnId) {
    this.id = id;          // string
    this.src = src;        // {x, y} coordinate object
    this.dest = dest;      // {x, y} coordinate object
    this.type = type;      // 'Req' | 'Snp' | 'Rsp' | 'Dat'
    this.opcode = opcode;  // e.g. 'ReadShared', 'ReadUnique', 'SnpCleanInvalid', 'CompData', 'Comp', 'Resp'
    this.address = address;// address (number or string)
    this.data = data;      // actual value (optional)
    this.txnId = txnId;    // transaction ID link
    
    // Additional tracking fields
    this.path = [];        // XY/YX route path array of {x, y}
    this.pathIndex = 0;    // current position index in path
    this.nextHopCycle = 0; // simulation cycle for next movement
  }
}

// CHI Opcodes
export const Opcodes = {
  ReadShared: 'ReadShared',
  ReadUnique: 'ReadUnique',
  SnpCleanInvalid: 'SnpCleanInvalid',
  CompData: 'CompData',
  Comp: 'Comp',
  Resp: 'Resp'
};
