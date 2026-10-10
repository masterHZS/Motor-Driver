import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const buf = fs.readFileSync(file);
const s = buf.toString('latin1');
const N_ = s.length;

/* ---------- sequential top-level object scan (skips stream payloads) ---------- */
const top = new Map();
let pos = 0;
const objHead = /(\d+)\s+(\d+)\s+obj\b/g;
function parseDictAt(i) {
  // i points at first '<' of '<<'
  let depth = 0, j = i;
  for (; j < N_ - 1; j++) {
    if (s[j] === '<' && s[j + 1] === '<') { depth++; j++; continue; }
    if (s[j] === '>' && s[j + 1] === '>') { depth--; j++; if (depth === 0) return { text: s.slice(i, j + 1), end: j + 1 }; continue; }
  }
  return { text: s.slice(i, i + 500), end: i + 500 };
}
while (true) {
  objHead.lastIndex = pos;
  const m = objHead.exec(s);
  if (!m) break;
  const num = +m[1];
  let p = objHead.lastIndex;
  while (p < N_ && /\s/.test(s[p])) p++;
  let dict = '', raw = null, rawStart = null, nonStream = '';
  if (s[p] === '<' && s[p + 1] === '<') {
    const d = parseDictAt(p);
    dict = d.text;
    let q = d.end;
    while (q < N_ && /\s/.test(s[q])) q++;
    if (s.startsWith('stream', q)) {
      let r = q + 6;
      while (s[r] === '\r' || s[r] === '\n') r++;
      const lm = dict.match(/\/Length\s+(\d+)(?!\s+0\s+R)/);
      if (lm) { raw = Buffer.from(s.slice(r, r + +lm[1]), 'latin1'); rawStart = r; }
      else { const e = s.indexOf('endstream', r); raw = Buffer.from(s.slice(r, e), 'latin1'); rawStart = r; }
      pos = rawStart + (raw ? raw.length : 0);
    } else {
      const e = s.indexOf('endobj', d.end);
      nonStream = s.slice(d.end, e < 0 ? d.end + 200 : e);
      pos = e < 0 ? d.end : e;
    }
  } else {
    const e = s.indexOf('endobj', p);
    nonStream = s.slice(p, e < 0 ? p + 200 : e);
    pos = e < 0 ? p : e;
  }
  top.set(num, { num, dict, raw, rawStart, body: raw ? null : nonStream });
}
console.log('top-level objects:', top.size);

function inflateOf(o) {
  if (!o) return null;
  if (!o.raw) return o.body ?? null;
  if (/FlateDecode/.test(o.dict)) {
    for (const f of [zlib.inflateSync, (b) => zlib.inflateSync(b.subarray(1)), (b) => zlib.inflateSync(b.subarray(2)), (b) => zlib.inflateRawSync(b)]) {
      try { return f(o.raw).toString('latin1'); } catch (e) { }
    }
    return null;
  }
  return o.raw.toString('latin1');
}

/* ---------- expand object streams ---------- */
const all = new Map(top);
let cnt = 0, stmBad = 0;
for (const o of top.values()) {
  if (!/\/Type\s*\/ObjStm/.test(o.dict)) continue;
  const data = inflateOf(o);
  if (!data) { stmBad++; continue; }
  const N = +(o.dict.match(/\/N\s+(\d+)/) || [])[1];
  const First = +(o.dict.match(/\/First\s+(\d+)/) || [])[1];
  if (!N || First == null || isNaN(First)) { stmBad++; continue; }
  const hdr = data.slice(0, First).trim().split(/\s+/).map(Number);
  for (let i = 0; i < N; i++) {
    const onum = hdr[i * 2], off = hdr[i * 2 + 1];
    const endOff = i + 1 < N ? hdr[(i + 1) * 2 + 1] : data.length - First;
    const body = data.slice(First + off, First + endOff);
    all.set(onum, { num: onum, dict: body.slice(0, 300), raw: null, body });
    cnt++;
  }
}
console.log('ObjStm expanded:', cnt, 'bad ObjStm:', stmBad, 'total:', all.size);
const T = (num) => { const o = all.get(num); if (!o) return null; return o.raw ? inflateOf(o) : (o.body ?? null); };

/* ---------- page order ---------- */
const pages = [];
const seen = new Set();
function walk(num) {
  if (!num || seen.has(num)) return; seen.add(num);
  const t = T(num); if (!t) return;
  if (/\/Type\s*\/Page[^s]/.test(t)) { pages.push(num); return; }
  const kids = t.match(/\/Kids\s*\[([^\]]*)\]/);
  if (kids) for (const mm of kids[1].matchAll(/(\d+)\s+0\s+R/g)) walk(+mm[1]);
}
const catalog = T(1) || '';
const pagesRef = +(catalog.match(/\/Pages\s+(\d+)\s+0\s+R/) || [])[1] || 2;
console.log('catalog:', catalog.slice(0, 200));
walk(pagesRef);
console.log('pages:', pages.length);

fs.writeFileSync('_analysis/ds_pages.json', JSON.stringify(pages));
fs.writeFileSync('_analysis/ds_page0.json', JSON.stringify({ num: pages[0], text: T(pages[0]) }, null, 1));
console.log('page objects sample:', pages.slice(0, 10).join(','));
fs.writeFileSync('_analysis/ds_allobjs.json', JSON.stringify({ pages, n: all.size }));
export { all, T, pages, inflateOf };
