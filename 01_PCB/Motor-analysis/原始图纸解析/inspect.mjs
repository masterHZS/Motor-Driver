import fs from 'node:fs';
import zlib from 'node:zlib';

const buf = fs.readFileSync(process.argv[2]);
const s = buf.toString('latin1');

console.log('size', buf.length);
console.log('header', s.slice(0, 16).replace(/\n/g, '\\n'));

// find trailer / xref
const tail = s.slice(-800);
console.log('--- tail ---');
console.log(tail);

// count objects
const objs = [...s.matchAll(/(\d+)\s+(\d+)\s+obj\b/g)];
console.log('--- obj count:', objs.length);

// Summarize each object header line and whether it has a stream
const dicts = [];
for (let i = 0; i < objs.length; i++) {
  const start = objs[i].index;
  const end = i + 1 < objs.length ? objs[i + 1].index : s.length;
  const chunk = s.slice(start, Math.min(end, start + 600));
  const hasStream = /stream\r?\n/.test(chunk.slice(0, 600));
  dicts.push({ num: objs[i][1], gen: objs[i][2], hasStream, head: chunk.slice(0, 300).replace(/\s+/g, ' ') });
}
const byType = {};
for (const d of dicts) {
  const m = d.head.match(/\/Type\s*\/(\w+)/);
  const t = m ? m[1] : (d.hasStream ? 'Stream?' : 'other');
  byType[t] = (byType[t] || 0) + 1;
}
console.log('--- types ---');
console.log(byType);

console.log('--- first 40 object headers ---');
for (const d of dicts.slice(0, 40)) console.log(d.num, '|', d.head.slice(0, 200));
