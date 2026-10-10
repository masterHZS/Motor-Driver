import fs from 'node:fs';

const content = fs.readFileSync(process.argv[2], 'latin1');

/* ---------- tokenizer ---------- */
function tokenize(src) {
  const toks = [];
  const arrStack = [];
  const push = (tk) => { if (arrStack.length) arrStack[arrStack.length - 1].push(tk); else toks.push(tk); };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '%' || (c === '/' && src[i + 1] === '/')) { // not standard but safe
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0') { i++; continue; }
    if (c === '(') {
      // literal string with escapes and nesting
      let depth = 1, j = i + 1, out = '';
      while (j < n && depth > 0) {
        const ch = src[j];
        if (ch === '\\') {
          const nx = src[j + 1];
          const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
          if (nx in map) { out += map[nx]; j += 2; continue; }
          if (nx >= '0' && nx <= '7') {
            let oct = '';
            let k = j + 1;
            while (k < n && oct.length < 3 && src[k] >= '0' && src[k] <= '7') { oct += src[k]; k++; }
            out += String.fromCharCode(parseInt(oct, 8));
            j = k; continue;
          }
          out += nx; j += 2; continue;
        }
        if (ch === '(') depth++;
        if (ch === ')') { depth--; if (depth === 0) { j++; break; } }
        out += ch; j++;
      }
      push({ t: 'str', v: out });
      i = j; continue;
    }
    if (c === '<' && src[i + 1] !== '<') {
      const j = src.indexOf('>', i);
      push({ t: 'hex', v: src.slice(i + 1, j) });
      i = j + 1; continue;
    }
    if (c === '[') { arrStack.push([]); i++; continue; }
    if (c === ']') { const a = arrStack.pop(); const tk = { t: 'arr', items: a }; if (arrStack.length) arrStack[arrStack.length - 1].push(tk); else push(tk); i++; continue; }
    if (c === '<' && src[i + 1] === '<') { push({ t: 'dict_start' }); i += 2; continue; }
    if (c === '>' && src[i + 1] === '>') { push({ t: 'dict_end' }); i += 2; continue; }
    if (c === '/') {
      let j = i + 1;
      while (j < n && !/[\s\/\[\]<>()]/.test(src[j])) j++;
      push({ t: 'name', v: src.slice(i + 1, j) });
      i = j; continue;
    }
    // number or operator
    let j = i;
    while (j < n && !/[\s\/\[\]<>()]/.test(src[j])) j++;
    const word = src.slice(i, j);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) push({ t: 'num', v: parseFloat(word) });
    else push({ t: 'op', v: word });
    i = j;
  }
  return toks;
}

/* ---------- graphics state ---------- */
const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const GRAY = (g) => [g, g, g];
const RGB = (r, g, b) => [r, g, b];
const CMYK = (c, m, y, k) => [ (1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k) ];

const toks = tokenize(content);
const stack = [];
let gs = {
  ctm: [1, 0, 0, 1, 0, 0],
  lw: 1, lc: 0, lj: 0,
  stroke: [0, 0, 0], fill: [0, 0, 0],
  font: null, fsize: 12, charSpace: 0, wordSpace: 0, hscale: 1, leading: 0, rise: 0,
  textRender: 0,
};

const texts = [];
const paths = [];   // {segments:[[x1,y1,x2,y2]], rects, curves, stroke, fill, lw, filled, stroked}
let cur = null;
let operands = [];

const num = (o) => (typeof o === 'number' ? o : 0);

function flushPath(paintOp) {
  if (!cur) return;
  const stroked = 'S s B B* b b*'.split(' ').includes(paintOp);
  const filled = 'f F f* B B* b b*'.split(' ').includes(paintOp);
  if ((cur.segments.length || cur.rects.length || cur.curves.length) && (stroked || filled)) {
    paths.push({
      segments: cur.segments, rects: cur.rects, curves: cur.curves,
      stroke: gs.stroke.slice(), fill: gs.fill.slice(), lw: gs.lw,
      stroked, filled, evenOdd: paintOp.includes('*'),
    });
  }
  cur = null;
}
function ensurePath() { if (!cur) cur = { segments: [], rects: [], curves: [] }; return cur; }

for (const tk of toks) {
  if (tk.t !== 'op') { operands.push(tk); continue; }
  const op = tk.v;
  const O = operands;
  switch (op) {
    case 'q': stack.push({ ...gs, stroke: gs.stroke.slice(), fill: gs.fill.slice(), ctm: gs.ctm.slice() }); break;
    case 'Q': if (stack.length) gs = stack.pop(); break;
    case 'cm': gs.ctm = mul(O.map((o) => num(o.v)), gs.ctm); break;
    case 'w': gs.lw = num(O[0]?.v); break;
    case 'J': gs.lc = num(O[0]?.v); break;
    case 'j': gs.lj = num(O[0]?.v); break;
    case 'M': break;
    case 'd': break;
    case 'ri': case 'i': break;
    case 'gs': break;
    case 'G': gs.stroke = GRAY(num(O[0]?.v)); break;
    case 'g': gs.fill = GRAY(num(O[0]?.v)); break;
    case 'RG': gs.stroke = RGB(num(O[0]?.v), num(O[1]?.v), num(O[2]?.v)); break;
    case 'rg': gs.fill = RGB(num(O[0]?.v), num(O[1]?.v), num(O[2]?.v)); break;
    case 'K': gs.stroke = CMYK(num(O[0]?.v), num(O[1]?.v), num(O[2]?.v), num(O[3]?.v)); break;
    case 'k': gs.fill = CMYK(num(O[0]?.v), num(O[1]?.v), num(O[2]?.v), num(O[3]?.v)); break;

    case 'm': ensurePath(); { const [x, y] = apply(gs.ctm, num(O[0]?.v), num(O[1]?.v)); cur.segments.push(['m', x, y]); } break;
    case 'l': ensurePath(); { const [x, y] = apply(gs.ctm, num(O[0]?.v), num(O[1]?.v)); cur.segments.push(['l', x, y]); } break;
    case 'c': ensurePath(); { const p = [0, 1, 2].map((i) => apply(gs.ctm, num(O[i * 2]?.v), num(O[i * 2 + 1]?.v))); cur.curves.push(['c', ...p.flat()]); } break;
    case 'v': ensurePath(); { const p = [0, 1].map((i) => apply(gs.ctm, num(O[i * 2]?.v), num(O[i * 2 + 1]?.v))); cur.curves.push(['c', ...p.flat()]); } break;
    case 'y': ensurePath(); { const p = [0, 1].map((i) => apply(gs.ctm, num(O[i * 2]?.v), num(O[i * 2 + 1]?.v))); cur.curves.push(['c', ...p.flat()]); } break;
    case 'h': ensurePath(); cur.segments.push(['h']); break;
    case 're': {
      ensurePath();
      const x = num(O[0]?.v), y = num(O[1]?.v), w = num(O[2]?.v), h = num(O[3]?.v);
      const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([a, b]) => apply(gs.ctm, a, b));
      cur.rects.push(pts);
      break;
    }
    case 'n': flushPath('n'); break;
    case 'S': case 's': case 'f': case 'F': case 'f*': case 'B': case 'B*': case 'b': case 'b*':
      flushPath(op); break;
    case 'W': case 'W*': break;

    case 'BT': gs.tm = [1, 0, 0, 1, 0, 0]; gs.tlm = [1, 0, 0, 1, 0, 0]; break;
    case 'ET': break;
    case 'Tf': gs.font = O[0]?.v; gs.fsize = num(O[1]?.v); break;
    case 'TL': gs.leading = num(O[0]?.v); break;
    case 'Tc': gs.charSpace = num(O[0]?.v); break;
    case 'Tw': gs.wordSpace = num(O[0]?.v); break;
    case 'Tz': gs.hscale = num(O[0]?.v) / 100; break;
    case 'Ts': gs.rise = num(O[0]?.v); break;
    case 'Tr': gs.textRender = num(O[0]?.v); break;
    case 'Td': {
      const tx = num(O[0]?.v), ty = num(O[1]?.v);
      gs.tlm = mul([1, 0, 0, 1, tx, ty], gs.tlm);
      gs.tm = gs.tlm.slice();
      break;
    }
    case 'TD': {
      const tx = num(O[0]?.v), ty = num(O[1]?.v);
      gs.leading = -ty;
      gs.tlm = mul([1, 0, 0, 1, tx, ty], gs.tlm);
      gs.tm = gs.tlm.slice();
      break;
    }
    case 'Tm': gs.tm = O.map((o) => num(o.v)); gs.tlm = gs.tm.slice(); break;
    case 'T*': gs.tlm = mul([1, 0, 0, 1, 0, -gs.leading], gs.tlm); gs.tm = gs.tlm.slice(); break;
    case 'Tj': case "'": case '"': {
      if (op === "'") { gs.tlm = mul([1, 0, 0, 1, 0, -gs.leading], gs.tlm); gs.tm = gs.tlm.slice(); }
      const sTok = op === '"' ? O[2] : O[0];
      const raw = sTok?.t === 'hex' ? hexToBytes(sTok.v) : sTok?.t === 'str' ? latin1Bytes(sTok.v) : [];
      if (raw.length) {
        const [x, y] = apply(mul(gs.tm, gs.ctm), 0, gs.rise);
        texts.push({
          x, y, font: gs.font, size: gs.fsize, color: gs.fill.slice(),
          bytes: raw, str: decode(raw, gs.font),
        });
      }
      break;
    }
    case 'TJ': {
      const arr = O[0];
      const items = arr?.t === 'arr' ? arr.items : [];
      const first = items.find((it) => it.t === 'hex' || it.t === 'str');
      const raw = first ? (first.t === 'hex' ? hexToBytes(first.v) : latin1Bytes(first.v)) : [];
      if (raw.length) {
        const [x, y] = apply(mul(gs.tm, gs.ctm), 0, gs.rise);
        texts.push({ x, y, font: gs.font, size: gs.fsize, color: gs.fill.slice(), bytes: raw, str: decode(raw, gs.font) });
      }
      break;
    }
    default: break;
  }
  operands = [];
}

function latin1Bytes(str) { return [...str].map((ch) => ch.charCodeAt(0) & 0xff); }
function hexToBytes(hex) {
  const h = hex.replace(/[^0-9A-Fa-f]/g, '');
  // skip whitespace already stripped
  const out = [];
  for (let i = 0; i + 1 < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
}
function decode(bytes, font) {
  // F1 -> SimSun UniGB-UCS2-H ; F3 -> SimHei UniGB-UCS2-H ; F2 -> Arial WinAnsi
  if (font === 'F2') return bytes.map((b) => String.fromCharCode(b)).join('');
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  if (bytes.length % 2) s += String.fromCharCode(bytes[bytes.length - 1]);
  return s;
}

fs.writeFileSync(process.argv[3], JSON.stringify({ texts, paths }, null, 0));
console.log('texts:', texts.length, 'paths:', paths.length);
