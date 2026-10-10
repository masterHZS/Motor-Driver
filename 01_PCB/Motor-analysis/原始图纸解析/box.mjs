import fs from 'node:fs';
const { paths, texts } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const isGreen = (c) => Math.abs(c[0]) < 0.05 && Math.abs(c[1] - 0.53) < 0.05 && Math.abs(c[2]) < 0.05;
const colOf = (c) => c.map((v) => v.toFixed(2)).join(',');

const wires = [];
for (const p of paths) {
  if (!p.stroked || !isGreen(p.stroke) || p.filled) continue;
  let cur = null;
  for (const s of p.segments) {
    if (s[0] === 'm') { if (cur) wires.push(cur); cur = [[s[1], s[2]]]; }
    else if (s[0] === 'l' && cur) cur.push([s[1], s[2]]);
  }
  if (cur) wires.push(cur);
}
const [x0, y0, x1, y1] = process.argv.slice(3).map(Number);
const inBox = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
const sel = wires.filter((w) => w.some(inBox));
console.log('wires touching box:', sel.length);
for (const w of sel) console.log('  ', w.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' -> '));

const T = texts.map((t) => ({ s: t.str.trim(), x: t.x, y: t.y, c: colOf(t.color) })).filter((t) => t.s);
console.log('\ntexts in box:');
for (const t of T) if (inBox([t.x, t.y])) console.log(`   ${t.x.toFixed(1)},${t.y.toFixed(1)} ${t.c} |${t.s}|`);
