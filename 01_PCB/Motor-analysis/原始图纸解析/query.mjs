import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
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
const pts = []; const TOL = 0.9;
const addPt = (p) => { for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) < TOL) return i; pts.push([p[0], p[1]]); return pts.length - 1; };
const parent = [];
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
for (const w of wires) { let prev = -1; for (const v of w) { const i = addPt(v); while (parent.length < pts.length) parent.push(parent.length); if (prev >= 0) uni(prev, i); prev = i; } }
const nets = new Map();
for (let i = 0; i < pts.length; i++) { const r = find(i); if (!nets.has(r)) nets.set(r, []); nets.get(r).push(pts[i]); }

const T = texts.map((t) => ({ s: t.str.trim(), x: t.x, y: t.y, c: colOf(t.color) })).filter((t) => t.s);
const refTexts = T.filter((t) => t.c === '0.00,0.00,0.50' && /^[A-Z]{1,3}\d{1,3}$/.test(t.s));
const valTexts = T.filter((t) => t.c === '0.00,0.00,1.00' && !/^[ABC]$/.test(t.s));

/* dark-red pin stubs */
const stubs = [];
for (const p of paths) {
  if (!p.stroked || p.filled) continue;
  const c = p.stroke;
  if (!(Math.abs(c[0] - 0.53) < 0.03 && c[1] < 0.05 && c[2] < 0.05)) continue;
  let cur = null;
  for (const s of p.segments) {
    if (s[0] === 'm') cur = [s[1], s[2]];
    else if (s[0] === 'l' && cur) { stubs.push([cur, [s[1], s[2]]]); cur = [s[1], s[2]]; }
  }
}
const rootOf = (pt, maxd = 1.2) => {
  let best = -1, bd = maxd;
  for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pt[0], pts[i][1] - pt[1]); if (d < bd) { bd = d; best = i; } }
  return best < 0 ? -1 : find(best);
};
/* connection points grouped by net */
const byNet = new Map();
for (const [a, b] of stubs) for (const e of [a, b]) {
  const r = rootOf(e);
  if (r < 0) continue;
  if (!byNet.has(r)) byNet.set(r, []);
  byNet.get(r).push(e);
}
const refAt = (pt, maxd = 26) => {
  let best = null, bd = maxd;
  for (const t of refTexts) { const d = Math.hypot(t.x - pt[0], t.y - pt[1]); if (d < bd) { bd = d; best = t.s; } }
  return best;
};
function describe(root) {
  const mem = nets.get(root) || [];
  const comps = {};
  for (const e of byNet.get(root) || []) { const r = refAt(e); if (r) comps[r] = Math.min(comps[r] ?? 99, 1); }
  const vals = [...new Set(valTexts.filter((t) => mem.some((m) => Math.hypot(m[0] - t.x, m[1] - t.y) < 13)).map((t) => t.s))];
  const xs = mem.map((m) => m[0]), ys = mem.map((m) => m[1]);
  return { n: mem.length, comps: Object.keys(comps).sort(), vals, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}
/* query points: near pin-name texts */
const queries = T.filter((t) => /^(VB[123]|VS[123]|HO[123]|LO[123]|HIN[123]|LIN[123]|VCC|COM|EN|FB|SW|VIN)$/.test(t.s));
const seen = new Set();
function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return { d: Math.hypot(p[0] - a[0], p[1] - a[1]), q: a };
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q };
}
function nearestOnWire(p) {
  let best = null, bd = 16;
  for (const w of wires) for (let i = 0; i + 1 < w.length; i++) {
    const { d, q } = distToSeg(p, w[i], w[i + 1]);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
const out = [];
for (const q of queries) {
  // U1 pin names on the left start at x~479.9 (pins extend left); right side x~553 (pins extend right)
  const probe = q.x < 520 ? [q.x - 19, q.y] : [q.x + 19, q.y];
  const qp = nearestOnWire(probe);
  if (!qp) { out.push(`${q.s} @${q.x.toFixed(0)},${q.y.toFixed(0)}  -> no wire found near ${probe.map((v) => v.toFixed(0)).join(',')}`); continue; }
  const r = rootOf(qp, 2.5);
  if (r < 0) { out.push(`${q.s} @${q.x.toFixed(0)},${q.y.toFixed(0)}  -> wire at ${qp.map((v) => v.toFixed(0))} but no node`); continue; }
  const d = describe(r);
  out.push(`${q.s.padEnd(6)} @${q.x.toFixed(0)},${q.y.toFixed(0)} wire@${qp.map((v) => v.toFixed(0)).join(',')} -> net(${d.n} nodes) bbox=${d.bbox.map((v) => v.toFixed(0)).join(',')}\n        comps: ${d.comps.join(' ')}\n        vals : ${d.vals.join(' ')}`);
}
console.log(out.join('\n'));
fs.writeFileSync('_analysis/pinqueries.txt', out.join('\n'), 'utf8');
