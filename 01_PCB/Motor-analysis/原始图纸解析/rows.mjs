import fs from 'node:fs';
const { texts, paths } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const W = 1198.08, H = 848.88;

// group texts into rows: cluster by y within tolerance
const items = texts.map((t) => ({ ...t, y2: +t.y.toFixed(1), x2: +t.x.toFixed(1) }));
items.sort((a, b) => (b.y2 - a.y2) || (a.x2 - b.x2));

const rows = [];
for (const it of items) {
  let row = rows.find((r) => Math.abs(r.y - it.y2) < 3.2);
  if (!row) { row = { y: it.y2, items: [] }; rows.push(row); }
  row.items.push(it);
}
rows.sort((a, b) => b.y - a.y);

const out = [];
for (const r of rows) {
  // merge adjacent fragments on same row into strings, keeping gaps
  r.items.sort((a, b) => a.x2 - b.x2);
  let line = '';
  let prevEnd = null;
  const frags = [];
  for (const it of r.items) {
    const txt = it.str.trim();
    if (!txt) continue;
    if (prevEnd !== null && it.x2 - prevEnd > 1.5) line += ' ';
    line += txt;
    prevEnd = it.x2 + estWidth(it);
    frags.push(txt);
  }
  if (line.trim()) out.push(`y=${r.y.toFixed(1).padStart(6)}  ${line}`);
}
function estWidth(it) { return it.str.length * it.size * 0.55 * (it.font === 'F2' ? 0.55 : 1); }

fs.writeFileSync(process.argv[3], out.join('\n'), 'utf8');
console.log('rows:', out.length);
console.log(out.slice(0, 120).join('\n'));
