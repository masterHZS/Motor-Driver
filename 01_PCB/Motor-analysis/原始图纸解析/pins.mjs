import fs from 'node:fs';
const { texts } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const colOf = (c) => c.map((v) => v.toFixed(2)).join(',');
const want = /^(VB[123]|VS[123]|HO[123]|LO[123]|HIN[123]|LIN[123]|VCC|COM|GND|EN|FB|SW|VIN|VCC_BUS|A|B|C)$/;
const T = texts.map((t) => ({ s: t.str.trim(), x: t.x, y: t.y, c: colOf(t.color), size: t.size }))
  .filter((t) => want.test(t.s));
T.sort((a, b) => (b.y - a.y) || (a.x - b.x));
for (const t of T) console.log(`${t.y.toFixed(1).padStart(7)} ${t.x.toFixed(1).padStart(8)} ${t.c.padEnd(16)} sz=${t.size.toFixed(1)} ${t.s}`);
