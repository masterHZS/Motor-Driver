'use strict';

// Minimal ZIP archive writer/reader (deflate + store) built on Node's zlib —
// enough for .elibz2 packages without any npm dependency.

const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

// files: [{ name, data (string|Buffer) }] → ZIP Buffer
function createZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosDateTime();
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);        // version needed to extract
    local.writeUInt16LE(0x0800, 6);    // flags: UTF-8 file names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, payload);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);          // version made by
    cen.writeUInt16LE(20, 6);          // version needed
    cen.writeUInt16LE(0x0800, 8);      // flags: UTF-8 file names
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(time, 12);
    cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(payload.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));

    offset += local.length + nameBuf.length + payload.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

// → [{ name, data: Buffer }]
function readZip(buf) {
  const entries = [];
  let pos = 0;
  while (pos + 4 <= buf.length) {
    if (buf.readUInt32LE(pos) !== 0x04034b50) break; // central directory reached
    const flags = buf.readUInt16LE(pos + 6);
    const method = buf.readUInt16LE(pos + 8);
    const csize = buf.readUInt32LE(pos + 18);
    const usize = buf.readUInt32LE(pos + 22);
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const name = buf.slice(pos + 30, pos + 30 + nameLen).toString('utf8');
    const dataStart = pos + 30 + nameLen + extraLen;
    let data = buf.slice(dataStart, dataStart + csize);
    if (method === 8) data = zlib.inflateRawSync(data);
    else if (method !== 0) throw new Error(`Unsupported zip method ${method} for ${name}`);
    if (flags & 0x08) {
      // data descriptor: sizes unknown in the header — find the next signature
      let next = dataStart + data.length;
      while (next + 4 <= buf.length && buf.readUInt32LE(next) !== 0x04034b50 && buf.readUInt32LE(next) !== 0x02014b50) next++;
      pos = next;
    } else {
      pos = dataStart + csize;
    }
    entries.push({ name, data });
  }
  return entries;
}

module.exports = { createZip, readZip, crc32 };
