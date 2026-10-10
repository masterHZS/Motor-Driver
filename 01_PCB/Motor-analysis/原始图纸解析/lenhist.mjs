import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const colOf = (c) => c.map((v) => v.toFixed(2)).join(',');
const hist = {};
for (const p of paths) {
  if (!p.stroked || p.filled) continue;
  const k = colOf(p.stroke) + ' lw' + p.lw;
  hist[k] ||= [];
  let cur = null;
  const seg = (a, b) => hist[k].push(+Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(2));
  for (const s of p.segments) {
    if (s[0] === 'm') cur = [s[1], s[2]];
    else if (s[0] === 'l' && cur) { seg(cur, [s[1], s[2]]); cur = [s[1], s[2]]; }
  }
}
for (const [k, arr] of Object.entries(hist)) {
  const b = {};
  for (const v of arr) { const key = Math.round(v); b[key] = (b[key] || 0) + 1; }
  const top = Object.entries(b).sort((a, c) => c[1] - a[1]).slice(0, 10);
  console.log(k, 'total segs', arr.length, '| length histogram:', top.map(([l, n]) => `${l}pt:${n}`).join('  '));
}
