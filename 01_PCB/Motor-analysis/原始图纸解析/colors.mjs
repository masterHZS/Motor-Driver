import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const col = (c) => c.map((v) => v.toFixed(2)).join(',');
const byColor = {};
for (const t of texts) (byColor[col(t.color)] ||= []).push(t);
console.log('=== text colors ===');
for (const [c, arr] of Object.entries(byColor).sort((a, b) => b[1].length - a[1].length)) {
  const samples = arr.slice(0, 14).map((t) => t.str.trim()).filter(Boolean);
  console.log(c.padEnd(18), String(arr.length).padStart(4), '|', samples.join(' / '));
}

console.log('\n=== path stroke colors (stroked only, non-green) ===');
const sc = {};
for (const p of paths) if (p.stroked) (sc[col(p.stroke) + ' lw=' + p.lw] ||= []).push(p);
for (const [c, arr] of Object.entries(sc).sort((a, b) => b[1].length - a[1].length)) console.log(c.padEnd(26), arr.length);
