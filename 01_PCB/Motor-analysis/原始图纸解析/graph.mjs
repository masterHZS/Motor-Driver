import fs from 'node:fs';
const { paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
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
const segs = [];
for (const w of wires) for (let i = 0; i + 1 < w.length; i++) segs.push([w[i], w[i + 1]]);
const pts = []; const TOL = 0.9;
const addPt = (p) => { for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) < TOL) return i; pts.push([p[0], p[1]]); return pts.length - 1; };
const parent = [];
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
const segIdx = segs.map(([a, b]) => { const ia = addPt(a), ib = addPt(b); while (parent.length < pts.length) parent.push(parent.length); return [ia, ib]; });
for (const [ia, ib] of segIdx) uni(ia, ib);
/* T-junction merge: a node lying strictly inside another segment joins it */
const onSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return false;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  if (t <= 0.002 || t >= 0.998) return false;
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]) < TOL;
};
let tj = 0;
for (let i = 0; i < pts.length; i++) for (const [ia, ib] of segIdx) {
  if (ia === i || ib === i) continue;
  if (onSeg(pts[i], pts[ia], pts[ib])) { if (find(i) !== find(ia)) { uni(i, ia); tj++; } }
}
console.log('segments', segs.length, 'nodes', pts.length, 'T-joins', tj);
fs.writeFileSync('_analysis/graph.json', JSON.stringify({ pts, segs, segIdx }));
export { pts, segs, segIdx, find, parent, addPt, TOL };
