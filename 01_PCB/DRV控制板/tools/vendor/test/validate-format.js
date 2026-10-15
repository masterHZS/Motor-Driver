#!/usr/bin/env node
'use strict';
/**
 * validate-format.js — Validate generated eprj3/esch2/epcb2/elibu records
 *                      against the official JSON schemas from
 *                      easyeda-pro-format-skill (https://github.com/easyeda/easyeda-pro-format-skill).
 *
 * Usage:
 *   node test/validate-format.js <file-with-records> <sch|pcb> [more files...]
 *
 * The context (sch|pcb) selects the schema family: SCH_PAGE/SYMBOL docs use
 * the TSch* schemas, PCB/FOOTPRINT docs use the TPcb* ones. Records without
 * an official schema (NETLABEL, META, DEVICE...) are counted as skipped.
 */
const fs = require('fs');
const path = require('path');

const SKILL_DIR = process.env.EASYEDA_FORMAT_SKILL
  || path.resolve(__dirname, '../../easyeda-pro-format-skill');
let validateFormat;
try {
  ({ validateFormat } = require(path.join(SKILL_DIR, 'validate.js')));
} catch (e) {
  console.error(`skip: format skill not found at ${SKILL_DIR}`);
  process.exit(2);
}

const { readRecords } = require(path.join(__dirname, '..', 'scripts', 'lib', 'eprj3'));

const SCH_MAP = {
  CANVAS: 't-sch-canvas', PART: 't-part', PIN: 't-sch-pin', LINE: 't-sch-line',
  WIRE: 't-wire', BUS: 't-bus', BUSENTRY: 't-sch-bus-entry', CIRCLE: 't-sch-circle',
  RECT: 't-sch-rect', ARC: 't-sch-arc', BEZIER: 't-sch-bezier', TEXT: 't-sch-text',
  POLY: 't-sch-poly', OBJ: 't-sch-obj', COMPONENT: 't-sch-component', ATTR: 't-sch-attr',
  GROUP: 't-sch-group', TABLE: 't-sch-table', ELLIPSE: 't-sch-ellipse',
  MASK_REGION: 't-sch-mask-region', NG_SETTING: 'tng-setting'
};

const PCB_MAP = {
  CANVAS: 't-canvas', LAYER: 't-layer', ACTIVE_LAYER: 't-active-layer', NET: 't-net',
  PARTITION: 't-partition', GROUP: 't-pcb-group', VIA: 't-pcb-via', PAD: 't-pcb-pad',
  LINE: 't-pcb-line', ARC: 't-pcb-arc', OBJ: 't-pcb-obj', POLY: 't-pcb-poly',
  FILL: 't-pcb-fill', REGION: 't-pcb-region', POUR: 't-pcb-pour', POURED: 't-pcb-poured',
  IMAGE: 't-pcb-image', STRING: 't-pcb-string',
  COMPONENT: 't-pcb-component', PAD_NET: 't-pad-net', ATTR: 't-pcb-attr',
  BOARD: 't-pcb-board', PART: 't-part'
};
// DIMENSION is excluded: the official schema (type/coords/text/textFollow) does not
// match what the real app writes (dimensionType/controlDot/relationIds) — both the
// skill examples and exported real projects use the latter, which we follow.

// Known divergences where the real app output contradicts its own schema; we follow
// the app output, so loosen the record before validating.
function loosen(type, body) {
  const b = { ...body };
  if (typeof b.groupId === 'number') b.groupId = String(b.groupId); // app writes 0, schema says string
  if (type === 'STRING') {
    if (typeof b.bold === 'number') b.bold = !!b.bold;         // app writes 0/1
    if (typeof b.italic === 'number') b.italic = !!b.italic;
  }
  if (type === 'ATTR' && b.groupID != null) {                  // pcb ATTR uses "groupID" in real exports
    if (b.groupId == null) b.groupId = String(b.groupID);
    if (typeof b.bold === 'number') b.bold = !!b.bold;
    if (typeof b.italic === 'number') b.italic = !!b.italic;
    if (b.specialColor == null) b.specialColor = '';
  }
  if (type === 'ATTR' && typeof b.version === 'string') {
    // official v4 attrs carry version "2.0" as a string; the schema types it as object
    delete b.version;
  }
  if (type === 'ATTR' && b.groupId === undefined && b.parentId != null) {
    // sch link attrs (Symbol/Device/Unique ID) are written by the real app with
    // null position/style fields and without groupId/locked — fill schema-safe
    // stand-ins so the rest of the payload is still validated.
    if (b.groupId === undefined) b.groupId = '';
    if (b.locked === undefined) b.locked = false;
    if (b.keyVisible == null) b.keyVisible = false;
    if (b.valueVisible == null) b.valueVisible = false;
    if (b.rotation == null) b.rotation = 0;
    if (b.align == null) b.align = 'CENTER_MIDDLE';
  }
  if (type === 'CANVAS') {                                     // real PCB docs write a bare {originX,originY}
    return {
      unit: 'mm', gridXSize: 100, gridYSize: 100, snapXSize: 10, snapYSize: 10,
      altSnapXSize: 1, altSnapYSize: 1, gridType: 'GRID', multiGridType: 'GRID',
      multiGridRatio: 10, highlightValue: 10, layerBrightness: 'NORMAL', ...b
    };
  }
  if (type === 'PAD') {
    if (b.hole == null) b.hole = { holeType: 'ROUND', width: 0, height: 0 }; // "null 表示无孔" but type forbids null
    if (b.connectMode == null) b.connectMode = 'DIVERGENCE';
  }
  if (type === 'PAD_NET') {
    // the real app keeps componentId/padNum/padId in the head id array and
    // writes padLen/propagationDelay as null; the schema wants body fields/numbers
    if (b.componentId == null) b.componentId = '';
    if (b.padNum == null) b.padNum = '';
    if (b.padId == null) b.padId = '';
    if (b.padLen == null) b.padLen = 0;
    if (b.propagationDelay == null) b.propagationDelay = 0;
  }
  if (type === 'POUR' && b.pourType && typeof b.pourType.pourType === 'string') {
    b.pourType = { pourType: {} };                             // schema wants an object where the app writes 'SOLID'
  }
  if (type === 'PIN' && b.color == null) b.color = '';         // official exports write null; schema only allows ""
  if (type === 'WIRE' || type === 'BUS') {
    // real exports write the wire body as {zIndex} only; the id lives in the head
    if (b.groupId == null) b.groupId = '';
    if (b.locked == null) b.locked = false;
  }
  if (type === 'ATTR') {
    // real exports write null for keyVisible/valueVisible/align on binding and
    // power-flag attrs; schema types them as boolean/string
    if (b.keyVisible == null) b.keyVisible = false;
    if (b.valueVisible == null) b.valueVisible = false;
    if (b.align == null) b.align = 'LEFT_BOTTOM';
    if (b.rotation == null) b.rotation = 0;
    // real exports omit the four text-style booleans and write null values on
    // system attrs; schema requires the keys and a string value
    if (b.strikeout == null) b.strikeout = null;
    if (b.underline == null) b.underline = null;
    if (b.italic == null) b.italic = null;
    if (b.fontWeight == null) b.fontWeight = null;
    if (b.value == null) b.value = '';
  }
  return b;
}

function main() {
  const args = process.argv.slice(2);
  const files = [];
  for (let i = 0; i < args.length; i += 2) files.push({ file: args[i], ctx: args[i + 1] || 'sch' });
  if (!files.length) {
    console.error('usage: node validate-format.js <file> <sch|pcb|lib> [...]');
    process.exit(1);
  }

  let ok = 0, bad = 0, skipped = 0;
  const failures = new Map();
  for (const { file, ctx } of files) {
    if (!fs.existsSync(file)) { console.error(`missing: ${file}`); process.exit(1); }
    let fixedMap, docType = null;
    if (ctx === 'pcb') fixedMap = PCB_MAP;
    else if (ctx === 'sch') fixedMap = SCH_MAP;
    else fixedMap = null; // lib: route each doc's records by its DOCHEAD docType
    for (const rec of readRecords(file)) {
      let map = fixedMap;
      if (!map) {
        if (rec.type === 'DOCHEAD') docType = rec.body.docType;
        map = docType === 'SYMBOL' ? SCH_MAP : docType === 'FOOTPRINT' ? PCB_MAP : null;
        if (!map) { skipped++; continue; }
      }
      const schemaKey = map[rec.type];
      if (!schemaKey) { skipped++; continue; }
      const r = validateFormat(schemaKey, loosen(rec.type, rec.body));
      if (r.valid) { ok++; continue; }
      bad++;
      for (const err of r.errors) {
        const key = `${file.split(/[\\/]/).pop()} ${rec.type}.${err.field}: ${err.message}`;
        if (!failures.has(key)) failures.set(key, { count: 0, sample: JSON.stringify(rec.body).slice(0, 400) });
        failures.get(key).count++;
      }
    }
  }

  console.log(`\nvalidated ${ok + bad} records: ${ok} valid, ${bad} invalid, ${skipped} skipped (no schema)`);
  if (failures.size) {
    console.log(`\n${failures.size} distinct failures:`);
    for (const [key, { count, sample }] of failures) {
      console.log(`\n[×${count}] ${key}\n    sample: ${sample}`);
    }
    process.exit(1);
  }
}

main();
