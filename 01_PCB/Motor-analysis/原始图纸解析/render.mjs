import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const W = 1198.08, H = 848.88;
const rgb = (c) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})`;
const f = (v) => +v.toFixed(2);

let out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
out.push(`<rect width="${W}" height="${H}" fill="#fffdf8"/>`);
out.push(`<g transform="translate(0,${H}) scale(1,-1)">`);

for (const p of paths) {
  let d = '';
  let cx = 0, cy = 0;
  for (const s of p.segments) {
    if (s[0] === 'm') { d += `M ${f(s[1])} ${f(s[2])} `; cx = s[1]; cy = s[2]; }
    else if (s[0] === 'l') { d += `L ${f(s[1])} ${f(s[2])} `; cx = s[1]; cy = s[2]; }
    else if (s[0] === 'h') { d += 'Z '; }
  }
  for (const c of p.curves) {
    d += `C ${f(c[1])} ${f(c[2])} ${f(c[3])} ${f(c[4])} ${f(c[5])} ${f(c[6])} `;
  }
  for (const r of p.rects) {
    d += `M ${f(r[0][0])} ${f(r[0][1])} L ${f(r[1][0])} ${f(r[1][1])} L ${f(r[2][0])} ${f(r[2][1])} L ${f(r[3][0])} ${f(r[3][1])} Z `;
  }
  if (!d.trim()) continue;
  const attrs = [
    `d="${d.trim()}"`,
    p.filled ? `fill="${rgb(p.fill)}"` : 'fill="none"',
    p.filled && p.stroked ? '' : '',
    `fill-rule="${p.evenOdd ? 'evenodd' : 'nonzero'}"`,
    p.stroked ? `stroke="${rgb(p.stroke)}"` : 'stroke="none"',
    p.stroked ? `stroke-width="${f(Math.max(p.lw, 0.05))}"` : '',
    `stroke-linecap="round" stroke-linejoin="round"`,
  ].filter(Boolean).join(' ');
  out.push(`<path ${attrs}/>`);
}
out.push('</g>');

// text layer (unflipped)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
for (const t of texts) {
  const s = t.str.replace(/[\u0000-\u001f]/g, m => '\\u' + m.charCodeAt(0).toString(16).padStart(4,'0'));
  if (!s.trim()) continue;
  const fam = t.font === 'F2' ? 'Arial, Helvetica, sans-serif' : 'SimSun, SimHei, serif';
  out.push(`<text x="${f(t.x)}" y="${f(H - t.y)}" font-family="${fam}" font-size="${f(t.size * 1.55)}" fill="${rgb(t.color)}">${esc(s)}</text>`);
}
out.push('</svg>');
fs.writeFileSync(process.argv[3], out.join('\n'), 'utf8');
console.log('svg bytes', out.join('\n').length, 'paths', paths.length, 'texts', texts.length);
