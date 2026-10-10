import fs from 'node:fs';
const { paths, texts } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const isGreen = (c) => Math.abs(c[0]) < 0.05 && Math.abs(c[1] - 0.53) < 0.05 && Math.abs(c[2]) < 0.05;
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
const pts = []; const TOL = 0.9;
const addPt = (p) => { for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) < TOL) return i; pts.push([p[0], p[1]]); return pts.length - 1; };
const parent = [];
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
const wireRoots = [];
for (const w of wires) { let prev = -1; for (const v of w) { const i = addPt(v); while (parent.length < pts.length) parent.push(parent.length); if (prev >= 0) uni(prev, i); prev = i; } }

const [qx, qy] = process.argv.slice(3).map(Number);
let best = -1, bd = 1e9;
for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - qx, pts[i][1] - qy); if (d < bd) { bd = d; best = i; } }
const root = find(best);
console.log(`query ${qx},${qy} nearest node ${pts[best].map((v) => v.toFixed(2))} d=${bd.toFixed(2)} root=${root}`);
console.log('member nodes:');
const mem = [];
for (let i = 0; i < pts.length; i++) if (find(i) === root) mem.push(pts[i]);
mem.sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]));
for (const m of mem) console.log('   ', m[0].toFixed(1), m[1].toFixed(1));
console.log('member wire polylines:');
for (const w of wires) {
  const r = find(addPt(w[0]));
  if (r === root) console.log('   ', w.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' -> '));
}
