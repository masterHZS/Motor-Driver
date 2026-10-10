import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const key = (p) => `${p.stroke.map((v) => v.toFixed(2)).join(',')}|${p.fill.map((v) => v.toFixed(2)).join(',')}|${p.lw.toFixed(2)}|${p.stroked ? 'S' : ''}${p.filled ? 'F' : ''}`;
const hist = {};
for (const p of paths) {
  const k = key(p);
  hist[k] = hist[k] || { n: 0, segs: 0, rects: 0, curves: 0, example: p };
  hist[k].n++;
  hist[k].segs += p.segments.length;
  hist[k].rects += p.rects.length;
  hist[k].curves += p.curves.length;
}
const rows = Object.entries(hist).sort((a, b) => b[1].n - a[1].n);
for (const [k, v] of rows) {
  console.log(k.padEnd(46), 'n=' + String(v.n).padStart(4), 'segs=' + String(v.segs).padStart(4), 'rects=' + String(v.rects).padStart(3), 'curves=' + String(v.curves).padStart(3));
}
