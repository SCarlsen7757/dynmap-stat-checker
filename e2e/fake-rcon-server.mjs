import { createServer } from 'node:net';

const port = Number(process.env.RCON_PORT ?? 25575);
const password = process.env.RCON_PASSWORD ?? 'integration-rcon-password';
const statsResponse = `Tile Render Statistics:
  Triggered update queue size: 121 + 2879
  Active render jobs: world:surface fullrender
Chunk Loading Statistics:
  Cache hit rate: 88.45%`;

function encodePacket(id, type, body) {
  const size = Buffer.byteLength(body) + 10;
  const packet = Buffer.alloc(size + 4);
  packet.writeInt32LE(size, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  packet.write(body, 12, 'utf8');
  return packet;
}

createServer((socket) => {
  let pending = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const packetLength = pending.readInt32LE(0) + 4;
      if (pending.length < packetLength) return;
      const packet = pending.subarray(0, packetLength);
      pending = pending.subarray(packetLength);

      const id = packet.readInt32LE(4);
      const type = packet.readInt32LE(8);
      const body = packet.toString('utf8', 12, packet.length - 2);
      if (type === 3) {
        socket.write(encodePacket(body === password ? id : -1, 2, ''));
      } else if (type === 2) {
        socket.write(encodePacket(id, 0, body === 'dynmap stats' ? statsResponse : 'Unknown command'));
      }
    }
  });
}).listen(port, '0.0.0.0');
