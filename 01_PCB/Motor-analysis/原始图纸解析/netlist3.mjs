import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const isGreen = (c) => Math.abs(c[0]) < 0.05 && Math.abs(c[1] - 0.53) < 0.05 && Math.abs(c[2]) < 0.05;
const isPin = (c) => Math.abs(c[0] - 0.53) < 0.03 && c[1] < 0.05 && c[2] < 0.05;
const colOf = (c) => c.map((v) => v.toFixed(2)).join(',');

/* ---- wire graph ---- */
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
for (const w of wires) {
  let prev = -1;
  for (const v of w) { const i = addPt(v); while (parent.length < pts.length) parent.push(parent.length); if (prev >= 0) uni(prev, i); prev = i; }
}
const nodeOf = (e) => { for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - e[0], pts[i][1] - e[1]) < TOL) return i; return -1; };

/* ---- texts ---- */
const T = texts.map((t) => ({ s: t.str.trim(), x: t.x, y: t.y, size: t.size, c: colOf(t.color) })).filter((t) => t.s);
const refs = T.filter((t) => t.c === '0.00,0.00,0.50' && /^[A-Z]{1,3}\d{1,3}$/.test(t.s));
const vals = T.filter((t) => t.c === '0.00,0.00,1.00' && !/^[ABC]$/.test(t.s) === false ? false : t.c === '0.00,0.00,1.00');
const nums = T.filter((t) => t.c === '0.00,0.00,0.00' && /^\d{1,2}$/.test(t.s));
const blackNames = T.filter((t) => t.c === '0.00,0.00,0.00' && /^[A-Z][A-Za-z0-9_]{0,12}$/.test(t.s));
const blueLabels = T.filter((t) => t.c === '0.00,0.00,1.00');

/* ---- pin segments (dark red) touching a wire ---- */
const netPins = new Map();
const orphans = [];
let pinSegs = 0;
for (const p of paths) {
  if (!p.stroked || !isPin(p.stroke) || p.filled) continue;
  let cur = null;
  const handle = (a, b) => {
    pinSegs++;
    for (const e of [a, b]) {
      const ni = nodeOf(e);
      if (ni >= 0) {
        const root = find(ni);
        if (!netPins.has(root)) netPins.set(root, { pins: [], geo: [] });
        netPins.get(root).pins.push({ at: e, other: e === a ? b : a });
        return;
      }
    }
  };
  for (const s of p.segments) {
    if (s[0] === 'm') cur = [s[1], s[2]];
    else if (s[0] === 'l' && cur) { handle(cur, [s[1], s[2]]); cur = [s[1], s[2]]; }
  }
}
console.log('dark-red segments', pinSegs);

/* ---- attribute each connection point to a refdes ---- */
const nearestRef = (pt) => { let best = null, bd = 45; for (const r of refs) { const d = Math.hypot(r.x - pt[0], r.y - pt[1]); if (d < bd) { bd = d; best = r; } } return best; };

const lines = [];
const netList = [];
for (const [root, net] of netPins.entries()) {
  const members = [];
  for (let i = 0; i < pts.length; i++) if (find(i) === root) members.push(pts[i]);
  // component list
  const comps = new Map();
  for (const pin of net.pins) {
    const r = nearestRef(pin.at);
    if (!r) continue;
    const d = Math.hypot(r.x - pin.at[0], r.y - pin.at[1]);
    const prev = comps.get(r.s);
    if (!prev || d < prev) comps.set(r.s, +d.toFixed(1));
  }
  const labels = [...new Set(blueLabels.filter((t) => members.some((m) => Math.hypot(m[0] - t.x, m[1] - t.y) < 16)).map((t) => t.s))];
  const names = [...new Set(blackNames.filter((t) => members.some((m) => Math.hypot(m[0] - t.x, m[1] - t.y) < 8)).map((t) => t.s))].filter((s) => s !== 'NMOS');
  const bounds = members.length ? {
    x0: Math.min(...members.map((m) => m[0])), x1: Math.max(...members.map((m) => m[0])),
    y0: Math.min(...members.map((m) => m[1])), y1: Math.max(...members.map((m) => m[1])),
  } : null;
  netList.push({ root, comps: [...comps.keys()].sort(), labels, names, n: members.length, bounds });
}
netList.sort((a, b) => b.comps.length - a.comps.length);
for (const n of netList) {
  const l = `[${String(n.comps.length).padStart(2)}] lbl={${n.labels.join(',')}} nm={${n.names.join(',')}} :: ${n.comps.join(' ')}`;
  lines.push(l);
  console.log(l);
}
fs.writeFileSync('_analysis/nets.txt', lines.join('\n'), 'utf8');

/* ---- component -> nets ---- */
console.log('\n=== component pin nets (refdes: count of connected nets) ===');
const byComp = {};
for (const n of netList) for (const c of n.comps) (byComp[c] ||= []).push(n);
for (const c of Object.keys(byComp).sort()) {
  console.log(c.padEnd(6), byComp[c].length, 'nets ->', byComp[c].map((n) => `${n.labels[0] || n.names[0] || '?'}(${n.comps.length})`).join(' '));
}
