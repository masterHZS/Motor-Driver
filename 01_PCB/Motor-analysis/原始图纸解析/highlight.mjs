import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const isGreen = (c) => Math.abs(c[0]) < 0.05 && Math.abs(c[1] - 0.53) < 0.05 && Math.abs(c[2]) < 0.05;
const colOf = (c) => c.map((v) => v.toFixed(2)).join(',');
const W = 1198.08, H = 848.88;

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

const qs = [];
for (let i = 3; i < process.argv.length; i += 3) qs.push({ label: process.argv[i], x: +process.argv[i + 1], y: +process.argv[i + 2] });
const hi = new Map();
for (const q of qs) {
  let best = -1, bd = 1e9;
  for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - q.x, pts[i][1] - q.y); if (d < bd) { bd = d; best = i; } }
  hi.set(find(best), q.label);
  console.log('highlight', q.label, 'root', find(best), 'node', pts[best].map((v) => v.toFixed(1)).join(','), 'd', bd.toFixed(2));
}
const f = (v) => +v.toFixed(2);
let out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/><g transform="translate(0,${H}) scale(1,-1)">`);
for (const p of paths) {
  if (!p.stroked || p.filled) continue;
  if (isGreen(p.stroke)) continue;
  let d = '';
  for (const s of p.segments) { if (s[0] === 'm') d += `M ${f(s[1])} ${f(s[2])} `; else if (s[0] === 'l') d += `L ${f(s[1])} ${f(s[2])} `; }
  for (const c of p.curves) d += `C ${f(c[1])} ${f(c[2])} ${f(c[3])} ${f(c[4])} ${f(c[5])} ${f(c[6])} `;
  for (const r of p.rects) d += `M ${f(r[0][0])} ${f(r[0][1])} L ${f(r[1][0])} ${f(r[1][1])} L ${f(r[2][0])} ${f(r[2][1])} L ${f(r[3][0])} ${f(r[3][1])} Z `;
  if (d) out.push(`<path d="${d.trim()}" fill="none" stroke="#999999" stroke-width="${f(p.lw)}"/>`);
}
for (const w of wires) {
  if (w.length < 2) continue;
  const r = find(addPt(w[0]));
  const lab = hi.get(r);
  const c = lab ? '#e00000' : '#c9c9c9';
  let d = `M ${f(w[0][0])} ${f(w[0][1])} `;
  for (let i = 1; i < w.length; i++) d += `L ${f(w[i][0])} ${f(w[i][1])} `;
  out.push(`<path d="${d}" fill="none" stroke="${c}" stroke-width="${lab ? 2.6 : 1.5}" stroke-linecap="round"/>`);
}
out.push('</g>');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
for (const t of texts) {
  const s = t.str.trim(); if (!s) continue;
  const c = colOf(t.color);
  const isRef = c === '0.00,0.00,0.50', isVal = c === '0.00,0.00,1.00';
  if (!isRef && !isVal && t.size > 6) continue;
  out.push(`<text x="${f(t.x)}" y="${f(H - t.y)}" font-family="Arial, sans-serif" font-size="${f(t.size * 2.1)}" font-weight="bold" fill="${isRef ? '#000' : '#0044cc'}" stroke="#fff" stroke-width="0.8" paint-order="stroke">${esc(s.replace(/\u03a9/g, 'R'))}</text>`);
}
out.push('</svg>');
fs.writeFileSync(process.argv[process.argv.length - 1] === 'out' ? 'x' : '_analysis/hl.svg', out.join('\n'), 'utf8');
console.log('written _analysis/hl.svg');
