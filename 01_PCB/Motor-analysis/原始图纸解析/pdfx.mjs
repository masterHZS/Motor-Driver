import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const buf = fs.readFileSync(file);
const s = buf.toString('latin1');

/* ---- object index ---- */
const objs = new Map(); // num -> {dictStart, dictEnd, streamStart, streamEnd, raw}
const objRe = /(?:^|[\s>])(\d+)\s+(\d+)\s+obj\b/g;
let m;
const heads = [];
while ((m = objRe.exec(s))) heads.push({ num: +m[1], gen: +m[2], at: m.index + m[0].length - (m[0].length - m[0].indexOf(String(m[1]))) });
// simpler: recompute 'at' as position of the number
const heads2 = [];
{ const re2 = /(\d+)\s+(\d+)\s+obj\b/g; let k; while ((k = re2.exec(s))) heads2.push({ num: +k[1], gen: +k[2], at: k.index, bodyAt: re2.lastIndex }); }

for (let i = 0; i < heads2.length; i++) {
  const h = heads2[i];
  const end = i + 1 < heads2.length ? heads2[i + 1].at : s.length;
  const chunk = s.slice(h.bodyAt, end);
  const bodyStart = h.bodyAt;
  // parse dict
  const dictStart = chunk.indexOf('<<');
  let dictText = '', streamKw = -1;
  if (dictStart >= 0) {
    // find matching >>
    let depth = 0, j = dictStart;
    for (; j < chunk.length - 1; j++) {
      if (chunk[j] === '<' && chunk[j + 1] === '<') { depth++; j++; continue; }
      if (chunk[j] === '>' && chunk[j + 1] === '>') { depth--; j++; if (depth === 0) break; continue; }
    }
    dictText = chunk.slice(dictStart, j + 1);
    streamKw = chunk.indexOf('stream', j);
  }
  let d = null, raw = null;
  if (streamKw >= 0) {
    let p = bodyStart + streamKw + 'stream'.length;
    while (s[p] === '\r' || s[p] === '\n') p++;
    const lenM = dictText.match(/\/Length\s+(\d+)(?!\s+0\s+R)/);
    if (lenM) {
      const len = +lenM[1];
      raw = Buffer.from(s.slice(p, p + len), 'latin1');
    } else {
      const e = s.indexOf('endstream', p);
      raw = Buffer.from(s.slice(p, e), 'latin1');
    }
    d = dictText;
  }
  objs.set(h.num, { dict: dictText, raw, num: h.num });
}
console.log('objects:', objs.size);

/* ---- resolve /Length indirect ---- */
function inflateObj(o) {
  if (!o.raw) return null;
  if (/FlateDecode/.test(o.dict)) {
    try { return zlib.inflateSync(o.raw).toString('latin1'); }
    catch (e) {
      for (const off of [1, 2]) { try { return zlib.inflateSync(o.raw.subarray(off)).toString('latin1'); } catch (e2) { } }
      try { return zlib.inflateRawSync(o.raw).toString('latin1'); } catch (e3) { }
      return null;
    }
  }
  return o.raw.toString('latin1');
}
function resolveRef(str) {
  const mm = str && str.match(/(\d+)\s+0\s+R/);
  return mm ? +mm[1] : null;
}
/* if /Length is indirect, re-slice */
let fixed = 0;
for (const o of objs.values()) {
  const lm = o.dict && o.dict.match(/\/Length\s+(\d+)\s+0\s+R/);
  if (lm && o.raw) {
    const lenObj = objs.get(+lm[1]);
    const lenTxt = lenObj && (lenObj.dict.match(/^\s*(\d+)/) || (inflateObj(lenObj) || '').match(/^\s*(\d+)/));
    if (lenTxt) {
      const len = +lenTxt[1];
      // re-slice from original
      const idx = s.indexOf(o.dict + 'stream');
      // fallback: search for our stored raw start
      const p = o.rawStart;
      if (p != null && len > 0) { o.raw = Buffer.from(s.slice(p, p + len), 'latin1'); fixed++; }
    }
  }
}
console.log('length-ref fixed:', fixed);

/* ---- collect ---- */
const content = [];
const cmaps = [];
for (const o of objs.values()) {
  if (!o.raw) continue;
  const t = inflateObj(o);
  if (!t) continue;
  if (/begincmap/.test(t)) cmaps.push({ num: o.num, text: t });
  else if (/\bBT\b/.test(t) && /\bTf\b/.test(t) && !/\/Subtype\s*\/Image/.test(o.dict)) content.push({ num: o.num, text: t });
}
console.log('content streams:', content.length, 'cmaps:', cmaps.length);
fs.writeFileSync('_analysis/ds_content.txt', content.map((c) => `%%%OBJ ${c.num}\n${c.text}`).join('\n'), 'latin1');
fs.writeFileSync('_analysis/ds_cmaps.txt', cmaps.map((c) => `%%%OBJ ${c.num}\n${c.text}`).join('\n'), 'latin1');
const all = content.map((c) => c.text).join('\n');
for (const kw of ['LQFP', 'VC0', 'VC1', 'OPA', 'ADC_IN', 'TIM6', 'TIMA', 'PA0', 'PB0', 'PC0', 'HC32F072', 'VSSA', 'AVCC', 'Pin']) {
  console.log(`"${kw}":`, (all.match(new RegExp(kw, 'g')) || []).length);
}
