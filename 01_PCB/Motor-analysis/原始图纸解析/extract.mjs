import fs from 'node:fs';

const buf = fs.readFileSync(process.argv[2]);
const s = buf.toString('latin1');

const i = s.indexOf('4 0 obj');
const st = s.indexOf('stream', i);
const lenM = s.slice(i, st).match(/\/Length\s+(\d+)/);
const len = parseInt(lenM[1], 10);
let p = st + 'stream'.length;
while (s[p] === '\r' || s[p] === '\n') p++;
const content = s.slice(p, p + len);
fs.writeFileSync(process.argv[3], content, 'latin1');
console.log('content length', content.length);
console.log('filters', /\/Filter/.test(s.slice(i, st)));

// Show the first 3000 chars
console.log('===== HEAD =====');
console.log(content.slice(0, 3000));
