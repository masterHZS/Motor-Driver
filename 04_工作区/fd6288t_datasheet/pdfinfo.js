const fs = require('fs');
const zlib = require('zlib');
const buf = fs.readFileSync(process.argv[2]);
const s = buf.toString('latin1');
console.log('bytes', buf.length, 'header', s.slice(0, 9));
const counts = {};
for (const k of ['/Font', '/ToUnicode', '/Image', '/DCTDecode', '/FlateDecode', '/Type0', '/TrueType', '/Type1', '/Identity-H', '/ObjStm', '/XRef']) {
  counts[k] = (s.match(new RegExp(k.replace(/[/-]/g, m => '\\' + m), 'g')) || []).length;
}
console.log(counts);
// list objects
const objs = [...s.matchAll(/(\d+)\s+(\d+)\s+obj([\s\S]{0,200}?)(stream|endobj)/g)];
console.log('objects found (approx):', objs.length);
const typeCount = {};
for (const m of s.matchAll(/\/Type\s*\/(\w+)/g)) typeCount[m[1]] = (typeCount[m[1]] || 0) + 1;
console.log('types', typeCount);
const subCount = {};
for (const m of s.matchAll(/\/Subtype\s*\/(\w+)/g)) subCount[m[1]] = (subCount[m[1]] || 0) + 1;
console.log('subtypes', subCount);
// try to inflate every stream and report how many contain text operators
let i = 0, ok = 0, textish = 0;
const outParts = [];
const streamRe = /stream\r?\n/g;
let m;
while ((m = streamRe.exec(s)) !== null) {
  const start = m.index + m[0].length;
  const end = s.indexOf('endstream', start);
  if (end < 0) continue;
  const raw = buf.subarray(start, end);
  i++;
  let inf = null;
  try { inf = zlib.inflateSync(raw); } catch (e) {
    try { inf = zlib.inflateRawSync(raw); } catch (e2) { inf = null; }
  }
  if (inf) {
    ok++;
    const t = inf.toString('latin1');
    if (/\bBT\b/.test(t)) { textish++; outParts.push(t); }
  }
}
console.log('streams', i, 'inflated', ok, 'with BT', textish);
fs.writeFileSync(process.argv[3] || 'streams.txt', outParts.join('\n%%%STREAM%%%\n'), 'latin1');
console.log('wrote', outParts.join('').length, 'chars of text streams');
