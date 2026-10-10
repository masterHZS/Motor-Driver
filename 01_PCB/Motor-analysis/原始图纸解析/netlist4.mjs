import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const isGreen = (c) => Math.abs(c[0]) < 0.05 && Math.abs(c[1] - 0.53) < 0.05 && Math.abs(c[2]) < 0.05;
const isPinC = (c) => Math.abs(c[0] - 0.53) < 0.03 && c[1] < 0.05 && c[2] < 0.05;
const isBody = (c) => Math.abs(c[0] - 0.63) < 0.03 && c[1] < 0.05 && c[2] < 0.05;
const colOf = (c) => c.map((v) => v.toFixed(2)).join(',');

/* ---------- wire graph ---------- */
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
const addPt = (arr, p) => { for (let i = 0; i < arr.length; i++) if (Math.hypot(arr[i][0] - p[0], arr[i][1] - p[1]) < TOL) return i; arr.push([p[0], p[1]]); return arr.length - 1; };
const parent = [];
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
for (const w of wires) { let prev = -1; for (const v of w) { const i = addPt(pts, v); while (parent.length < pts.length) parent.push(parent.length); if (prev >= 0) uni(prev, i); prev = i; } }
const nodeOf = (e) => { for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - e[0], pts[i][1] - e[1]) < TOL) return i; return -1; };

/* ---------- symbol clusters from red geometry ---------- */
const rsegs = [];   // {a,b,pin}
for (const p of paths) {
  if (!p.stroked || p.filled) continue;
  const pin = isPinC(p.stroke), body = isBody(p.stroke);
  if (!pin && !body) continue;
  let cur = null;
  for (const s of p.segments) {
    if (s[0] === 'm') cur = [s[1], s[2]];
    else if (s[0] === 'l' && cur) { rsegs.push({ a: cur, b: [s[1], s[2]], pin }); cur = [s[1], s[2]]; }
  }
}
const rpts = [];
const rparent = [];
const rfind = (x) => { while (rparent[x] !== x) { rparent[x] = rparent[rparent[x]]; x = rparent[x]; } return x; };
const runi = (a, b) => { a = rfind(a); b = rfind(b); if (a !== b) rparent[b] = a; };
const rIdx = rsegs.map((s) => {
  const ia = addPt(rpts, s.a), ib = addPt(rpts, s.b);
  while (rparent.length < rpts.length) rparent.push(rparent.length);
  return [ia, ib];
});
rIdx.forEach(([a, b]) => runi(a, b));
// merge clusters whose points are within 2pt (gaps in symbol outline)
for (let i = 0; i < rpts.length; i++) for (let j = i + 1; j < rpts.length; j++)
  if (Math.hypot(rpts[i][0] - rpts[j][0], rpts[i][1] - rpts[j][1]) < 2.2) runi(i, j);

const clusters = new Map();
for (let i = 0; i < rpts.length; i++) {
  const r = rfind(i);
  if (!clusters.has(r)) clusters.set(r, { ids: [], pts: [], ref: null });
  clusters.get(r).ids.push(i);
}
for (const c of clusters.values()) c.pts = c.ids.map((i) => rpts[i]);

/* ---------- texts ---------- */
const T = texts.map((t) => ({ s: t.str.trim(), x: t.x, y: t.y, size: t.size, c: colOf(t.color) })).filter((t) => t.s);
const refTexts = T.filter((t) => t.c === '0.00,0.00,0.50' && /^[A-Z]{1,3}\d{1,3}$/.test(t.s));
const valTexts = T.filter((t) => t.c === '0.00,0.00,1.00');
const numTexts = T.filter((t) => t.c === '0.00,0.00,0.00' && /^\d{1,2}$/.test(t.s));
const blackNames = T.filter((t) => t.c === '0.00,0.00,0.00' && /^[A-Za-z][A-Za-z0-9_+\-]{0,12}$/.test(t.s) && t.s !== 'NMOS');

/* cluster <-> refdes: refdes nearest to any point of the cluster */
for (const c of clusters.values()) {
  let best = null, bd = 40;
  for (const r of refTexts) for (const p of c.pts) {
    const d = Math.hypot(r.x - p[0], r.y - p[1]);
    if (d < bd) { bd = d; best = r; }
  }
  c.ref = best?.s ?? null;
  c.refDist = +bd.toFixed(1);
  const xs = c.pts.map((p) => p[0]), ys = c.pts.map((p) => p[1]);
  c.bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  c.centroid = [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
}
/* a refdes claims exactly one cluster: keep closest */
const claim = new Map();
for (const c of clusters.values()) if (c.ref) {
  const cur = claim.get(c.ref);
  if (!cur || c.refDist < cur.refDist) claim.set(c.ref, c);
}
for (const c of clusters.values()) if (c.ref && claim.get(c.ref) !== c) c.ref = null;

const named = [...clusters.values()].filter((c) => c.ref);
console.log('clusters', clusters.size, 'named', named.length);
const missRefs = refTexts.filter((r) => !named.some((c) => c.ref === r.s)).map((r) => r.s);
console.log('designators not matched to a cluster:', missRefs.join(' '));

/* ---------- pin ends that touch wires ---------- */
const clusterOfPoint = (p) => {
  let best = null, bd = 1.2;
  for (const c of clusters.values()) for (const q of c.pts) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = c; } }
  return best;
};
const netMap = new Map();
for (const s of rsegs) {
  if (!s.pin) continue;
  for (const e of [s.a, s.b]) {
    const ni = nodeOf(e);
    if (ni < 0) continue;
    const root = find(ni);
    if (!netMap.has(root)) netMap.set(root, { conns: [] });
    const c = clusterOfPoint(e);
    netMap.get(root).conns.push({ at: e, ref: c?.ref ?? null, cluster: c });
    break;
  }
}

/* ---------- report ---------- */
const outLines = [];
const nets = [...netMap.entries()].map(([root, n]) => {
  const members = []; for (let i = 0; i < pts.length; i++) if (find(i) === root) members.push(pts[i]);
  const comps = {}; for (const c of n.conns) { if (!c.ref) continue; comps[c.ref] = (comps[c.ref] || 0) + 1; }
  const labels = [...new Set(valTexts.filter((t) => members.some((m) => Math.hypot(m[0] - t.x, m[1] - t.y) < 16)).map((t) => t.s))];
  const names = [...new Set(blackNames.filter((t) => members.some((m) => Math.hypot(m[0] - t.x, m[1] - t.y) < 7)).map((t) => t.s))];
  const xs = members.map((m) => m[0]), ys = members.map((m) => m[1]);
  return { root, comps, labels, names, n: members.length, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
});
nets.sort((a, b) => Object.keys(b.comps).length - Object.keys(a.comps).length);
for (const n of nets) {
  const l = `[${String(Object.keys(n.comps).length).padStart(2)}] (${n.cx.toFixed(0)},${n.cy.toFixed(0)}) lbl={${n.labels.join(',')}} nm={${n.names.join(',')}} :: ${Object.entries(n.comps).map(([k, v]) => k + (v > 1 ? `x${v}` : '')).join(' ')}`;
  outLines.push(l); console.log(l);
}
fs.writeFileSync('_analysis/nets2.txt', outLines.join('\n'), 'utf8');

console.log('\n=== per component: nets it touches ===');
const byComp = {};
for (const n of nets) for (const k of Object.keys(n.comps)) (byComp[k] ||= []).push(n);
for (const k of Object.keys(byComp).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
  console.log(k.padEnd(6), byComp[k].length, '->', byComp[k].map((n) => `[${Object.keys(n.comps).length}]${n.labels[0] || n.names[0] || '@' + n.cx.toFixed(0) + ',' + n.cy.toFixed(0)}`).join('  '));
}
