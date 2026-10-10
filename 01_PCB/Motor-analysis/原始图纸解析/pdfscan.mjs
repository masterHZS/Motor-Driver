import fs from 'node:fs';
import zlib from 'node:zlib';

const buf = fs.readFileSync(process.argv[2]);
const s = buf.toString('latin1');

/* ---------- helpers ---------- */
function findStreams(src) {
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const end = src.indexOf('endstream', start);
    if (end < 0) continue;
    // dictionary is the text before 'stream'
    const dictStart = src.lastIndexOf('<<', m.index);
    const dict = src.slice(dictStart, m.index);
    out.push({ start, end, dict, raw: src.slice(start, end) });
    re.lastIndex = end;
  }
  return out;
}
const streams = findStreams(s);
console.log('streams found:', streams.length);

let okFlate = 0, failFlate = 0;
const inflated = [];
for (const st of streams) {
  if (!/FlateDecode/.test(st.dict)) { inflated.push({ ...st, data: st.raw, plain: true }); continue; }
  try {
    const data = zlib.inflateSync(Buffer.from(st.raw, 'latin1'));
    inflated.push({ ...st, data: data.toString('latin1'), plain: false });
    okFlate++;
  } catch (e) { failFlate++; }
}
console.log('flate ok:', okFlate, 'fail:', failFlate);

const cmaps = inflated.filter((x) => !x.plain && /begincmap/.test(x.data));
console.log('ToUnicode CMaps:', cmaps.length);

const contentLike = inflated.filter((x) => !x.plain && /\bBT\b/.test(x.data) && /\bTf\b/.test(x.data));
console.log('content-like streams:', contentLike.length);

fs.writeFileSync('_analysis/ds_streams.json', JSON.stringify({
  n: inflated.length,
  kinds: inflated.map((x, i) => ({ i, plain: x.plain, len: x.data.length, cmap: /begincmap/.test(x.data), content: /\bBT\b/.test(x.data) && /\bTf\b/.test(x.data), dict: x.dict.slice(0, 200) })),
}, null, 1));

/* quick peek: any ASCII pin names in inflated content? */
const all = inflated.map((x) => x.data).join('\n');
for (const kw of ['LQFP', 'VC0', 'VC1', 'OPA', 'ADC_IN', 'TIM6', 'TIMA', 'PA0', 'PB0', 'PC0', 'HC32F072', 'VSSA', 'AVCC']) {
  console.log(`"${kw}":`, (all.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length);
}
fs.writeFileSync('_analysis/ds_all.txt', all.slice(0, 200000), 'latin1');
