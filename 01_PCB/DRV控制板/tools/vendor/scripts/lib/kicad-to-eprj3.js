'use strict';

// Convert KiCad library symbols / footprints into eprj3 records.
// Payload shapes follow the official example project
// (easyeda-pro-eprj3-format/example/eprj3-example) where available, else the
// official format docs (easyeda-pro-file-format/cn/...).

const { randId } = require('./eprj3');

const MM_TO_MIL = 39.3700787; // eprj3 PCB stores positions in mil (1 mm = 39.37 mil)
// eprj3 schematic unit = 0.254 mm (A4 page = 1170 units = 297 mm), i.e. 10 mil.
const MM_TO_SCH = 1 / 0.254;

function kicadToEprj3(val) {
  // KiCad positions are in mm; eprj3 PCB uses mil.
  return val * MM_TO_MIL;
}

// KiCad sheets/boards are Y-down; the eprj3 PCB canvas is Y-up.
function flipY(val) {
  return -kicadToEprj3(val);
}

// KiCad symbol libraries are Y-up; eprj3 schematic records are Y-DOWN in
// 0.254 mm units — so y is negated, x only rescaled.
function kicadToSchUnit(val) {
  return val * MM_TO_SCH;
}
function schX(val) {
  return kicadToSchUnit(val);
}
function schY(val) {
  return -kicadToSchUnit(val);
}

// KiCad sheet coordinates (Y-down, origin top-left) → eprj3 schematic page
// (Y-down, origin bottom-left of the frame): y_page = sch(ky) − pageHeight.
function flipYSch(val, pageHeight) {
  return kicadToSchUnit(val) - (pageHeight || 825);
}

// Mirrored rotation sense caused by a Y flip (PCB path only; schematic angles
// pass through unchanged because both KiCad and eprj3 measure CCW on screen).
function flipRot(deg) {
  const r = ((360 - (parseFloat(deg) || 0)) % 360 + 360) % 360;
  return r;
}

// ---- KiCad stroke/fill → eprj3 string enums (official e-stroke-style / e-sch-fill-style) ----
const STROKE_STYLE_MAP = {
  solid: 'SOLID', dash: 'SHORT_DASH', dot: 'DOT', dash_dot: 'DOT_DASH', dash_dot_dot: 'DOT_DASH'
};
// KiCad fill: none → no fill; outline/background → solid fill with default color
function mapStroke(kicadStroke) {
  // schematic strokes are in 0.254 mm units; keep sub-unit widths (KiCad 0.15 mm ≈ 0.59)
  const w = kicadStroke && kicadStroke.width != null && isFinite(kicadStroke.width)
    ? Math.max(0.5, Math.round(kicadToSchUnit(kicadStroke.width) * 100) / 100) : null;
  const type = kicadStroke && kicadStroke.type && kicadStroke.type in STROKE_STYLE_MAP
    ? STROKE_STYLE_MAP[kicadStroke.type] : 'SOLID'; // KiCad "default" → solid
  return { strokeWidth: w, strokeStyle: type };
}
function mapFill(kicadFill) {
  // fillColor "" = no fill (docs); null = default color
  if (kicadFill && kicadFill !== 'none') return { fillColor: null, fillStyle: 'SOLID' };
  return { fillColor: '', fillStyle: 'NONE' };
}

// Circumcenter of three points (colinear → midpoint fallback).
function circumcenter(x1, y1, x2, y2, x3, y3) {
  const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(d) < 1e-9) return { x: (x1 + x3) / 2, y: (y1 + y3) / 2 };
  const a = x1 * x1 + y1 * y1, b = x2 * x2 + y2 * y2, c = x3 * x3 + y3 * y3;
  return {
    x: (a * (y2 - y3) + b * (y3 - y1) + c * (y1 - y2)) / d,
    y: (a * (x3 - x2) + b * (x1 - x3) + c * (x2 - x1)) / d
  };
}

// Signed sweep (deg, CCW positive in the given coordinate space) of an arc
// start → end passing through mid.
function arcSweep(x1, y1, mx, my, x2, y2) {
  const c = circumcenter(x1, y1, mx, my, x2, y2);
  const a1 = Math.atan2(y1 - c.y, x1 - c.x);
  const am = Math.atan2(my - c.y, mx - c.x);
  const a2 = Math.atan2(y2 - c.y, x2 - c.x);
  const norm = a => { let r = (a - a1) % (2 * Math.PI); if (r < 0) r += 2 * Math.PI; return r; };
  const toMid = norm(am), toEnd = norm(a2);
  let sweep = toEnd;
  if (toMid > toEnd) sweep = toEnd - 2 * Math.PI; // passes through mid the long way
  return { cx: c.x, cy: c.y, sweep: sweep * 180 / Math.PI };
}

// KiCad pin electrical type → eprj3 electric (0 UNKNOWN 1 INPUT 2 OUTPUT 3 BI)
const PIN_ELECTRIC_MAP = {
  input: 1, output: 2, bidirectional: 3, tri_state: 3,
  passive: 0, free: 0, unspecified: 0, power_in: 0, power_out: 0,
  open_collector: 2, open_emitter: 2, no_connect: 0
};
// electric → "Pin Type" ATTR value, as written by the official app exports
const PIN_TYPE_NAME = { 0: 'Undefined', 1: 'IN', 2: 'OUT', 3: 'IO' };
// KiCad pin graphic style → eprj3 pinShape string enum (e-pin-shape)
const PIN_SHAPE_MAP = {
  line: 'NONE', inverted: 'INVERTED', clock: 'CLOCK', inverted_clock: 'INVERTED_CLOCK',
  input_low: 'NONE', clock_low: 'CLOCK', output_low: 'NONE', edge_clock_high: 'CLOCK',
  non_logic: 'NONE'
};

function collectBboxMm(kicadSym) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    if (!isFinite(x) || !isFinite(y)) return;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  for (const sh of kicadSym.shapes || []) {
    if (sh.type === 'RECT') { add(sh.x1, sh.y1); add(sh.x2, sh.y2); }
    else if (sh.type === 'POLY' || sh.type === 'BEZIER') for (const p of sh.pts || []) add(p.x, p.y);
    else if (sh.type === 'CIRCLE' && sh.r != null) { add(sh.cx - sh.r, sh.cy - sh.r); add(sh.cx + sh.r, sh.cy + sh.r); }
    else if (sh.type === 'ARC') {
      add(sh.x1, sh.y1); add(sh.x2, sh.y2);
      if (sh.mx != null) { add(sh.mx, sh.my); }
    }
  }
  for (const pin of kicadSym.pins || []) {
    add(pin.x, pin.y);
    const len = pin.length || 0;
    const rad = (pin.rotation || 0) * Math.PI / 180;
    add(pin.x + len * Math.cos(rad), pin.y + len * Math.sin(rad));
  }
  if (!isFinite(minX)) return [-50, -25, 50, 25];
  return [minX, minY, maxX, maxY];
}

// Farthest graphic extent from a pin origin along the pin direction — used for
// power flags whose KiCad pin length is 0 (record space, Y-down).
function pinGraphicExtent(kicadSym, pin) {
  const rad = (pin.rotation || 0) * Math.PI / 180;
  const dir = { x: Math.cos(rad), y: -Math.sin(rad) }; // eprj3 record direction
  let max = 0;
  const proj = (x, y) => ((schX(x) - schX(pin.x)) * dir.x + (schY(y) - schY(pin.y)) * dir.y);
  for (const sh of kicadSym.shapes || []) {
    const pts = [];
    if (sh.type === 'RECT') pts.push([sh.x1, sh.y1], [sh.x2, sh.y2]);
    else if (sh.type === 'POLY' || sh.type === 'BEZIER') for (const p of sh.pts || []) pts.push([p.x, p.y]);
    else if (sh.type === 'CIRCLE' && sh.r != null) pts.push([sh.cx, sh.cy]);
    else if (sh.type === 'ARC') pts.push([sh.x1, sh.y1], [sh.mx, sh.my], [sh.x2, sh.y2]);
    for (const [x, y] of pts) {
      const d = proj(x, y);
      if (d > max) max = d;
    }
  }
  return max;
}

function buildSymbolRecords(kicadSym, opts = {}) {
  const partId = opts.partId || ('pid' + randId());
  const records = [];
  let ticket = 1;

  // KiCad lib is Y-up; eprj3 symbol records are Y-down → negate y.
  // Official PART BBOX stores the record-space extent as [minX, −minY, maxX, −maxY].
  const bboxMm = collectBboxMm(kicadSym);
  const BBOX = [schX(bboxMm[0]), -schY(bboxMm[3]), schX(bboxMm[2]), -schY(bboxMm[1])];

  records.push({
    head: { type: 'CANVAS', ticket: ++ticket, id: 'CANVAS' },
    body: { originX: 0, originY: 0 }
  });
  records.push({
    head: { type: 'PART', ticket: ++ticket, id: partId },
    body: { BBOX, title: opts.partTitle != null ? opts.partTitle : '' }
  });
  if (opts.libAttrs) {
    // Library-package flavor (elibu): symbols carry Name/Designator part attrs.
    const ref = (kicadSym.properties && kicadSym.properties.Reference) || '?';
    const libAttr = (key, value) => {
      records.push({
        head: { type: 'ATTR', ticket: ++ticket, id: 'e' + randId() },
        body: {
          partId, groupId: '', locked: false, zIndex: ticket, parentId: '',
          key, value,
          keyVisible: false, valueVisible: false,
          x: 0, y: 0, rotation: 0, color: null, fillColor: null, fontFamily: null,
          fontSize: null, strikeout: null, underline: null, italic: null, fontWeight: null, align: 'CENTER_MIDDLE'
        }
      });
    };
    libAttr('Name', (kicadSym.properties && kicadSym.properties.Value) || kicadSym.name || '');
    libAttr('Designator', ref.endsWith('?') ? ref : ref + '?');
  } else {
    // Doc-level Device/Symbol attrs, as written by the official app exports.
    const docAttr = (key, value) => {
      records.push({
        head: { type: 'ATTR', ticket: ++ticket, id: 'e' + randId() },
        body: {
          partId, groupId: '', locked: false, zIndex: ticket, parentId: '',
          key, value,
          keyVisible: false, valueVisible: false,
          x: null, y: null, rotation: 0, color: '#000080', fillColor: null, fontFamily: null,
          fontSize: null, strikeout: null, underline: null, italic: null, fontWeight: null,
          align: 'LEFT_BOTTOM', version: '2.0'
        }
      });
    };
    docAttr('Device', '');
    docAttr('Symbol', kicadSym.name || '');
    if (opts.isPower) {
      docAttr('Name', opts.netName || '');
      docAttr('Global Net Name', opts.netName || '');
    }
  }

  for (const sh of kicadSym.shapes) {
    ticket++;
    const stroke = mapStroke(sh.stroke);
    const fill = mapFill(sh.fill);
    const common = {
      partId, groupId: '', locked: false, zIndex: ticket,
      strokeColor: null, strokeStyle: stroke.strokeStyle, fillColor: fill.fillColor,
      strokeWidth: stroke.strokeWidth, fillStyle: fill.fillStyle
    };
    if (sh.type === 'RECT') {
      records.push({
        head: { type: 'RECT', ticket, id: 'e' + randId() },
        body: {
          ...common,
          dotX1: schX(sh.x1), dotY1: schY(sh.y1),
          dotX2: schX(sh.x2), dotY2: schY(sh.y2),
          radiusX: 0, radiusY: 0, rotation: 0
        }
      });
    } else if (sh.type === 'POLY' && sh.pts) {
      records.push({
        head: { type: 'POLY', ticket, id: 'e' + randId() },
        body: {
          ...common,
          points: sh.pts.map(p => ({ x: schX(p.x), y: schY(p.y) })),
          closed: false, startShape: 'NONE', endShape: 'NONE'
        }
      });
    } else if (sh.type === 'CIRCLE' && sh.r != null) {
      records.push({
        head: { type: 'CIRCLE', ticket, id: 'e' + randId() },
        body: { ...common, centerX: schX(sh.cx), centerY: schY(sh.cy), radius: schX(sh.r) }
      });
    } else if (sh.type === 'ARC' && sh.mx != null) {
      // KiCad arc: start/mid/end. eprj3 ARC: start/refer(center)/end.
      // Mirror the three points into record space, then recompute the center.
      const c = circumcenter(schX(sh.x1), schY(sh.y1), schX(sh.mx), schY(sh.my), schX(sh.x2), schY(sh.y2));
      records.push({
        head: { type: 'ARC', ticket, id: 'e' + randId() },
        body: {
          ...common,
          startX: schX(sh.x1), startY: schY(sh.y1),
          referX: c.x, referY: c.y,
          endX: schX(sh.x2), endY: schY(sh.y2)
        }
      });
    } else if (sh.type === 'BEZIER' && sh.pts && sh.pts.length >= 4) {
      records.push({
        head: { type: 'BEZIER', ticket, id: 'e' + randId() },
        body: { ...common, controls: sh.pts.flatMap(p => [schX(p.x), schY(p.y)]) }
      });
    }
  }

  for (const pin of kicadSym.pins) {
    const pinId = 'e' + randId();
    ticket++;
    const rotation = ((pin.rotation || 0) % 360 + 360) % 360;
    // Power flags carry length 0 in KiCad (wire meets the graphics at the pin
    // origin); stretch the pin to the farthest graphic so the wire lands on it.
    const graphicExtent = opts.isPower ? pinGraphicExtent(kicadSym, pin) : 0;
    const length = pin.length > 0 ? schX(pin.length) : (graphicExtent > 0 ? graphicExtent : schX(2.54));
    const pinName = pin.name && pin.name !== '~' ? pin.name : (opts.isPower ? 'Pin' + (pin.number || '1') : '');
    records.push({
      head: { type: 'PIN', ticket, id: pinId },
      body: {
        partId, groupId: '', locked: false, zIndex: ticket,
        display: true,
        x: schX(pin.x), y: schY(pin.y),
        length,
        // Both spaces are Y-down after the lib flip: KiCad measures the pin
        // direction CCW on screen, eprj3 does the same — rotation passes through.
        rotation,
        color: null, pinShape: PIN_SHAPE_MAP[pin.style] != null ? PIN_SHAPE_MAP[pin.style] : 'NONE'
      }
    });
    // Pin Name/Number attrs follow the app convention: valueVisible controls
    // display; the position is explicit (body end + 3 for the name, 5 back
    // along the pin for the number — matches real displayed-pin exports) so a
    // manual "show" in the client lands at the KiCad spot. Vertical pins keep
    // the text rotated 90 like real exports; align flips for 180/270.
    const rad = rotation * Math.PI / 180;
    const dir = { x: Math.cos(rad), y: -Math.sin(rad) };
    const endX = schX(pin.x) + dir.x * length, endY = schY(pin.y) + dir.y * length;
    const r2 = v => Math.round(v * 100) / 100;
    const vertical = rotation === 90 || rotation === 270;
    const textRotation = vertical ? 90 : 0;
    const nameAlign = (rotation === 180 || rotation === 270) ? 'RIGHT_MIDDLE' : 'LEFT_MIDDLE';
    const numAlign = (rotation === 180 || rotation === 270) ? 'LEFT_BOTTOM' : 'RIGHT_BOTTOM';
    const nameVisible = !opts.isPower && !kicadSym.hidePinNames && !pin.nameHide && !!pinName;
    const numberVisible = !opts.isPower && !kicadSym.hidePinNumbers && !pin.numberHide && !!pin.number;
    const numOff = Math.min(5, length / 2);
    const electric = PIN_ELECTRIC_MAP[pin.electric] != null ? PIN_ELECTRIC_MAP[pin.electric] : 0;
    const pinAttr = (key, value, o) => {
      ticket++;
      records.push({
        head: { type: 'ATTR', ticket, id: 'e' + randId() },
        body: {
          partId, groupId: '', locked: false, zIndex: ticket, parentId: pinId,
          key, value,
          keyVisible: false, valueVisible: o.visible,
          x: o.x, y: o.y, rotation: o.rotation,
          color: null, fillColor: null, fontFamily: null, fontSize: o.fontSize,
          strikeout: boolStyles ? false : null, underline: boolStyles ? false : null,
          italic: boolStyles ? false : null, fontWeight: boolStyles ? false : null,
          align: o.align, version: '2.0'
        }
      });
    };
    const boolStyles = true;
    pinAttr('Pin Name', pinName, {
      visible: nameVisible, x: r2(endX + dir.x * 3), y: r2(endY + dir.y * 3),
      rotation: textRotation, align: nameAlign, fontSize: 9.72222
    });
    pinAttr('Pin Number', pin.number || '', {
      visible: numberVisible, x: r2(endX - dir.x * numOff), y: r2(endY - dir.y * numOff),
      rotation: textRotation, align: numAlign, fontSize: 9.72222
    });
    pinAttr('Pin Type', PIN_TYPE_NAME[electric] || 'Undefined', {
      visible: false, x: null, y: null, rotation: 0, align: 'LEFT_BOTTOM', fontSize: null
    });
  }

  // Power flags: net name rendered at the far end of the graphics from the pin
  // origin (official VCC/GND docs place Name/Global Net Name there).
  let nameOff = null;
  if (opts.isPower && opts.netName) {
    const pin = (kicadSym.pins || [])[0];
    if (pin) {
      const ext = pinGraphicExtent(kicadSym, pin) || schX(2.54);
      const rad = (pin.rotation || 0) * Math.PI / 180;
      const dir = { x: Math.cos(rad), y: -Math.sin(rad) };
      const px = schX(pin.x) + dir.x * ext, py = schY(pin.y) + dir.y * ext;
      const attr = (key, vv) => {
        ticket++;
        records.push({
          head: { type: 'ATTR', ticket, id: 'e' + randId() },
          body: {
            partId, groupId: '', locked: false, zIndex: ticket, parentId: '',
            key, value: opts.netName,
            keyVisible: null, valueVisible: vv,
            x: Math.round(px * 100) / 100, y: Math.round(py * 100) / 100, rotation: 0,
            color: null, fillColor: null, fontFamily: null, fontSize: null,
            strikeout: null, underline: null, italic: null, fontWeight: null,
            align: dir.y < 0 ? 'CENTER_BOTTOM' : 'CENTER_TOP', version: '2.0'
          }
        });
      };
      attr('Name', true);
      attr('Global Net Name', false);
      nameOff = { x: Math.round(px * 100) / 100, y: Math.round(py * 100) / 100, align: dir.y < 0 ? 'CENTER_BOTTOM' : 'CENTER_TOP' };
    }
  }

  return { records, partId, nameOff };
}

const PAD_SHAPE_MAP = { circle: 'ELLIPSE', oval: 'OVAL', roundrect: 'RECT', rect: 'RECT', custom: 'RECT', trapezoid: 'RECT' };

function footprintPadLayerId(pad) {
  const layers = pad.layers || [];
  const isBack = layers.some(l => /^B\./.test(l));
  const thru = (pad.type || '').includes('thru_hole');
  if (thru) return 12; // MULTI
  return isBack ? 2 : 1;
}

function footprintPadHole(pad) {
  if (!(pad.type || '').includes('thru_hole')) return null;
  const d = parseFloat(pad.drill);
  if (!isFinite(d) || d <= 0) return null;
  // oval drills store their second diameter in drillOval
  const w = pad.drillOval ? Math.max(d, parseFloat(pad.drillOval) || d) : d;
  const h = pad.drillOval ? Math.min(d, parseFloat(pad.drillOval) || d) : d;
  return { holeType: 'ROUND', width: kicadToEprj3(w), height: kicadToEprj3(h), cornerRadius: 0 };
}

function footprintPadRecord(pad, opts = {}) {
  const [x, y] = pad.at && pad.at.length >= 2 ? pad.at : [0, 0];
  const [w, h] = pad.size && pad.size.length >= 2 ? pad.size : [1, 1];
  const shape = PAD_SHAPE_MAP[pad.shape] || 'RECT';
  return {
    head: { type: 'PAD', ticket: opts.ticket, id: opts.id },
    body: {
      groupId: 0, netName: pad.netName || '', layerId: footprintPadLayerId(pad), num: pad.number || '',
      centerX: kicadToEprj3(parseFloat(x)), centerY: flipY(parseFloat(y)),
      padAngle: flipRot(pad.angle), hole: footprintPadHole(pad),
      defaultPad: { padType: shape, width: kicadToEprj3(parseFloat(w)), height: kicadToEprj3(parseFloat(h)), radius: 0 },
      specialPad: [],
      padOffsetX: 0, padOffsetY: 0,
      relativeAngle: 0,
      plated: (pad.type || 'smd') !== 'np_thru_hole',
      padType: 'NORMAL',
      topSolderExpansion: 2, bottomSolderExpansion: 2,
      topPasteExpansion: 0, bottomPasteExpansion: 0,
      connectMode: null, spokeSpace: null, spokeWidth: null, spokeAngle: null,
      unusedInnerLayers: [], padLen: 0, attrsMap: {}, propagationDelay: 0,
      locked: false, zIndex: opts.zIndex
    }
  };
}

function buildFootprintRecords(kicadFp, opts = {}) {
  const partId = 'pid' + randId();
  const records = [];
  const padIds = [];
  let ticket = 1;

  // BBOX from pads and silk shapes (mil, Y-up)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    if (!isFinite(x) || !isFinite(y)) return;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  for (const pad of kicadFp.pads) {
    const [px, py] = pad.at && pad.at.length >= 2 ? pad.at : [0, 0];
    const [w, h] = pad.size && pad.size.length >= 2 ? pad.size : [1, 1];
    add(kicadToEprj3(parseFloat(px)) - kicadToEprj3(parseFloat(w)), flipY(parseFloat(py)) - kicadToEprj3(parseFloat(h)));
    add(kicadToEprj3(parseFloat(px)) + kicadToEprj3(parseFloat(w)), flipY(parseFloat(py)) + kicadToEprj3(parseFloat(h)));
  }
  for (const sh of kicadFp.shapes) {
    if (sh.kind === 'fp_circle' && sh.r != null) {
      add(kicadToEprj3(sh.cx) - kicadToEprj3(sh.r), flipY(sh.cy) - kicadToEprj3(sh.r));
      add(kicadToEprj3(sh.cx) + kicadToEprj3(sh.r), flipY(sh.cy) + kicadToEprj3(sh.r));
    } else if (sh.kind === 'fp_arc' && sh.mx != null) {
      add(kicadToEprj3(sh.x1), flipY(sh.y1)); add(kicadToEprj3(sh.x2), flipY(sh.y2)); add(kicadToEprj3(sh.mx), flipY(sh.my));
    } else if (sh.pts) {
      for (const p of sh.pts) add(kicadToEprj3(p.x), flipY(p.y));
    } else {
      add(kicadToEprj3(sh.x1), flipY(sh.y1));
      add(kicadToEprj3(sh.x2), flipY(sh.y2));
    }
  }
  if (!isFinite(minX)) { minX = -100; minY = -100; maxX = 100; maxY = 100; }

  records.push({
    head: { type: 'CANVAS', ticket: ++ticket, id: 'CANVAS' },
    body: opts.canvasBody || { originX: 0, originY: 0 }
  });
  if (opts.includePart !== false) {
    records.push({
      head: { type: 'PART', ticket: ++ticket, id: partId },
      body: { BBOX: [minX, minY, maxX, maxY], title: '' }
    });
  }

  for (const sh of kicadFp.shapes) {
    ticket++;
    const lname = sh.layer || 'F.SilkS';
    // Fab/Courtyard/annotation graphics land on the Document layer (13)
    const layerId = /SilkS$/.test(lname) ? (/^B\./.test(lname) ? 4 : 3) : 13;
    const width = Math.max(1, Math.round(kicadToEprj3(parseFloat(sh.width) || 0.15)));
    if (sh.kind === 'fp_line') {
      records.push({
        head: { type: 'POLY', ticket, id: 'e' + randId() },
        body: {
          groupId: 0, netName: '', layerId, width,
          path: [kicadToEprj3(sh.x1), flipY(sh.y1), 'L', kicadToEprj3(sh.x2), flipY(sh.y2)],
          locked: false, zIndex: ticket, polyType: 'NORMAL'
        }
      });
    } else if (sh.kind === 'fp_rect') {
      const x1 = kicadToEprj3(sh.x1), y1 = flipY(sh.y1), x2 = kicadToEprj3(sh.x2), y2 = flipY(sh.y2);
      records.push({
        head: { type: 'POLY', ticket, id: 'e' + randId() },
        body: {
          groupId: 0, netName: '', layerId, width,
          path: [x1, y1, 'L', x2, y1, x2, y2, x1, y2, x1, y1],
          locked: false, zIndex: ticket, polyType: 'NORMAL'
        }
      });
    } else if (sh.kind === 'fp_poly' && sh.pts && sh.pts.length > 2) {
      const flat = [];
      for (const p of sh.pts) flat.push(kicadToEprj3(p.x), flipY(p.y));
      records.push({
        head: { type: 'POLY', ticket, id: 'e' + randId() },
        body: {
          groupId: 0, netName: '', layerId, width,
          path: [...flat, flat[0], flat[1]],
          locked: false, zIndex: ticket, polyType: 'NORMAL'
        }
      });
    } else if (sh.kind === 'fp_circle' && sh.r != null) {
      records.push({
        head: { type: 'POLY', ticket, id: 'e' + randId() },
        body: {
          groupId: 0, netName: '', layerId, width,
          path: [['CIRCLE', kicadToEprj3(sh.cx), flipY(sh.cy), kicadToEprj3(sh.r), 1]],
          locked: false, zIndex: ticket, polyType: 'NORMAL'
        }
      });
    } else if (sh.kind === 'fp_arc' && sh.mx != null) {
      // PCB ARC record: start/end + CCW-positive angle in eprj3 (Y-up) space.
      const x1 = kicadToEprj3(sh.x1), y1 = flipY(sh.y1);
      const mx = kicadToEprj3(sh.mx), my = flipY(sh.my);
      const x2 = kicadToEprj3(sh.x2), y2 = flipY(sh.y2);
      const { sweep } = arcSweep(x1, y1, mx, my, x2, y2);
      records.push({
        head: { type: 'ARC', ticket, id: 'e' + randId() },
        body: {
          groupId: 0, netName: '', layerId,
          startX: x1, startY: y1, endX: x2, endY: y2,
          angle: Math.round(sweep * 100) / 100, width,
          locked: false, zIndex: ticket
        }
      });
    }
  }

  for (const pad of kicadFp.pads) {
    ticket++;
    const padId = 'e' + randId();
    padIds.push({ num: pad.number || '', id: padId });
    records.push(footprintPadRecord(pad, { ticket, id: padId, zIndex: ticket }));
  }

  // Library-style ATTRs (official footprint docs carry Footprint/Designator placeholders)
  const fpAttr = (key, value) => {
    ticket++;
    records.push({
      head: { type: 'ATTR', ticket, id: 'e' + randId() },
      body: {
        groupId: 0, parentId: '', layerId: 3, x: null, y: null,
        key, value, keyVisible: false, valueVisible: false,
        fontFamily: 'default', fontSize: 67.5, strokeWidth: 6,
        bold: false, italic: false, origin: 'LEFT_BOTTOM',
        angle: 0, reverse: false, expansion: 0, mirror: false,
        locked: false, zIndex: ticket
      }
    });
  };
  fpAttr('Footprint', kicadFp.name || '');
  fpAttr('Designator', 'U?');
  if (kicadFp.value) fpAttr('Value', kicadFp.value);

  return { records, partId, pads: padIds };
}

module.exports = {
  buildSymbolRecords, buildFootprintRecords, footprintPadRecord,
  kicadToEprj3, flipY, kicadToSchUnit, schX, schY, flipYSch, flipRot, circumcenter, arcSweep,
  mapStroke, mapFill, PIN_ELECTRIC_MAP, PIN_TYPE_NAME, PIN_SHAPE_MAP
};