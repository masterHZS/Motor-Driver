import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const W = 1198.08, H = 848.88;
const isGreen = (c) => Math.abs(c[0]) < 0.05 && Math.abs(c[1] - 0.53) < 0.05 && Math.abs(c[2]) < 0.05;
const colOf = (c) => c.map((v) => v.toFixed(2)).join(',');

/* ---- wires + union-find ---- */
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

/* ---- texts ---- */
const T = texts.map((t) => ({ s: t.str.trim(), x: t.x, y: t.y, c: colOf(t.color), size: t.size })).filter((t) => t.s);
const refTexts = T.filter((t) => t.c === '0.00,0.00,0.50');
const valTexts = T.filter((t) => t.c === '0.00,0.00,1.00');

/* ---- net id per root ---- */
const rootList = [...new Set(pts.map((_, i) => find(i)))];
const netId = new Map(rootList.map((r, i) => [r, i]));
const N = rootList.length;
const hue = (i) => (i * 137.508) % 360;
const color = (i) => `hsl(${hue(i).toFixed(0)},85%,42%)`;

/* ---- net sizes for legend ---- */
const netPts = new Map();
for (let i = 0; i < pts.length; i++) { const r = find(i); if (!netPts.has(r)) netPts.set(r, []); netPts.get(r).push(pts[i]); }
const netComp = new Map();
for (const r of rootList) {
  const mem = netPts.get(r);
  const comps = [...new Set(refTexts.filter((t) => mem.some((m) => Math.hypot(m[0] - t.x, m[1] - t.y) < 30)).map((t) => t.s))];
  const vals = [...new Set(valTexts.filter((t) => mem.some((m) => Math.hypot(m[0] - t.x, m[1] - t.y) < 16)).map((t) => t.s))];
  netComp.set(r, { comps, vals, n: mem.length });
}

/* ---- geometry (red) in gray ---- */
let out = [];
const f = (v) => +v.toFixed(2);
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
out.push(`<g transform="translate(0,${H}) scale(1,-1)">`);
for (const p of paths) {
  if (!p.stroked || p.filled) continue;
  if (isGreen(p.stroke)) continue;
  let d = '';
  for (const s of p.segments) { if (s[0] === 'm') d += `M ${f(s[1])} ${f(s[2])} `; else if (s[0] === 'l') d += `L ${f(s[1])} ${f(s[2])} `; }
  for (const c of p.curves) d += `C ${f(c[1])} ${f(c[2])} ${f(c[3])} ${f(c[4])} ${f(c[5])} ${f(c[6])} `;
  for (const r of p.rects) d += `M ${f(r[0][0])} ${f(r[0][1])} L ${f(r[1][0])} ${f(r[1][1])} L ${f(r[2][0])} ${f(r[2][1])} L ${f(r[3][0])} ${f(r[3][1])} Z `;
  if (d) out.push(`<path d="${d.trim()}" fill="none" stroke="#111111" stroke-width="${f(p.lw)}"/>`);
}
for (const c of paths) {
  if (!c.filled) continue;
  let d = '';
  for (const s of c.segments) { if (s[0] === 'm') d += `M ${f(s[1])} ${f(s[2])} `; else if (s[0] === 'l') d += `L ${f(s[1])} ${f(s[2])} `; }
  for (const q of c.curves) d += `C ${f(q[1])} ${f(q[2])} ${f(q[3])} ${f(q[4])} ${f(q[5])} ${f(q[6])} `;
  for (const r of c.rects) d += `M ${f(r[0][0])} ${f(r[0][1])} L ${f(r[1][0])} ${f(r[1][1])} L ${f(r[2][0])} ${f(r[2][1])} L ${f(r[3][0])} ${f(r[3][1])} Z `;
  if (d) out.push(`<path d="${d.trim()}" fill="#111111" stroke="none"/>`);
}
/* wires by net color */
for (const w of wires) {
  if (w.length < 2) continue;
  const r = find(addPt(w[0]));
  const c = color(netId.get(r));
  let d = `M ${f(w[0][0])} ${f(w[0][1])} `;
  for (let i = 1; i < w.length; i++) d += `L ${f(w[i][0])} ${f(w[i][1])} `;
  out.push(`<path d="${d}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`);
}
out.push('</g>');
/* labels: refdes in black, values in dark gray, net-id in color */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const nearestNet = (x, y) => {
  let best = -1, bd = 26;
  for (const r of rootList) for (const m of netPts.get(r)) { const d = Math.hypot(m[0] - x, m[1] - y); if (d < bd) { bd = d; best = r; } }
  return best;
};
for (const t of T) {
  if (t.c === '0.00,0.00,0.00' && t.size < 6.5 && /^\d{1,2}$/.test(t.s)) continue;
  const isRef = t.c === '0.00,0.00,0.50';
  const isVal = t.c === '0.00,0.00,1.00';
  if (!isRef && !isVal) continue;
  const r = isRef ? nearestNet(t.x, t.y) : -1;
  const col = isRef && r >= 0 ? color(netId.get(r)) : '#222';
  out.push(`<text x="${f(t.x)}" y="${f(H - t.y)}" font-family="Arial, sans-serif" font-size="${f(t.size * 2.1)}" font-weight="bold" fill="${col}" stroke="#fff" stroke-width="0.7" paint-order="stroke">${esc(t.s.replace(/\u03a9/g,'R'))}</text>`);
}
out.push('</svg>');
fs.writeFileSync(process.argv[3], out.join('\n'), 'utf8');
console.log('svg written, nets:', N);
for (const r of rootList) {
  const d = netComp.get(r);
  if (d.n < 2) continue;
  console.log(color(netId.get(r)).padEnd(24), 'nodes=' + String(d.n).padStart(3), 'vals={', d.vals.join(','), '} comps={', d.comps.join(' '), '}');
}
