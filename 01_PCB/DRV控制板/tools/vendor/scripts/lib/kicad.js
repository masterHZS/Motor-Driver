'use strict';

// Lightweight KiCad .kicad_sym and .kicad_pcb parser.
// We do not implement the full S-expression parser; only the subset needed for
// symbol/footprint extraction. For robust parsing the script can shell out to
// KiCad's kicad-cli when available.

const fs = require('fs');

function tokenize(text) {
  // S-expression tokenizer
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '(') { tokens.push({ t: '(', v: '(' }); i++; continue; }
    if (c === ')') { tokens.push({ t: ')', v: ')' }); i++; continue; }
    if (c === '"') {
      let j = i + 1; let s = '';
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') { s += text[j + 1]; j += 2; continue; }
        s += text[j]; j++;
      }
      tokens.push({ t: 'str', v: s });
      i = j + 1; continue;
    }
    let j = i;
    while (j < text.length && !' \t\n\r()'.includes(text[j])) j++;
    const v = text.slice(i, j);
    tokens.push({ t: /^-?\d+(\.\d+)?$/.test(v) ? 'num' : 'sym', v });
    i = j;
  }
  return tokens;
}

function parse(text) {
  const tokens = tokenize(text);
  let pos = 0;
  function parseNode() {
    if (tokens[pos].t !== '(') throw new Error(`Expected ( at ${pos}`);
    pos++;
    const items = [];
    while (tokens[pos].t !== ')') {
      if (tokens[pos].t === '(') items.push(parseNode());
      else items.push(tokens[pos++]);
    }
    pos++;
    return items;
  }
  return parseNode();
}

function strokeInfo(node) {
  // (stroke (width W) (type TYPE) (color R G B A))
  const out = { width: null, type: null };
  for (const it of node.slice(1)) {
    if (!Array.isArray(it)) continue;
    if (it[0].v === 'width') out.width = parseFloat(it[1]?.v);
    else if (it[0].v === 'type') out.type = it[1]?.v;
  }
  return out;
}

function fillType(node) {
  // (fill (type none|outline|background))
  for (const it of node.slice(1)) {
    if (Array.isArray(it) && it[0].v === 'type') return it[1]?.v || null;
  }
  return null;
}

// arc: (start X Y) (mid X Y) (end X Y)
function extractArc(node) {
  const out = {};
  for (const it of node.slice(1)) {
    if (!Array.isArray(it)) continue;
    const h = it[0].v;
    if (h === 'start') out.x1 = parseFloat(it[1].v), out.y1 = parseFloat(it[2].v);
    if (h === 'mid') out.mx = parseFloat(it[1].v), out.my = parseFloat(it[2].v);
    if (h === 'end') out.x2 = parseFloat(it[1].v), out.y2 = parseFloat(it[2].v);
  }
  return out;
}

function nodeSymbol(node) {
  const out = { name: '', properties: {}, pins: [], shapes: [], hidePinNumbers: false, hidePinNames: false };
  if (!Array.isArray(node) || !node.length || node[0].v !== 'symbol') return out;
  out.name = node[1]?.v || '';
  for (let i = 2; i < node.length; i++) {
    const it = node[i];
    if (!Array.isArray(it) || !it.length || typeof it[0]?.v !== 'string') continue;
    const head = it[0].v;
    if (head === 'symbol') {
      // KiCad 6+ nests per-unit graphics in (symbol "NAME_0_1") / (symbol "NAME_1_1")
      const sub = nodeSymbol(it);
      out.pins.push(...sub.pins);
      out.shapes.push(...sub.shapes);
      if (sub.hidePinNumbers) out.hidePinNumbers = true;
      if (sub.hidePinNames) out.hidePinNames = true;
      if (!out.name && sub.name) out.name = sub.name;
    } else if (head === 'pin_numbers') {
      // (pin_numbers (hide yes)) or (pin_numbers hide)
      out.hidePinNumbers = it.some(x => !Array.isArray(x) && x.v === 'hide')
        || it.some(x => Array.isArray(x) && x[0]?.v === 'hide' && x[1]?.v === 'yes');
    } else if (head === 'pin_names') {
      out.hidePinNames = it.some(x => !Array.isArray(x) && x.v === 'hide')
        || it.some(x => Array.isArray(x) && x[0]?.v === 'hide' && x[1]?.v === 'yes');
    } else if (head === 'property') {
      out.properties[it[1]?.v] = it[2]?.v;
    } else if (head === 'pin') {
      // (pin <electrical> <graphic_style> (at X Y R) (length L) (name "..") (number ".."))
      const pin = { name: '', number: '', x: 0, y: 0, length: 0, rotation: 0, electric: it[1]?.v || 'unspecified', style: it[2]?.v || 'line' };
      for (let j = 1; j < it.length; j++) {
        const sub = it[j];
        if (!Array.isArray(sub) || !sub.length) continue;
        if (sub[0].v === 'name') {
          pin.name = sub[1]?.v;
          pin.nameHide = sub.some(x => Array.isArray(x) && x[0]?.v === 'hide' && x[1]?.v === 'yes');
        }
        else if (sub[0].v === 'number') {
          pin.number = sub[1]?.v;
          pin.numberHide = sub.some(x => Array.isArray(x) && x[0]?.v === 'hide' && x[1]?.v === 'yes');
        }
        else if (sub[0].v === 'at') {
          pin.x = parseFloat(sub[1]?.v || 0);
          pin.y = parseFloat(sub[2]?.v || 0);
          pin.rotation = parseFloat(sub[3]?.v || 0);
        } else if (sub[0].v === 'length') pin.length = parseFloat(sub[1]?.v || 0);
      }
      out.pins.push(pin);
    } else if (head === 'rectangle' || head === 'rect') {
      out.shapes.push({ type: 'RECT', ...extractXY(it), ...shapeStyle(it) });
    } else if (head === 'circle') {
      out.shapes.push({ type: 'CIRCLE', ...extractXY(it), ...shapeStyle(it) });
    } else if (head === 'polyline' || head === 'line') {
      out.shapes.push({ type: 'POLY', pts: extractPts(it), ...shapeStyle(it) });
    } else if (head === 'arc') {
      out.shapes.push({ type: 'ARC', ...extractArc(it), ...shapeStyle(it) });
    } else if (head === 'bezier') {
      out.shapes.push({ type: 'BEZIER', pts: extractPts(it), ...shapeStyle(it) });
    }
  }
  return out;
}

function shapeStyle(node) {
  const out = {};
  for (const it of node.slice(1)) {
    if (!Array.isArray(it)) continue;
    if (it[0].v === 'stroke') out.stroke = strokeInfo(it);
    else if (it[0].v === 'fill') out.fill = fillType(it);
  }
  return out;
}

function extractXY(node) {
  const out = {};
  for (let i = 1; i < node.length; i++) {
    const sub = node[i];
    if (!Array.isArray(sub)) continue;
    const h = sub[0].v;
    if (h === 'start') out.x1 = parseFloat(sub[1].v), out.y1 = parseFloat(sub[2].v);
    if (h === 'end') out.x2 = parseFloat(sub[1].v), out.y2 = parseFloat(sub[2].v);
    if (h === 'center') out.cx = parseFloat(sub[1].v), out.cy = parseFloat(sub[2].v);
    if (h === 'radius') out.r = parseFloat(sub[1].v);
  }
  return out;
}

function extractPts(node) {
  const pts = [];
  for (let i = 1; i < node.length; i++) {
    const sub = node[i];
    if (Array.isArray(sub) && sub[0].v === 'pts') {
      for (let j = 1; j < sub.length; j++) {
        const xy = sub[j];
        if (Array.isArray(xy) && xy[0].v === 'xy') {
          pts.push({ x: parseFloat(xy[1].v), y: parseFloat(xy[2].v) });
        }
      }
    }
  }
  return pts;
}

function parseSymbolFile(path) {
  const text = fs.readFileSync(path, 'utf8');
  const root = parse(text);
  // root = (kicad_symbol_lib (version ...) (generator ...) (symbol "x" ...) (symbol "y" ...))
  const symbols = [];
  for (const node of root.slice(1)) {
    if (Array.isArray(node) && node[0].v === 'symbol') {
      symbols.push(nodeSymbol(node));
    }
  }
  return symbols;
}

// ---- generic s-expression node helpers shared by the converters ----

function findSub(node, key) {
  for (const it of node.slice(1)) if (Array.isArray(it) && it[0].v === key) return it.slice(1).map(x => x.v);
  return null;
}

function findSubNode(node, key) {
  for (const it of node.slice(1)) if (Array.isArray(it) && it[0].v === key) return it;
  return null;
}

function findChildValue(node, key) {
  for (const it of node.slice(1)) if (Array.isArray(it) && it[0].v === key && it[1]) return it[1].v;
  return null;
}

function findFlags(node, name) {
  const out = [];
  for (const it of node.slice(1)) {
    if (Array.isArray(it) && it[0].v === name) {
      for (const x of it.slice(1)) if (x && typeof x.v === 'string') out.push(x.v);
    }
  }
  return out;
}

function collectProperties(node) {
  const out = {};
  for (const it of node.slice(1)) {
    if (Array.isArray(it) && it[0].v === 'property') out[it[1]?.v] = it[2]?.v;
  }
  return out;
}

function strokeWidthOf(node, fallback) {
  const w = findSub(node, 'width');
  if (w) return parseFloat(w[0]);
  const stroke = findSubNode(node, 'stroke');
  if (stroke) {
    const sw = findSub(stroke, 'width');
    if (sw) return parseFloat(sw[0]);
  }
  return fallback;
}

// (pad "<num>" <smd|thru_hole|np_thru_hole> <rect|circle|oval|roundrect|custom|trapezoid> ...)
function extractPads(node) {
  const pads = [];
  for (const it of node.slice(1)) if (Array.isArray(it) && it[0].v === 'pad') {
    const pad = { number: it[1]?.v || '', type: it[2]?.v || 'smd', shape: it[3]?.v || 'rect', at: [], size: [], layers: [], angle: 0, netName: '', drill: null, drillOval: null };
    for (const sub of it.slice(1)) {
      if (!Array.isArray(sub)) continue;
      const sh = sub[0].v;
      if (sh === 'at') { pad.at = sub.slice(1).map(x => x.v); if (pad.at.length > 2) pad.angle = parseFloat(pad.at[2]) || 0; }
      else if (sh === 'size') pad.size = sub.slice(1).map(x => x.v);
      else if (sh === 'layers') pad.layers = sub.slice(1).map(x => x.v);
      else if (sh === 'drill') {
        const nums = sub.slice(1).filter(x => typeof x.v === 'string' && /^[\d.]+$/.test(x.v)).map(x => x.v);
        const isOval = sub.slice(1).some(x => x.v === 'oval');
        pad.drill = nums[0];
        if (isOval && nums[1]) pad.drillOval = nums[1];
      }
      else if (sh === 'net') pad.netName = sub[2]?.v || '';
    }
    pads.push(pad);
  }
  return pads;
}

function extractFpShapes(node) {
  const out = [];
  for (const it of node.slice(1)) {
    if (!Array.isArray(it)) continue;
    const h = it[0].v;
    if (h === 'fp_line' || h === 'fp_rect') {
      const xy = findSub(it, 'start');
      const xy2 = findSub(it, 'end');
      const layerArr = findSub(it, 'layer');
      out.push({
        kind: h,
        x1: xy ? +xy[0] : 0, y1: xy ? +xy[1] : 0,
        x2: xy2 ? +xy2[0] : 0, y2: xy2 ? +xy2[1] : 0,
        layer: layerArr ? layerArr[0] : 'F.SilkS',
        width: strokeWidthOf(it, 0.15)
      });
    } else if (h === 'fp_circle') {
      const c = findSub(it, 'center');
      const e = findSub(it, 'end');
      const layerArr = findSub(it, 'layer');
      if (!c || !e) continue;
      const r = Math.hypot(+e[0] - +c[0], +e[1] - +c[1]);
      out.push({ kind: h, cx: +c[0], cy: +c[1], r, layer: layerArr ? layerArr[0] : 'F.SilkS', width: strokeWidthOf(it, 0.15) });
    } else if (h === 'fp_arc') {
      const a = extractArc(it);
      const layerArr = findSub(it, 'layer');
      if (a.mx == null) continue;
      out.push({ kind: h, ...a, layer: layerArr ? layerArr[0] : 'F.SilkS', width: strokeWidthOf(it, 0.15) });
    } else if (h === 'fp_poly') {
      const layerArr = findSub(it, 'layer');
      out.push({ kind: h, pts: extractPts(it), layer: layerArr ? layerArr[0] : 'F.SilkS', width: strokeWidthOf(it, 0.15) });
    }
  }
  return out;
}

// reference/value texts: KiCad 6+ stores them as (fp_text reference "R1" ...),
// older/other files may use (property "Reference" "R1" ...)
function extractFpTexts(node) {
  const out = {};
  for (const it of node.slice(1)) {
    if (!Array.isArray(it) || it[0].v !== 'fp_text') continue;
    const kind = it[1]?.v;       // reference | value | user
    const text = it[2]?.v || '';
    if ((kind === 'reference' || kind === 'value') && !out[kind === 'reference' ? 'Reference' : 'Value']) {
      out[kind === 'reference' ? 'Reference' : 'Value'] = text;
    }
  }
  const props = collectProperties(node);
  if (props.Reference && !out.Reference) out.Reference = props.Reference;
  if (props.Value && !out.Value) out.Value = props.Value;
  return out;
}

// A .kicad_mod file parses to a single (footprint "NAME" ...) node.
function extractFootprintNode(node) {
  return {
    name: node[1]?.v || 'FP',
    pads: extractPads(node),
    shapes: extractFpShapes(node),
    texts: extractFpTexts(node),
    at: findSub(node, 'at'),
    layer: (findSub(node, 'layer') || ['F.Cu'])[0]
  };
}

function parseFootprintFile(path) {
  const text = fs.readFileSync(path, 'utf8');
  const root = parse(text);
  // root = (kicad_pcb ... (footprint "x" ...))
  const fp = { name: '', pads: [], shapes: [], courtyard: null };
  for (const node of root.slice(1)) {
    if (Array.isArray(node) && node[0].v === 'footprint') {
      fp.name = node[1].v;
      for (let i = 2; i < node.length; i++) {
        const it = node[i];
        if (!Array.isArray(it)) continue;
        const h = it[0].v;
        if (h === 'pad') {
          // (pad "<num>" <smd|thru_hole|np_thru_hole> <rect|circle|oval|roundrect|custom> ...)
          const pad = { number: it[1].v, type: it[2]?.v, shape: it[3]?.v, at: [], size: [], layers: [] };
          for (let j = 1; j < it.length; j++) {
            const sub = it[j];
            if (!Array.isArray(sub)) continue;
            const sh = sub[0].v;
            if (sh === 'at') pad.at = sub.slice(1).map(x => x.v);
            else if (sh === 'size') pad.size = sub.slice(1).map(x => x.v);
            else if (sh === 'layers') pad.layers = sub.slice(1).map(x => x.v);
            else if (sh === 'drill') pad.drill = sub[1]?.v;
            else if (sh === 'net') { pad.netNum = sub[1]?.v; pad.netName = sub[2]?.v || ''; }
          }
          fp.pads.push(pad);
        } else if (h === 'fp_line' || h === 'fp_rect' || h === 'fp_circle' || h === 'fp_arc') {
          fp.shapes.push({ kind: h, ...extractXY(it) });
        }
      }
      break;
    }
  }
  return fp;
}

module.exports = {
  parse, parseSymbolFile, parseFootprintFile, tokenize, nodeSymbol,
  extractPts, extractArc, extractXY, strokeInfo, fillType,
  findSub, findSubNode, findChildValue, findFlags, collectProperties,
  strokeWidthOf, extractPads, extractFpShapes, extractFpTexts, extractFootprintNode
};