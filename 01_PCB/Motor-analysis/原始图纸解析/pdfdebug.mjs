import fs from 'node:fs';
import zlib from 'node:zlib';
const buf = fs.readFileSync(process.argv[2]);
const s = buf.toString('latin1');
console.log('/Encrypt present:', /\/Encrypt/.test(s));
const re = /stream\r?\n/g;
let m, i = 0;
while ((m = re.exec(s)) && i < 8) {
  const start = m.index + m[0].length;
  const end = s.indexOf('endstream', start);
  const dictStart = s.lastIndexOf('<<', m.index);
  const dict = s.slice(dictStart, m.index).replace(/\s+/g, ' ').slice(0, 160);
  const raw = Buffer.from(s.slice(start, end), 'latin1');
  let res = 'FAIL';
  for (const off of [0, 1, 2]) {
    try { const d = zlib.inflateSync(raw.subarray(off)); res = 'ok@' + off + ' len=' + d.length; break; } catch (e) { }
  }
  try { const d = zlib.inflateRawSync(raw); res = 'raw-ok len=' + d.length; } catch (e) { }
  try { const d = zlib.unzipSync(raw); res = 'unzip-ok len=' + d.length; } catch (e) { }
  console.log(`#${i} obj@${m.index} bytes=${end - start} ${res}  dict=${dict}`);
  i++;
}
console.log('--- tail ---');
console.log(s.slice(-600));
