import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

// 1) dump every text token with position, sorted top-to-bottom (PDF y desc)
const t = texts
  .map((x) => ({ ...x, xr: +x.x.toFixed(1), yr: +x.y.toFixed(1), s: x.str.trim() }))
  .filter((x) => x.s.length)
  .sort((a, b) => (b.yr - a.yr) || (a.xr - b.xr));

fs.writeFileSync('_analysis/texts.txt', t.map((x) => `${x.yr.toFixed(1).padStart(7)} ${x.xr.toFixed(1).padStart(8)} ${x.font} ${x.size.toFixed(1).padStart(5)} |${x.s}|`).join('\n'), 'utf8');

// 2) identify component designators and nearby values
const isRef = (s) => /^[A-Z]{1,3}\d{1,3}$/.test(s);
const isValue = (s) => /^[\d.]+\s*(uF|nF|pF|uH|mH|nH|H|Ω|kΩ|MΩ|R|V|A|mΩ|k|K)$/i.test(s) || /^[\d.]+\s*[kKmM]?Ω$/.test(s) || /^SS110-LTP$|^ES1D$|^XL7005A$|^FD6288T$|^HYG053N10NS1C2$/i.test(s);

const refs = t.filter((x) => isRef(x.s));
console.log('=== designators found:', refs.length);
const groups = {};
for (const r of refs) (groups[r.s.replace(/\d+$/, '')] ||= []).push(r.s);
for (const [k, v] of Object.entries(groups)) console.log(k, '(', v.length, '):', v.join(' '));

// 3) all value-like tokens
console.log('\n=== value-like tokens ===');
const vals = t.filter((x) => isValue(x.s));
const vg = {};
for (const v of vals) (vg[v.s] ||= []).push(`${v.xr},${v.yr}`);
for (const [k, v] of Object.entries(vg)) console.log(k.padEnd(18), v.length, v.join(' '));

// 4) non-ref, non-value text (net labels)
console.log('\n=== other text (labels) ===');
const others = t.filter((x) => !isRef(x.s) && !isValue(x.s) && !/^[\d\s.]+$/.test(x.s) && x.size < 9);
const og = {};
for (const o of others) (og[o.s] ||= []).push(`${o.xr},${o.yr}`);
for (const [k, v] of Object.entries(og)) console.log(k.padEnd(20), v.length, v.join(' '));
