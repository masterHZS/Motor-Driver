#!/usr/bin/env node
'use strict';
/**
 * smoke.js — End-to-end regression test for the KiCad → eprj3 converter.
 *
 * Runs the real scripts against a throwaway directory in the OS temp dir and
 * asserts the invariants that have historically regressed:
 *   - KiCad symbol parser handles nested unit symbols (pins/shapes merged)
 *   - converter maps layer names to the right layer ids (B.Cu → 2)
 *   - PCB doc defines the official 60-layer stack with layerId fields
 *   - uuid linkage: page/pcb/ecfg DOCHEAD uuids equal the index profile uuids
 *   - schematic embeds SYMBOL + DEVICE docs; COMPONENT partId/DeviceName link to them
 *   - pcb embeds FOOTPRINT + DEVICE docs, COMPONENT placements, PAD_NET/NET records
 *   - Edge.Cuts becomes a POLY BOARD_OUTLINE on layer 11
 *   - track segments become LINE records, track arcs become ARC records
 *   - schematic primitives: bus/bus_entry/junction/no_connect/labels/text/shapes
 *   - pcb primitives: via/track-arc/gr_arc/gr_circle/gr_poly/gr_text/zone/dimension
 *   - library dir → elibz2: device2.json + <name>.elibu with linked uuids
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const { readRecords } = require(path.join(SCRIPTS, 'lib', 'eprj3'));
const { kicadToEprj3, kicadToSchUnit, flipYSch } = require(path.join(SCRIPTS, 'lib', 'kicad-to-eprj3'));

let failures = 0;
let checks = 0;
function assert(cond, name, detail = '') {
  checks++;
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ''}`); }
}

function run(args, expectCode = 0) {
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT });
  if (expectCode !== null && r.status !== expectCode) {
    assert(false, `node ${path.basename(args[0])} ${args.slice(1, 3).join(' ')}`,
      `exit ${r.status} (expected ${expectCode})\n${(r.stdout || '') + (r.stderr || '')}`.trim());
  }
  return r;
}

const kicadSymSample = `(kicad_symbol_lib (version 20220914) (generator kicad_symbol_editor)
  (symbol "MY_RES" (pin_numbers hide) (pin_names (offset 0) hide) (in_bom yes) (on_board yes)
    (property "Reference" "R" (at 2.032 0 90) (effects (font (size 1.27 1.27))))
    (property "Value" "MY_RES" (at 0 0 90) (effects (font (size 1.27 1.27))))
    (property "Footprint" "MY_FP:R_0805" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (symbol "MY_RES_0_1"
      (rectangle (start -1.016 -2.54) (end 1.016 2.54) (stroke (width 0.254) (type default)) (fill (type none)))
    )
    (symbol "MY_RES_1_1"
      (pin passive line (at 0 3.81 270) (length 1.27) (name "~") (number "1"))
      (pin passive line (at 0 -3.81 90) (length 1.27) (name "~") (number "2"))
    )
  )
)`;

const kicadSchSample = `(kicad_sch (version 20230121) (generator eeschema)
  (lib_symbols
    (symbol "Device:R" (pin_numbers hide)
      (property "Reference" "R" (at 2 0 90) (effects (font (size 1.27 1.27))))
      (symbol "Device:R_0_1"
        (rectangle (start -1 -2.5) (end 1 2.5) (stroke (width 0.25) (type default)) (fill (type none)))
      )
      (symbol "Device:R_1_1"
        (pin passive line (at 0 3.81 270) (length 1.27) (name "~") (number "1"))
        (pin passive line (at 0 -3.81 90) (length 1.27) (name "~") (number "2"))
      )
    )
  )
  (wire (pts (xy 10 10) (xy 20 10)))
  (bus (pts (xy 10 20) (xy 20 20)))
  (bus_entry (at 10 20) (size 2.54 2.54) (stroke (width 0) (type default)))
  (junction (at 15 10) (diameter 0) (color 0 0 0 0))
  (no_connect (at 25 10) (uuid x))
  (label "NET1" (at 10 10 0) (effects (font (size 1.27 1.27))))
  (global_label "GLOB" (at 20 30 0) (effects (font (size 1.27 1.27))))
  (text "hello" (at 40 40 0) (effects (font (size 2 2))))
  (rectangle (start 50 10) (end 60 20) (stroke (width 0.25) (type solid)) (fill none))
  (circle (center 65 15) (radius 2) (stroke (width 0.25) (type solid)) (fill none))
  (arc (start 70 10) (mid 72.5 12.5) (end 75 10) (stroke (width 0.25) (type solid)) (fill none))
  (symbol (lib_id "Device:R") (at 30 50 0) (unit 1)
    (property "Reference" "R1" (at 30 48 0) (effects (font (size 1.27 1.27))))
    (property "Value" "10k" (at 30 52 0) (effects (font (size 1.27 1.27))))
  )
)`;

const kicadPcbSample = `(kicad_pcb (version 20221018) (generator pcbnew)
  (net 0 "")
  (net 1 "GND")
  (net 2 "VCC")
  (segment (start 0 0) (end 10 0) (width 0.25) (layer "B.Cu") (net 1))
  (arc (start 10 0) (mid 12.5 2.5) (end 15 0) (width 0.25) (layer "B.Cu") (net 1))
  (via (at 15 0) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1))
  (gr_rect (start 0 0) (end 40 30) (stroke (width 0.05) (type solid)) (fill none) (layer "Edge.Cuts"))
  (gr_circle (center 20 25) (end 22 25) (stroke (width 0.15) (type solid)) (fill none) (layer "F.SilkS"))
  (gr_arc (start 30 25) (mid 32.5 22.5) (end 35 25) (stroke (width 0.15) (type solid)) (fill none) (layer "F.SilkS"))
  (gr_poly (pts (xy 0 25) (xy 5 25) (xy 5 30)) (stroke (width 0.15) (type solid)) (fill none) (layer "F.SilkS"))
  (gr_text "board" (at 10 35 0) (layer "F.SilkS") (effects (font (size 1.2 1.2) (thickness 0.2))))
  (dimension (type aligned) (layer "Cmts.User") (pts (xy 0 0) (xy 40 0)) (height 5)
    (gr_text "40 mm" (at 20 -2 0)) (style (thickness 0.2)))
  (zone (net 2) (net_name "VCC") (layer "F.Cu") (name "zone1") (min_thickness 0.2)
    (polygon (pts (xy 0 0) (xy 40 0) (xy 40 30) (xy 0 30)))
    (filled_polygon (layer "F.Cu") (pts (xy 0.5 0.5) (xy 39.5 0.5) (xy 39.5 29.5) (xy 0.5 29.5))))
  (footprint "R_0603" (layer "F.Cu") (at 5 5)
    (property "Reference" "R1" (at 5 4 0) (layer "F.SilkS"))
    (pad "1" smd rect (at -0.75 0) (size 0.8 0.8) (layers "F.Cu" "F.Paste" "F.Mask") (net 1 "GND"))
    (fp_line (start -1.5 -0.8) (end 1.5 -0.8) (stroke (width 0.1) (type solid)) (layer "F.SilkS"))
  )
)`;

const kicadFpSample = `(footprint "R_0805" (layer "F.Cu")
  (at 0 0)
  (attr smd)
  (fp_text reference "REF**" (at 0 -1.43 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
  (fp_line (start -1 -0.6) (end 1 -0.6) (stroke (width 0.1) (type solid)) (layer "F.SilkS"))
  (pad "1" smd rect (at -0.9 0) (size 0.8 0.8) (layers "F.Cu" "F.Paste" "F.Mask"))
  (pad "2" smd rect (at 0.9 0) (size 0.8 0.8) (layers "F.Cu" "F.Paste" "F.Mask"))
)`;

function docSegments(records) {
  // Split a record list into doc segments at DOCHEAD boundaries
  const docs = [];
  let cur = null;
  for (const r of records) {
    if (r.type === 'DOCHEAD') { cur = { head: r, records: [] }; docs.push(cur); }
    else if (cur) cur.records.push(r);
  }
  return docs;
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad2eprj3-smoke-'));

  try {
    fs.writeFileSync(path.join(tmp, 'sample.kicad_sym'), kicadSymSample);
    fs.writeFileSync(path.join(tmp, 'sample.kicad_sch'), kicadSchSample);
    fs.writeFileSync(path.join(tmp, 'sample.kicad_pcb'), kicadPcbSample);

    // ---- project conversion (batch: walks every .kicad_sch / .kicad_pcb) ----
    const dst = path.join(tmp, 'conv');
    run([SCRIPTS + '/convert-kicad.js', 'convert', tmp, dst, '--project-name', 'conv']);
    assert(fs.existsSync(path.join(dst, 'conv.eprj3')), 'convert-kicad creates the project index');

    const index = JSON.parse(fs.readFileSync(path.join(dst, 'conv.eprj3'), 'utf8'));
    const boards = Object.values(index.profile.boards);
    const schEntry = Object.values(index.profile.schematics)[0];
    const sheetEntry = Object.values(index.profile.sheets)[0];
    const pcbEntry = Object.values(index.profile.pcbs)[0];
    assert(boards.length === 1 && boards[0].uuid.length === 16, 'one board with a 16-hex uuid');
    assert(index.owner_uuid.length === 32, 'owner uuid is 32 hex (official length)');

    // ---- schematic side ----
    assert(fs.existsSync(path.join(dst, 'sch', 'Schematic1', 'Schematic1.ecfg')), 'convert-kicad writes the schematic .ecfg');
    assert(fs.existsSync(path.join(dst, 'sch', 'Schematic1', 'Schematic1.evar')), 'convert-kicad writes the schematic .evar');
    const ecfg = readRecords(path.join(dst, 'sch', 'Schematic1', 'Schematic1.ecfg'));
    const ecfgHead = ecfg.find(r => r.type === 'DOCHEAD');
    assert(ecfgHead && ecfgHead.body.docType === 'SCH' && ecfgHead.body.uuid === schEntry.uuid,
      '.ecfg is a SCH doc whose uuid equals the index schematic uuid');

    const convSch = readRecords(path.join(dst, 'sch', 'Schematic1', 'P1.esch2'));
    const schDocs = docSegments(convSch);
    const pageDoc = schDocs[schDocs.length - 1];
    const symDocs = schDocs.filter(d => d.head.body.docType === 'SYMBOL');
    const devDocs = schDocs.filter(d => d.head.body.docType === 'DEVICE');
    assert(pageDoc && pageDoc.head.body.docType === 'SCH_PAGE', 'last .esch2 segment is a SCH_PAGE doc');
    assert(pageDoc.head.body.uuid === sheetEntry.uuid, 'page DOCHEAD uuid equals the index sheet uuid');
    const pageMeta = pageDoc.records.find(r => r.type === 'META');
    assert(pageMeta && pageMeta.body.title === 'P1' && pageMeta.body.schematic === schEntry.uuid && pageMeta.body.zIndex === 1,
      'page META links title/schematic/zIndex per the official format');
    // frame docs (docType 20) + one SYMBOL/DEVICE pair per used lib_id
    const symMeta = d => { const m = d.records.find(r => r.type === 'META'); return m ? m.body.docType : null; };
    const partDocs = schDocs.filter(d => d.head.body.docType === 'SYMBOL' && symMeta(d) === 2);
    const devDocsAll = schDocs.filter(d => d.head.body.docType === 'DEVICE');
    const frameDoc = schDocs.find(d => d.head.body.docType === 'SYMBOL' && symMeta(d) === 20);
    assert(frameDoc && partDocs.length === 1 && devDocsAll.length === 2,
      '.esch2 embeds the A4 frame doc plus one SYMBOL and one DEVICE doc');
    const symDoc = partDocs[0];
    const symPart = symDoc.records.find(r => r.type === 'PART');
    const comp = pageDoc.records.find(r => r.type === 'COMPONENT' && r.body.partId === symPart.head.id);
    assert(comp && symPart && comp.body.partId === symPart.head.id, 'COMPONENT.partId references the embedded PART id');
    const devName = comp && JSON.parse(comp.body.attrs.DeviceName);
    const devHead = devDocsAll[0] && devDocsAll[0].head;
    assert(devName && devHead && devDocsAll.some(d => d.head.body.uuid === devName.uuid),
      'COMPONENT DeviceName uuid references the embedded DEVICE doc');
    assert(typeof comp.body.zIndex === 'number', 'COMPONENT carries a numeric zIndex (official exports)');
    const symAttr = pageDoc.records.find(r => r.type === 'ATTR' && r.body.key === 'Symbol' && r.body.parentId === comp.head.id);
    const devAttr = pageDoc.records.find(r => r.type === 'ATTR' && r.body.key === 'Device' && r.body.parentId === comp.head.id);
    assert(symAttr && symAttr.body.value === symDoc.head.body.uuid, 'COMPONENT Symbol ATTR references the SYMBOL doc uuid');
    assert(devAttr && devAttr.body.value === devName.uuid, 'COMPONENT Device ATTR references the DEVICE doc uuid');
    assert(!(comp.body.id), 'COMPONENT body carries no duplicate id field');
    assert(convSch.some(r => r.type === 'ATTR' && r.body.key === 'Designator' && r.body.value === 'R1')
        && convSch.some(r => r.type === 'ATTR' && r.body.key === 'Name' && r.body.value === '10k'),
      'convert-kicad emits Designator/Name ATTRs linked to the component');
    const frameComp = pageDoc.records.find(r => r.type === 'COMPONENT' && r.body.zIndex === null);
    const pageAttrs = pageDoc.records.filter(r => r.type === 'ATTR');
    assert(pageAttrs.every(r => r.body.parentId === comp.head.id || (frameComp && r.body.parentId === frameComp.head.id)),
      'every page ATTR.parentId == COMPONENT id (frame attrs belong to the frame COMPONENT)');
    const wireRec = pageDoc.records.find(r => r.type === 'WIRE');
    assert(pageDoc.records.some(r => r.type === 'LINE' && r.body.lineGroup)
      && wireRec && pageDoc.records.some(r => r.type === 'LINE' && r.body.lineGroup === wireRec.head.id),
      'WIRE head.id equals the LINE children lineGroup (official grouping)');
    assert(pageDoc.records.some(r => r.type === 'LINE' && r.body.startY < 0), 'page items map into the frame area (y <= 0)');
    // symbol geometry: sch units, Y negated (KiCad lib Y-up → eprj3 records Y-down), identity pin rotation
    const pinDown = symDoc.records.filter(r => r.type === 'PIN');
    const pinAtTop = pinDown.find(p => Math.abs(p.body.y + kicadToSchUnit(3.81)) < 0.01);
    assert(!!pinAtTop && pinAtTop.body.rotation === 270 && Math.abs(pinAtTop.body.length - kicadToSchUnit(1.27)) < 0.01
      && pinAtTop.body.display === true,
      'PIN flips y into the Y-down record space, keeps rotation, carries display:true',
      JSON.stringify(pinDown.map(p => ({ y: p.body.y, rot: p.body.rotation }))));
    const pinTypeAttr = symDoc.records.find(r => r.type === 'ATTR' && r.body.key === 'Pin Type');
    assert(!!pinTypeAttr && pinTypeAttr.body.value === 'Undefined' && pinTypeAttr.body.x === null,
      'Pin Type ATTR carries the electric type with null position (official shape)');
    const compAttr = pageDoc.records.find(r => r.type === 'ATTR' && r.body.key === 'Designator' && r.body.parentId === comp.head.id);
    assert(compAttr && Math.abs(compAttr.body.y - (kicadToSchUnit(48) - 825)) < 0.01
      && Math.abs(compAttr.body.x - kicadToSchUnit(30)) < 0.01,
      'Designator ATTR sits at the KiCad property position on the shifted page frame');
    const nameAttr = pageDoc.records.find(r => r.type === 'ATTR' && r.body.key === 'Name' && r.body.parentId === comp.head.id);
    assert(nameAttr && Math.abs(nameAttr.body.y - (kicadToSchUnit(52) - 825)) < 0.01,
      'Name ATTR sits at the KiCad Value property position');

    // ---- pcb side ----
    const convPcb = readRecords(path.join(dst, 'pcb', 'PCB1.epcb2'));
    const pcbDocs = docSegments(convPcb);
    const pcbDoc = pcbDocs[pcbDocs.length - 1];
    assert(pcbDoc.head.body.docType === 'PCB' && pcbDoc.head.body.uuid === pcbEntry.uuid,
      'PCB DOCHEAD uuid equals the index pcb uuid');
    const pcbMeta = pcbDoc.records.find(r => r.type === 'META');
    assert(pcbMeta && pcbMeta.body.title === 'PCB1' && pcbMeta.body.board === boards[0].uuid && pcbMeta.body.parent === '',
      'PCB META links title/board/parent per the official format');
    const layers = pcbDoc.records.filter(r => r.type === 'LAYER');
    assert(layers.length === 60, 'PCB doc defines the official 60-layer stack', `layers=${layers.length}`);
    assert(layers.every(r => r.body.layerId !== undefined), 'LAYER payloads carry layerId');
    const outline = pcbDoc.records.find(r => r.type === 'POLY' && r.body.polyType === 'BOARD_OUTLINE');
    assert(outline && outline.body.layerId === 11, 'Edge.Cuts becomes a BOARD_OUTLINE POLY on layer 11');
    const track = pcbDoc.records.find(r => r.type === 'LINE');
    assert(track && track.body.layerId === 2 && track.body.netName === 'GND', 'B.Cu segments become LINE tracks on layerId 2 with net name');
    assert(track && Math.abs(track.body.width - kicadToEprj3(0.25)) < 0.01, 'track keeps the KiCad wire width');
    assert(!pcbDoc.records.some(r => r.type === 'FILL'), 'tracks are not emitted as FILL fill regions');

    const fpDocs = pcbDocs.filter(d => d.head.body.docType === 'FOOTPRINT');
    const pcbDevDocs = pcbDocs.filter(d => d.head.body.docType === 'DEVICE');
    assert(fpDocs.length === 1 && pcbDevDocs.length === 1, '.epcb2 embeds FOOTPRINT and DEVICE docs');
    assert(convPcb.some(r => r.type === 'PAD' && r.body.num === '1'), 'footprint doc contains pads');
    const pcbComp = pcbDoc.records.find(r => r.type === 'COMPONENT');
    assert(pcbComp && pcbComp.body.layerId === 1, 'PCB COMPONENT placements reference a copper layer');
    const pcbDevName = pcbComp && JSON.parse(pcbComp.body.attrs.DeviceName);
    assert(pcbDevName && pcbDevName.uuid === pcbDevDocs[0].head.body.uuid, 'PCB COMPONENT DeviceName references the DEVICE doc');
    const padNet = pcbDoc.records.find(r => r.type === 'PAD_NET');
    assert(padNet && padNet.head.id.includes(pcbComp.head.id) && padNet.head.id.includes('"1"') && padNet.body.padNet === 'GND',
      'PAD_NET links component pad to its net');
    assert(pcbDoc.records.some(r => r.type === 'NET' && r.head.id === JSON.stringify(['NET','GND'])), 'NET index record exists for used nets');
    const desig = pcbDoc.records.find(r => r.type === 'ATTR' && r.body.key === 'Designator');
    assert(desig && desig.body.value === 'R1' && desig.body.parentId === pcbComp.head.id, 'PCB Designator ATTR linked to COMPONENT');

    // ---- schematic primitives (new coverage) ----
    const busEntry = pageDoc.records.find(r => r.type === 'BUSENTRY');
    assert(!!busEntry && busEntry.body.rotation % 90 === 0, 'bus_entry becomes a BUSENTRY with 90° rotation');
    assert(pageDoc.records.some(r => r.type === 'BUS'), 'bus becomes a BUS record');
    const junction = pageDoc.records.find(r => r.type === 'CIRCLE' && r.body.fillStyle === 'SOLID');
    assert(!!junction && junction.body.radius > 0, 'junction becomes a filled CIRCLE dot');
    const ncLines = pageDoc.records.filter(r => r.type === 'LINE' && r.body.strokeWidth === 1);
    assert(ncLines.length === 2 && ncLines[0].body.lineGroup && ncLines[0].body.lineGroup === ncLines[1].body.lineGroup,
      'no_connect becomes two LINE records sharing a group id');
    assert(pageDoc.records.some(r => r.type === 'NETLABEL' && r.body.value === 'GLOB'), 'global_label becomes a NETLABEL');
    const txt = pageDoc.records.find(r => r.type === 'TEXT' && r.body.value === 'hello');
    assert(txt && Math.abs(txt.body.x - kicadToSchUnit(40)) < 0.01 && txt.body.y < 0 && txt.body.fontSize === 7.87,
      'text becomes a TEXT record in flipped 0.254 mm units (2 mm font = 7.87 units)');
    const pageRect = pageDoc.records.find(r => r.type === 'RECT' && Math.abs(r.body.dotX1 - kicadToSchUnit(50)) < 0.01);
    assert(!!pageRect, 'page rectangle becomes a RECT');
    const pageCircle = pageDoc.records.find(r => r.type === 'CIRCLE' && Math.abs(r.body.radius - kicadToSchUnit(2)) < 0.01);
    assert(!!pageCircle, 'page circle becomes a CIRCLE');
    const pageArc = pageDoc.records.find(r => r.type === 'ARC');
    assert(!!pageArc && pageArc.body.referX != null, 'page arc becomes an ARC with a reference center');

    // ---- pcb primitives (new coverage) ----
    const via = pcbDoc.records.find(r => r.type === 'VIA');
    assert(via && Math.abs(via.body.viaDiameter - kicadToEprj3(0.8)) < 0.01 && Math.abs(via.body.holeDiameter - kicadToEprj3(0.4)) < 0.01,
      'via becomes a VIA with via/hole diameters');
    const arcTrack = pcbDoc.records.find(r => r.type === 'ARC' && r.body.layerId === 2);
    assert(!!arcTrack && arcTrack.body.netName === 'GND' && typeof arcTrack.body.angle === 'number',
      'track arc becomes an ARC record with a sweep angle');
    const grArc = pcbDoc.records.find(r => r.type === 'ARC' && r.body.layerId === 3);
    assert(!!grArc, 'gr_arc becomes an ARC on the silkscreen layer');
    const grCircle = pcbDoc.records.find(r => r.type === 'POLY' && Array.isArray(r.body.path[0]) && r.body.path[0][0] === 'CIRCLE');
    assert(!!grCircle && grCircle.body.layerId === 3, 'gr_circle becomes a POLY with a CIRCLE path');
    const grPoly = pcbDoc.records.find(r => r.type === 'POLY' && r.body.polyType === 'NORMAL' && !Array.isArray(r.body.path[0]));
    assert(!!grPoly && grPoly.body.layerId === 3, 'gr_poly becomes a closed NORMAL POLY');
    const str = pcbDoc.records.find(r => r.type === 'STRING' && r.body.text === 'board');
    assert(!!str && str.body.layerId === 3, 'gr_text becomes a STRING record');
    const dim = pcbDoc.records.find(r => r.type === 'DIMENSION');
    assert(dim && dim.body.dimensionType === 'LENGTH-CONSTRAINT' && dim.body.controlDot.length === 8, 'dimension becomes a LENGTH-CONSTRAINT DIMENSION');
    const pour = pcbDoc.records.find(r => r.type === 'POUR');
    const poured = pcbDoc.records.find(r => r.type === 'POURED');
    assert(pour && pour.body.netName === 'VCC' && pour.body.layerId === 1, 'zone becomes a POUR on F.Cu with its net');
    assert(poured && pour && poured.head.id === JSON.stringify(['POURED', pour.head.id]) && poured.body.pourFill.length >= 1,
      'filled_polygon becomes a POURED linked to the POUR');
    assert(pcbDoc.records.some(r => r.type === 'NET' && r.head.id === JSON.stringify(['NET','VCC'])), 'NET index record exists for zone net');

    // ---- KiCad library dir → elibz2 package ----
    const libDir = path.join(tmp, 'libsrc');
    fs.mkdirSync(path.join(libDir, 'MY_FP.pretty'), { recursive: true });
    fs.writeFileSync(path.join(libDir, 'MY_LIB.kicad_sym'), kicadSymSample);
    fs.writeFileSync(path.join(libDir, 'MY_FP.pretty', 'R_0805.kicad_mod'), kicadFpSample);
    const elibzPath = path.join(tmp, 'MYLIB.elibz2');
    run([SCRIPTS + '/convert-kicad-lib.js', 'convert', libDir, elibzPath, '--name', 'MYLIB']);

    const { readZip } = require(path.join(SCRIPTS, 'lib', 'zip'));
    const zipEntries = readZip(fs.readFileSync(elibzPath));
    assert(zipEntries.some(e => e.name === 'device2.json'), 'elibz2 contains device2.json');
    const elibuEntry = zipEntries.find(e => e.name === 'MYLIB.elibu');
    assert(!!elibuEntry, 'elibz2 contains <name>.elibu');

    const device2 = JSON.parse(zipEntries.find(e => e.name === 'device2.json').data.toString('utf8'));
    const symUuids = Object.keys(device2.symbols);
    const fpUuids = Object.keys(device2.footprints);
    assert(symUuids.length === 1 && fpUuids.length === 1, 'device2 indexes one symbol and one footprint');
    assert(device2.symbols[symUuids[0]].docType === 2 && device2.footprints[fpUuids[0]].docType === 4,
      'index docTypes: symbol 2 / footprint 4');
    const devUuids = Object.keys(device2.devices);
    const dev = device2.devices[devUuids[0]];
    assert(dev && dev.attributes.Symbol === symUuids[0] && dev.attributes.Footprint === fpUuids[0],
      'device attributes link the symbol + footprint (via the KiCad Footprint property)');
    assert(dev && dev.attributes.Designator === 'R?', 'device Designator derives from the Reference property');

    const elibuFile = path.join(tmp, 'MYLIB.elibu');
    fs.writeFileSync(elibuFile, elibuEntry.data);
    const elibu = readRecords(elibuFile);
    const elibuDocs = docSegments(elibu);
    // each library doc is written as two segments (DOCHEAD+META, DOCHEAD+records);
    // merge segments that share the same doc uuid
    const elibuByUuid = {};
    for (const d of elibuDocs) {
      const u = d.head.body.uuid;
      if (!elibuByUuid[u]) elibuByUuid[u] = { head: d.head, records: [] };
      elibuByUuid[u].records.push(...d.records);
    }
    const libSymDoc = elibuByUuid[symUuids[0]];
    const libFpDoc = elibuByUuid[fpUuids[0]];
    assert(!!libSymDoc && libSymDoc.head.body.uuid === symUuids[0], 'elibu SYMBOL doc uuid matches the device2 index');
    assert(libSymDoc && libSymDoc.records.some(r => r.type === 'PIN'), 'library symbol doc contains PIN records');
    assert(libSymDoc && libSymDoc.records.some(r => r.type === 'META' && r.body.docType === 2), 'symbol META carries docType 2');
    assert(!!libFpDoc && libFpDoc.head.body.uuid === fpUuids[0], 'elibu FOOTPRINT doc uuid matches the device2 index');
    assert(libFpDoc && libFpDoc.records.filter(r => r.type === 'LAYER').length === 19, 'footprint doc defines the 19-layer table');
    assert(libFpDoc && libFpDoc.records.some(r => r.type === 'PAD' && r.body.num === '1'), 'footprint doc contains pads');
    assert(libFpDoc && !libFpDoc.records.some(r => r.type === 'PART'), 'library footprint docs carry no PART record');

    // ---- parser (nested unit symbols) ----
    const { parseSymbolFile } = require(path.join(SCRIPTS, 'lib', 'kicad'));
    const syms = parseSymbolFile(path.join(tmp, 'sample.kicad_sym'));
    const myRes = syms.find(s => s.name === 'MY_RES');
    assert(!!myRes, 'kicad parser finds the top-level symbol');
    assert(myRes && myRes.pins.length === 2, 'kicad parser merges pins from nested unit symbols', `pins=${myRes && myRes.pins.length}`);
    assert(myRes && myRes.shapes.length === 1, 'kicad parser merges shapes from nested unit symbols');
    assert(myRes && myRes.properties.Value === 'MY_RES', 'kicad parser reads properties');

    // ---- unit conversion ----
    assert(Math.abs(kicadToEprj3(1) - 39.3700787) < 1e-6, 'kicadToEprj3 converts mm to mil (39.37)');
    assert(Math.abs(kicadToSchUnit(1) - 3.937007874015748) < 1e-9, 'kicadToSchUnit converts mm to 0.254 mm sch units');
    assert(kicadToSchUnit(0.254) === 1 && Math.abs(kicadToSchUnit(297.18) - 1170) < 1e-6,
      'one sch unit = 0.254 mm exactly (A4 page = 1170 units)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures) process.exit(1);
}

main();
