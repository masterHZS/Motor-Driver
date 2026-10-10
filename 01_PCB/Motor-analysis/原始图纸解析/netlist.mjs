import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const isGreen = (c) => Math.abs(c[0]) < 0.05 && Math.abs(c[1] - 0.53) < 0.05 && Math.abs(c[2]) < 0.05;
const isRed = (c) => c[0] > 0.4 && c[1] < 0.05 && c[2] < 0.05;

/* ---- collect wire polylines ---- */
const wires = [];
for (const p of paths) {
  if (!p.stroked || !isGreen(p.stroke)) continue;
  if (p.filled) continue;
  let cur = null;
  for (const s of p.segments) {
    if (s[0] === 'm') { if (cur) wires.push(cur); cur = [[s[1], s[2]]]; }
    else if (s[0] === 'l' && cur) cur.push([s[1], s[2]]);
  }
  if (cur) wires.push(cur);
}
const junc = [];
for (const p of paths) {
  if (!p.filled || !isGreen(p.fill)) continue;
  // circle from curves
  let sx = 0, sy = 0, n = 0;
  for (const c of p.curves) { sx += c[1]; sy += c[2]; n++; }
  if (n) junc.push([sx / n, sy / n]);
}

/* ---- split polylines into 2-point segments ---- */
const segs = [];
for (const w of wires) for (let i = 0; i + 1 < w.length; i++) {
  const a = w[i], b = w[i + 1];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6) segs.push([a, b]);
}

/* ---- union find over vertices ---- */
const TOL = 0.8;
const pts = [];
const addPt = (p) => {
  for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) < TOL) return i;
  pts.push([p[0], p[1]]);
  return pts.length - 1;
};
const parent = [];
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
const segIdx = segs.map(([a, b]) => {
  const ia = addPt(a), ib = addPt(b);
  while (parent.length < pts.length) parent.push(parent.length);
  return [ia, ib];
});
for (const [ia, ib] of segIdx) uni(ia, ib);

/* ---- T-junctions: vertex lying on interior of a segment ---- */
const onSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return false;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  if (t <= 0.001 || t >= 0.999) return false;
  const cx = a[0] + t * dx, cy = a[1] + t * dy;
  return Math.hypot(cx - p[0], cy - p[1]) < TOL;
};
// grid-bucket segments for speed
const BUCK = 20;
const buckets = new Map();
const bkey = (x, y) => `${Math.floor(x / BUCK)},${Math.floor(y / BUCK)}`;
for (let i = 0; i < segIdx.length; i++) {
  const [ia, ib] = segIdx[i];
  const a = pts[ia], b = pts[ib];
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  for (let x = Math.floor(x0 / BUCK); x <= Math.floor(x1 / BUCK); x++)
    for (let y = Math.floor(y0 / BUCK); y <= Math.floor(y1 / BUCK); y++) {
      const k = `${x},${y}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    }
}
let tCount = 0;
for (let i = 0; i < pts.length; i++) {
  const cand = new Set();
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const k = `${Math.floor(pts[i][0] / BUCK) + dx},${Math.floor(pts[i][1] / BUCK) + dy}`;
    for (const s of buckets.get(k) || []) cand.add(s);
  }
  for (const s of cand) {
    const [ia, ib] = segIdx[s];
    if (ia === i || ib === i) continue;
    if (onSeg(pts[i], pts[ia], pts[ib])) { uni(i, ia); tCount++; }
  }
}
console.log('wire polys', wires.length, 'segs', segs.length, 'nodes', pts.length, 'T-joints', tCount, 'junction dots', junc.length);

/* ---- attach junction-dot nodes ---- */
for (const j of junc) {
  let best = -1, bd = 3;
  for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - j[0], pts[i][1] - j[1]); if (d < bd) { bd = d; best = i; } }
  if (best >= 0) { /* dot confirms existing node; nothing extra */ }
}

/* ---- red pin segments ---- */
const pins = [];
for (const p of paths) {
  if (!p.stroked || !isRed(p.stroke) || p.filled) continue;
  let cur = null;
  const flush = () => { if (cur && cur.length === 2) pins.push({ a: cur[0], b: cur[1], len: Math.hypot(cur[1][0] - cur[0][0], cur[1][1] - cur[0][1]) }); cur = null; };
  for (const s of p.segments) {
    if (s[0] === 'm') { flush(); cur = [[s[1], s[2]]]; }
    else if (s[0] === 'l') { if (!cur) cur = [[s[1], s[2]]]; else { cur.push([s[1], s[2]]); flush(); cur = [[s[1], s[2]]]; } }
  }
  flush();
}
console.log('red segments', pins.length);

/* ---- map: net(root) -> attached pin endpoints ---- */
const netPins = new Map();
const nearestNode = (pt, maxd = 1.2) => {
  let best = -1, bd = maxd;
  for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pt[0], pts[i][1] - pt[1]); if (d < bd) { bd = d; best = i; } }
  return best;
};
for (const pin of pins) {
  if (pin.len > 30) continue;   // only short pin stubs
  for (const end of [pin.a, pin.b]) {
    const n = nearestNode(end);
    if (n >= 0) {
      const r = find(n);
      if (!netPins.has(r)) netPins.set(r, []);
      netPins.get(r).push({ end, other: end === pin.a ? pin.b : pin.a });
    }
  }
}
console.log('nets with pins:', netPins.size);

/* ---- texts ---- */
const colOf = (c) => c[0].toFixed(2) + ',' + c[1].toFixed(2) + ',' + c[2].toFixed(2);
const lbls = texts.map((t) => ({ ...t, s: t.str.trim(), c: colOf(t.color) })).filter((t) => t.s);

/* ---- report nets with the texts near them ---- */
const report = [];
for (const [root, pl] of netPins.entries()) {
  // net extent
  const members = [];
  for (let i = 0; i < pts.length; i++) if (find(i) === root) members.push(pts[i]);
  if (!members.length) continue;
  const near = lbls.filter((t) => members.some((m) => Math.hypot(m[0] - t.x, m[1] - t.y) < 9));
  report.push({ root, npins: pl.length, extent: members.length, near: near.map((t) => `${t.s}(${t.c[0]}${t.c[1]}${t.c[2]})`), pts: pl.map((p) => p.end.map((v) => +v.toFixed(1)).join(',')) });
}
report.sort((a, b) => b.npins - a.npins);
fs.writeFileSync('_analysis/nets.json', JSON.stringify(report, null, 1));
for (const r of report.slice(0, 60)) {
  console.log(String(r.npins).padStart(3), 'pts', String(r.pts.length).padStart(3), '| near:', [...new Set(r.near)].slice(0, 12).join(' '));
}
