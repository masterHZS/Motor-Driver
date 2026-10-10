import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const isGreen = (c) => Math.abs(c[0]) < 0.05 && Math.abs(c[1] - 0.53) < 0.05 && Math.abs(c[2]) < 0.05;
const isRed = (c) => c[0] > 0.4 && c[1] < 0.05 && c[2] < 0.05;
const colOf = (c) => c.map((v) => v.toFixed(2)).join(',');

/* ---- 1. wire graph ---- */
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
const pts = [];
const TOL = 0.8;
const addPt = (p) => { for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) < TOL) return i; pts.push([p[0], p[1]]); return pts.length - 1; };
const parent = [];
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
for (const w of wires) {
  let prev = -1;
  for (const v of w) { const i = addPt(v); while (parent.length < pts.length) parent.push(parent.length); if (prev >= 0) uni(prev, i); prev = i; }
}
// polyline interiors: ensure bends exist as nodes already (they are)

/* ---- 2. junction dots (green stroke, red fill, round) ---- */
const dots = [];
for (const p of paths) {
  if (!p.filled || !isGreen(p.stroke) || !isRed(p.fill)) continue;
  let sx = 0, sy = 0, n = 0;
  for (const c of p.curves) { sx += c[1]; sy += c[2]; n++; }
  if (n >= 3) dots.push([sx / n, sy / n]);
}

/* ---- 3. text tokens ---- */
const T = texts.map((t) => ({
  s: t.str.trim(), x: t.x, y: t.y, size: t.size, c: colOf(t.color), font: t.font,
})).filter((t) => t.s);
const refs = T.filter((t) => t.c === '0.00,0.00,0.50' && /^[A-Z]{1,3}\d{1,3}$/.test(t.s));
const nums = T.filter((t) => t.c === '0.00,0.00,0.00' && /^\d{1,2}$/.test(t.s));
const names = T.filter((t) => t.c === '0.00,0.00,0.00' && /^[A-Za-z][A-Za-z0-9_+\-]{1,12}$/.test(t.s));

/* ---- 4. red pin stubs ---- */
const stubs = [];
for (const p of paths) {
  if (!p.stroked || !isRed(p.stroke) || p.filled) continue;
  let cur = null;
  const end = () => { if (cur && cur.length === 2) { const L = Math.hypot(cur[1][0] - cur[0][0], cur[1][1] - cur[0][1]); if (L > 1.5 && L < 30) stubs.push({ a: cur[0], b: cur[1], L }); } cur = null; };
  for (const s of p.segments) {
    if (s[0] === 'm') { end(); cur = [[s[1], s[2]]]; }
    else if (s[0] === 'l') { if (!cur) cur = [[s[1], s[2]]]; cur.push([s[1], s[2]]); if (cur.length === 2) end(); else { cur = [[s[1], s[2]]]; } }
  }
  end();
}

const nearest = (list, pt, maxd, key = (t) => [t.x, t.y]) => {
  let best = null, bd = maxd;
  for (const t of list) { const [x, y] = key(t); const d = Math.hypot(x - pt[0], y - pt[1]); if (d < bd) { bd = d; best = t; } }
  return best;
};

/* ---- 5. attribute stubs to refdes + pin number ---- */
let attr = 0, noRef = 0;
for (const s of stubs) {
  const mid = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
  const r = nearest(refs, mid, 90);
  const n = nearest(nums, mid, 9);
  const nm = nearest(names, mid, 9);
  s.ref = r?.s; s.pin = n?.s; s.pname = nm?.s;
  if (r) attr++; else noRef++;
}
console.log('stubs', stubs.length, 'attributed', attr, 'unattributed', noRef);

/* ---- 6. nets ---- */
const netAt = (pt) => { const i = addPt(pt); while (parent.length < pts.length) parent.push(parent.length); return find(i); };
// which end of the stub touches a wire?
const netMap = new Map();
for (const s of stubs) {
  for (const e of [s.a, s.b]) {
    // find an existing wire node within TOL of e
    let hit = -1;
    for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - e[0], pts[i][1] - e[1]) < TOL) { hit = i; break; }
    if (hit >= 0) {
      const root = find(hit);
      if (!netMap.has(root)) netMap.set(root, { nodes: [], pins: [] });
      netMap.get(root).pins.push({ ref: s.ref, pin: s.pin, pname: s.pname, at: e.map((v) => +v.toFixed(1)) });
      break;
    }
  }
}
/* net geometry + labels */
for (const [root, net] of netMap.entries()) {
  const members = [];
  for (let i = 0; i < pts.length; i++) if (find(i) === root) members.push(pts[i]);
  net.pts = members;
  net.labels = [...new Set(T.filter((t) => t.c === '0.00,0.00,1.00' && members.some((m) => Math.hypot(m[0] - t.x, m[1] - t.y) < 14)).map((t) => t.s))];
  net.dotCount = dots.filter((d) => members.some((m) => Math.hypot(m[0] - d[0], m[1] - d[1]) < 2)).length;
}

const nets = [...netMap.values()].filter((n) => n.pins.length);
nets.sort((a, b) => b.pins.length - a.pins.length);
const out = [];
for (const n of nets) {
  const ps = n.pins.map((p) => `${p.ref ?? '?'}.${p.pin ?? '?'}${p.pname ? '(' + p.pname + ')' : ''}`);
  const uniq = [...new Set(ps)];
  const line = `[${uniq.length} pins] labels=${n.labels.join(',') || '-'} : ${uniq.join(' ')}`;
  out.push(line);
  console.log(line);
}
fs.writeFileSync('_analysis/netlist.txt', out.join('\n'), 'utf8');
