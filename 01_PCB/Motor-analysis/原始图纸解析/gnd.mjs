import fs from 'node:fs';
const { paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const isRed = (c) => c[0] > 0.4 && c[1] < 0.06 && c[2] < 0.06;

/* collect horizontal red segments */
const hsegs = [];
for (const p of paths) {
  if (!p.stroked || p.filled || !isRed(p.stroke)) continue;
  let cur = null;
  for (const s of p.segments) {
    if (s[0] === 'm') cur = [s[1], s[2]];
    else if (s[0] === 'l' && cur) {
      const a = cur, b = [s[1], s[2]]; cur = b;
      if (Math.abs(a[1] - b[1]) < 0.4) {
        const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
        if (x1 - x0 > 1) hsegs.push({ y: a[1], x0, x1, cx: (x0 + x1) / 2, w: x1 - x0 });
      }
    }
  }
}
/* find stacks of 3+ parallel bars same center, decreasing width, spaced 1..4pt */
const gnds = [];
for (let i = 0; i < hsegs.length; i++) {
  const a = hsegs[i];
  const stack = [a];
  let cur = a;
  for (let k = 0; k < 3; k++) {
    const nxt = hsegs.find((h) => h !== cur && !stack.includes(h) && h.y < cur.y && cur.y - h.y < 5 && h.y - cur.y > 0.5 && Math.abs(h.cx - a.cx) < 1.5 && h.w < cur.w + 0.6);
    if (!nxt) break;
    stack.push(nxt); cur = nxt;
  }
  if (stack.length >= 3) {
    gnds.push({ top: Math.max(...stack.map((s) => s.y)), x: a.cx, bars: stack.length, w0: a.w });
    i += 0;
  }
}
/* dedupe */
const uniq = [];
for (const g of gnds) if (!uniq.some((u) => Math.hypot(u.x - g.x, u.top - g.top) < 4)) uniq.push(g);
console.log('GND symbols found:', uniq.length);
uniq.sort((a, b) => (b.top - a.top) || (a.x - b.x));
for (const g of uniq) console.log('   x=' + g.x.toFixed(1), 'topY=' + g.top.toFixed(1), 'bars=' + g.bars, 'w=' + g.w0.toFixed(1));
fs.writeFileSync('_analysis/gnd.json', JSON.stringify(uniq), 'utf8');
