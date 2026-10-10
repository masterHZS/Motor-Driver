import fs from 'node:fs';
const { paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const isGreen = (c) => Math.abs(c[0]) < 0.05 && Math.abs(c[1] - 0.53) < 0.05 && Math.abs(c[2]) < 0.05;
const isRed = (c) => c[0] > 0.4 && c[1] < 0.05 && c[2] < 0.05;
const dots = [];
for (const p of paths) {
  if (!p.filled) continue;
  if (!(isGreen(p.stroke) || isRed(p.stroke))) continue;
  let sx = 0, sy = 0, n = 0;
  for (const c of p.curves) { sx += c[1]; sy += c[2]; n++; }
  if (n >= 3) dots.push([sx / n, sy / n]);
}
console.log('junction dots:', dots.length);
const [qx, qy, r] = process.argv.slice(3).map(Number);
const near = dots.filter((d) => Math.hypot(d[0] - qx, d[1] - qy) < (r || 40));
console.log(`dots within ${r || 40} of ${qx},${qy}:`, near.length);
for (const d of near) console.log('   ', d[0].toFixed(1), d[1].toFixed(1));
