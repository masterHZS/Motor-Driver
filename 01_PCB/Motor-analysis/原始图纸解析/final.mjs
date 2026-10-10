import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const isGreen = (c) => Math.abs(c[0]) < 0.05 && Math.abs(c[1] - 0.53) < 0.05 && Math.abs(c[2]) < 0.05;
const colOf = (c) => c.map((v) => v.toFixed(2)).join(',');

/* wires */
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

const distToSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return { d: Math.hypot(p[0] - a[0], p[1] - a[1]), q: a };
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t));
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q };
};
const nearestOnWire = (p, maxd = 12) => { let best = null, bd = maxd; for (const w of wires) for (let i = 0; i + 1 < w.length; i++) { const { d, q } = distToSeg(p, w[i], w[i + 1]); if (d < bd) { bd = d; best = q; } } return best; };
const rootOf = (pt, maxd = 3) => { let best = -1, bd = maxd; for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pt[0], pts[i][1] - pt[1]); if (d < bd) { bd = d; best = i; } } return best < 0 ? -1 : find(best); };

const T = texts.map((t) => ({ s: t.str.trim(), x: t.x, y: t.y, c: colOf(t.color) })).filter((t) => t.s);
const netAnchors = new Map();
const put = (root, label) => { if (root < 0) return; if (!netAnchors.has(root)) netAnchors.set(root, new Set()); netAnchors.get(root).add(label); };

/* --- U1 / U2 pin names --- */
const IC_PINS = /^(VB[123]|VS[123]|HO[123]|LO[123]|HIN[123]|LIN[123]|VCC|COM|EN|FB|SW|VIN)$/;
const PINNUM = {};
for (const t of T) {
  if (!IC_PINS.test(t.s)) continue;
  const probe = t.x < 520 ? [t.x - 19, t.y] : [t.x + 19, t.y];
  const qp = nearestOnWire(probe, 10);
  const tag = (t.s === 'VCC' || t.s === 'COM') ? 'U1.' + t.s : (['EN', 'FB', 'SW', 'VIN'].includes(t.s) ? 'U2.' + t.s : 'U1.' + t.s);
  if (!qp) { put(-1, `${tag}(NC)`); PINNUM[tag] = null; continue; }
  const r = rootOf(qp);
  PINNUM[tag] = r;
  put(r, tag);
}

/* --- net-label texts (blue) --- */
for (const t of T) if (t.c === '0.00,00,1.00' || t.c === '0.00,0.00,1.00') { if (/^(A|B|C|VCC_BUS)$/.test(t.s)) { const r = rootOf([t.x, t.y], 30); if (r >= 0) put(r, 'NET:' + t.s); } }

/* --- passives: dark-red pin stubs -> nearest refdes --- */
const refTexts = T.filter((t) => t.c === '0.00,0.00,0.50' && /^[A-Z]{1,3}\d{1,3}$/.test(t.s));
const refAt = (pt, maxd = 30) => { let best = null, bd = maxd; for (const t of refTexts) { const d = Math.hypot(t.x - pt[0], t.y - pt[1]); if (d < bd) { bd = d; best = t.s; } } return best; };
const CONN = new Map();
for (const p of paths) {
  if (!p.stroked || p.filled) continue;
  const c = p.stroke;
  if (!(Math.abs(c[0] - 0.53) < 0.03 && c[1] < 0.05 && c[2] < 0.05)) continue;
  let cur = null;
  for (const s of p.segments) {
    if (s[0] === 'm') cur = [s[1], s[2]];
    else if (s[0] === 'l' && cur) {
      const a = cur, b = [s[1], s[2]]; cur = b;
      for (const e of [a, b]) {
        const r = rootOf(e, 1.5);
        if (r < 0) continue;
        const ref = refAt(e);
        if (!ref) continue;
        if (!CONN.has(ref)) CONN.set(ref, new Set());
        CONN.get(ref).add(r);
        put(r, ref);
      }
    }
  }
}
/* --- GND symbols: red-filled? find ground symbol shapes (red stroked, near 'GND' net) --- */

const roots = [...netAnchors.keys()].filter((r) => r >= 0);
const lines = [];
const rowsL = [];
for (const r of roots) {
  const mem = pts.map((p, i) => i).filter((i) => find(i) === r).map((i) => pts[i]);
  if (mem.length < 2) continue;
  const xs = mem.map((m) => m[0]), ys = mem.map((m) => m[1]);
  const a = [...netAnchors.get(r)].sort();
  rowsL.push({ r, n: a.length, anchors: a, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], nodes: mem.length });
}
rowsL.sort((a, b) => b.nodes - a.nodes);
for (const row of rowsL) {
  const l = `net(${String(row.nodes).padStart(2)}n) bbox=${row.bbox.map((v) => v.toFixed(0)).join(',')} :: ${row.anchors.join(' ')}`;
  lines.push(l); console.log(l);
}
fs.writeFileSync('_analysis/final_nets.txt', lines.join('\n'), 'utf8');

console.log('\n=== component -> pin nets ===');
const byComp = {};
for (const row of rowsL) for (const a of row.anchors) if (/^[A-Z]{1,3}\d/.test(a) && !/^U[12]\./.test(a)) (byComp[a] ||= []).push(row);
for (const k of Object.keys(byComp).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
  console.log(k.padEnd(5), byComp[k].map((row) => '{' + row.anchors.filter((x) => x !== k).join(' ') + '}').join('  |  '));
}
