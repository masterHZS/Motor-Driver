'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- id generation ----
function uuid(len = 16) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}
function randId() {
  return crypto.randomBytes(8).toString('hex');
}

// ---- record parser/writer ----
// A record is:
//   {"type":"...",...}||{body}|
// Some files use three segments: head||{ticket-id}||{body}|. Both are normalized.
// The body is always valid JSON as a whole, so an '||' inside a JSON string can
// only produce fragments that fail JSON.parse — rejoin those instead of
// treating the middle segment as a ticket block (which would silently empty
// the body).
function parseRecord(line) {
  const parts = line.split('||');
  if (parts.length < 2) return null;
  let head, body;
  try { head = JSON.parse(parts[0]); } catch { return null; }
  if (!head || typeof head !== 'object' || !head.type) return null;
  let bodySrc;
  if (parts.length === 2) {
    bodySrc = parts[1];
  } else {
    let mid = null;
    try { mid = JSON.parse(parts[1]); } catch {}
    if (mid && typeof mid === 'object' && (mid.ticket !== undefined || mid.id !== undefined)) {
      // type|ticket-id|body — merge ticket/id into head, rest is the body
      if (mid.ticket !== undefined && head.ticket === undefined) head.ticket = mid.ticket;
      if (mid.id !== undefined && head.id === undefined) head.id = mid.id;
      bodySrc = parts.slice(2).join('||');
    } else {
      bodySrc = parts.slice(1).join('||');
    }
  }
  // JSON bodies never end with a literal '|', so this only strips the delimiter
  bodySrc = bodySrc.replace(/\|+\s*$/, '');
  if (!bodySrc.trim()) {
    body = {};
  } else {
    try { body = JSON.parse(bodySrc); }
    catch { body = {}; }
  }
  return { head, body, ticket: head.ticket, id: head.id, type: head.type };
}

function readRecords(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const records = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const r = parseRecord(line);
    if (r) records.push(r);
  }
  return records;
}

function formatRecord(head, body) {
  // body null emits an empty payload ("|||"), as the official writer does for
  // index-only records like NET.
  return JSON.stringify(head) + '||' + (body === null ? '' : JSON.stringify(body)) + '|';
}

function writeRecords(filePath, records) {
  const text = records.map(r => formatRecord(r.head, r.body)).join('\n') + '\n';
  fs.writeFileSync(filePath, text, 'utf8');
}

// ---- project model ----
class Project {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.name = path.basename(rootDir);
    this.indexFile = path.join(rootDir, `${this.name}.eprj3`);
    this.profile = null;
    this.tickets = new Map();
  }

  static async load(rootDir) {
    const p = new Project(rootDir);
    if (!fs.existsSync(p.indexFile)) throw new Error(`Project index not found: ${p.indexFile}`);
    p.profile = JSON.parse(fs.readFileSync(p.indexFile, 'utf8'));
    return p;
  }

  static async create(rootDir, name) {
    const finalName = name || path.basename(rootDir);
    const existingIndex = path.join(rootDir, `${finalName}.eprj3`);
    if (fs.existsSync(existingIndex)) {
      throw new Error(`Project index already exists: ${existingIndex}. Pick another --dir/--name or remove it first.`);
    }
    if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
    const p = new Project(rootDir);
    p.name = finalName;
    p.indexFile = path.join(rootDir, `${finalName}.eprj3`);
    const now = Date.now();
    const owner = uuid(32);
    p.profile = {
      name: finalName,
      owner_uuid: owner,
      creator_uuid: owner,
      created_at: formatDate(now),
      updated_at: formatDate(now),
      modifier_uuid: owner,
      content: '',
      archive: false,
      cbb_project: 0,
      thumb: '',
      ticket: 1,
      g_ticket: 1,
      boards: [],
      block_symbol_attrs_groups: {},
      default_sheet: '',
      branch_uuid: '',
      pcb_count: 0,
      format: 'folder',
      profile: {
        boards: {},
        schematics: {},
        sheets: {},
        pcbs: {},
        panels: {},
        blockSymbols: {},
        owner: { uuid: owner },
        simSchematics: {},
        simulations: {}
      },
      config: { defaultSheet: '', settings: {} }
    };
    fs.writeFileSync(p.indexFile, JSON.stringify(p.profile, null, 2));
    fs.mkdirSync(path.join(rootDir, 'sch'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'pcb'), { recursive: true });
    return p;
  }

  save() {
    this.profile.updated_at = formatDate(Date.now());
    fs.writeFileSync(this.indexFile, JSON.stringify(this.profile, null, 2));
  }

  ensureSchematic(name) {
    let sch = Object.values(this.profile.profile.schematics).find(s => s.name === name);
    if (sch) return sch;
    sch = {
      uuid: uuid(16),
      name,
      board: Object.keys(this.profile.profile.boards)[0] || '',
      source: '',
      version: String(Date.now()),
      updateTime: Date.now()
    };
    this.profile.profile.schematics[sch.uuid] = sch;
    if (!Object.keys(this.profile.profile.boards).length) {
      const boardUuid = uuid(16);
      this.profile.profile.boards[boardUuid] = { uuid: boardUuid, title: 'Board1', zIndex: 1 };
      sch.board = boardUuid;
    }
    const dir = path.join(this.rootDir, 'sch', name);
    fs.mkdirSync(dir, { recursive: true });
    // Schematic config (design rules) + assembly-variant sidecars. Both may be
    // empty; the ecfg still needs its SCH document preamble.
    const ecfgFile = path.join(dir, `${name}.ecfg`);
    if (!fs.existsSync(ecfgFile)) {
      writeRecords(ecfgFile, [
        { head: { type: 'DOCHEAD' }, body: { docType: 'SCH', client: '6b69636164326570', uuid: sch.uuid, updateTime: Date.now(), version: String(Date.now()), editVersion: '4.1.36', user: {} } },
        { head: { type: 'META', ticket: 1, id: 'META' }, body: { title: name, source: '', board: sch.board, zIndex: null } }
      ]);
    }
    const evarFile = path.join(dir, `${name}.evar`);
    if (!fs.existsSync(evarFile)) fs.writeFileSync(evarFile, '', 'utf8');
    this.save();
    return sch;
  }

  ensureSheet(sch, title) {
    let sheet = Object.values(this.profile.profile.sheets).find(s => s.schematic_uuid === sch.uuid && s.title === title);
    if (sheet) return sheet;
    sheet = {
      uuid: uuid(16),
      title,
      schematic_uuid: sch.uuid,
      zIndex: Object.values(this.profile.profile.sheets).filter(s => s.schematic_uuid === sch.uuid).length + 1,
      source: '',
      version: String(Date.now()),
      updateTime: Date.now()
    };
    this.profile.profile.sheets[sheet.uuid] = sheet;
    this.save();
    return sheet;
  }

  sheetFile(sheet) {
    const sch = this.profile.profile.schematics[sheet.schematic_uuid];
    return path.join(this.rootDir, 'sch', sch.name, `${sheet.title}.esch2`);
  }

  ensurePcb(name) {
    let pcb = Object.values(this.profile.profile.pcbs).find(p => p.title === name);
    if (pcb) return pcb;
    pcb = {
      uuid: uuid(16),
      title: name,
      board: Object.keys(this.profile.profile.boards)[0] || '',
      parent_uuid: '',
      source: '',
      version: String(Date.now()),
      updateTime: Date.now()
    };
    this.profile.profile.pcbs[pcb.uuid] = pcb;
    this.profile.pcb_count = Object.keys(this.profile.profile.pcbs).length;
    this.save();
    return pcb;
  }

  pcbFile(pcb) { return path.join(this.rootDir, 'pcb', `${pcb.title}.epcb2`); }

  // ---- get-or-die (read/modify paths: a typo must not silently create things) ----
  requireSchematic(name) {
    const sch = Object.values(this.profile.profile.schematics).find(s => s.name === name);
    if (!sch) {
      const known = Object.values(this.profile.profile.schematics).map(s => s.name).join(', ') || 'none';
      throw new Error(`Schematic not found: "${name}" (existing: ${known})`);
    }
    return sch;
  }

  requireSheet(schematicName, sheetTitle) {
    const sch = this.requireSchematic(schematicName);
    const sheet = Object.values(this.profile.profile.sheets).find(s => s.schematic_uuid === sch.uuid && s.title === sheetTitle);
    if (!sheet) throw new Error(`Sheet not found: "${sheetTitle}" in schematic "${schematicName}"`);
    return { sch, sheet };
  }

  requirePcb(name) {
    const pcb = Object.values(this.profile.profile.pcbs).find(p => p.title === name);
    if (!pcb) throw new Error(`PCB not found: "${name}"`);
    return pcb;
  }

  // ---- ensure document exists on disk (write paths) ----
  // Creates schematic/sheet in the index if missing AND guarantees the .esch2
  // file exists with the DOCHEAD/META/CANVAS preamble — an appendRecord into a
  // bare file would produce a malformed document.
  ensureSheetDocument(schematicName, sheetTitle) {
    const sch = this.ensureSchematic(schematicName);
    const sheet = this.ensureSheet(sch, sheetTitle);
    const file = this.sheetFile(sheet);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').trim() === '') {
      writeRecords(file, sheetDocRecords(sch, sheet));
    }
    return file;
  }

  ensurePcbDocument(name) {
    const pcb = this.ensurePcb(name);
    const file = this.pcbFile(pcb);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').trim() === '') {
      writeRecords(file, pcbDocRecords(pcb));
    }
    return file;
  }
}

// Shared document preambles. uuid linkage follows the official example:
//   .esch2 page DOCHEAD uuid == profile.sheets uuid
//   .epcb2     DOCHEAD uuid == profile.pcbs uuid
//   .ecfg      DOCHEAD uuid == profile.schematics uuid
function sheetDocRecords(sch, sheet) {
  return [
    { head: { type: 'DOCHEAD' }, body: { docType: 'SCH_PAGE', client: '6b69636164326570', uuid: sheet.uuid, updateTime: Date.now(), version: String(Date.now()), editVersion: '4.1.36', user: {} } },
    { head: { type: 'META', ticket: 1, id: 'META' }, body: { title: sheet.title, schematic: sch.uuid, source: '', zIndex: sheet.zIndex } },
    { head: { type: 'CANVAS', ticket: 2, id: 'CANVAS' }, body: { originX: 0, originY: 0 } }
  ];
}

// Official PCB layer table: id, layerType, layerName, activeColor, inactiveColor.
const PCB_LAYERS = [
  [1, 'TOP', 'Top Layer', '#ff0000', '#7f0000'],
  [2, 'BOTTOM', 'Bottom Layer', '#0000ff', '#00007f'],
  [3, 'TOP_SILK', 'Top Silkscreen Layer', '#ffcc00', '#7f6600'],
  [4, 'BOT_SILK', 'Bottom Silkscreen Layer', '#66cc33', '#336619'],
  [5, 'TOP_SOLDER_MASK', 'Top Solder Mask Layer', '#800080', '#400040'],
  [6, 'BOT_SOLDER_MASK', 'Bottom Solder Mask Layer', '#aa00ff', '#55007f'],
  [7, 'TOP_PASTE_MASK', 'Top Paste Mask Layer', '#808080', '#404040'],
  [8, 'BOT_PASTE_MASK', 'Bottom Paste Mask Layer', '#800000', '#400000'],
  [9, 'TOP_ASSEMBLY', 'Top Assembly Layer', '#33cc99', '#19664c'],
  [10, 'BOT_ASSEMBLY', 'Bottom Assembly Layer', '#5555ff', '#2a2a7f'],
  [11, 'OUTLINE', 'Board Outline Layer', '#ff00ff', '#7f007f'],
  [12, 'MULTI', 'Multi-Layer', '#c0c0c0', '#606060'],
  [13, 'DOCUMENT', 'Document Layer', '#ffffff', '#7f7f7f'],
  [14, 'MECHANICAL', 'Mechanical Layer', '#f022f0', '#781178'],
  ...Array.from({ length: 32 }, (_, i) => {
    const colors = [
      ['#999966', '#4c4c33'], ['#008000', '#004000'], ['#00ff00', '#007f00'], ['#bc8e00', '#5e4700'],
      ['#70dbfa', '#386d7d'], ['#00cc66', '#006633'], ['#9966ff', '#4c337f'], ['#800080', '#400040'],
      ['#008080', '#004040'], ['#15935f', '#15935f'], ['#000080', '#000040'], ['#00b400', '#005a00'],
      ['#2e4756', '#17232b'], ['#99842f', '#4c4217'], ['#ffffaa', '#7f7f55'], ['#99842f', '#4c4217'],
      ['#2e4756', '#17232b'], ['#3535ff', '#1a1a7f'], ['#8000bc', '#40005e'], ['#43ae5f', '#21572f'],
      ['#c3ecce', '#617667'], ['#728978', '#39443c'], ['#39503f', '#1c281f'], ['#0c715d', '#06382e'],
      ['#5a8a80', '#2d4540'], ['#2b937e', '#15493f'], ['#23999d', '#114c4e'], ['#45b4e3', '#225a71'],
      ['#215da1', '#102e50'], ['#4564d7', '#22326b'], ['#6969e9', '#343474'], ['#9069e9', '#483474']
    ];
    return [15 + i, 'SIGNAL', `Inner${i + 1}`, colors[i][0], colors[i][1]];
  }),
  [47, 'HOLE', 'Hole Layer', '#222222', '#111111'],
  [48, 'COMPONENT_SHAPE', 'Component Shape Layer', '#00cccc', '#006666'],
  [49, 'COMPONENT_MARKING', 'Component Marking Layer', '#66ffcc', '#337f66'],
  [50, 'PIN_SOLDERING', 'Pin Soldering Layer', '#cc9999', '#664c4c'],
  [51, 'PIN_FLOATING', 'Pin Floating Layer', '#ff99ff', '#7f4c7f'],
  [52, 'COMPONENT_MODEL', 'Component Model Layer', '#ffffff', '#7f7f7f'],
  [53, '3D_SHELL_OUTLINE', '3D Shell Outline Layer', '#66ff99', '#337f4c'],
  [54, '3D_SHELL_TOP', '3D Top Layer', '#ffccff', '#7f667f'],
  [55, '3D_SHELL_BOTTOM', '3D Bottom Layer', '#0066cc', '#003366'],
  [56, 'DRILL_DRAWING', 'Drill Drawing Layer', '#008080', '#004040'],
  [57, 'OTHER', 'Ratline Layer', '#6464ff', '#32327f'],
  [58, 'TOP_STIFFENER', 'Top Stiffener Layer', '#eee666', '#777333'],
  [59, 'BOTTOM_STIFFENER', 'Bottom Stiffener Layer', '#ccff00', '#667f00'],
  [361, 'SUBSTRATE', 'Dielectric1', '#000000', '#000000']
];

function pcbLayerRecords(startTicket = 3) {
  return PCB_LAYERS.map(([layerId, layerType, layerName, activeColor, inactiveColor], i) => ({
    head: { type: 'LAYER', ticket: startTicket + i, id: `["LAYER",${layerId}]` },
    body: { layerId, layerType, layerName, use: true, show: true, locked: false, activeColor, activateTransparency: 1, inactiveColor, inactiveTransparency: 1 }
  }));
}

function pcbDocRecords(pcb) {
  const layerRecords = pcbLayerRecords();
  const nextTicket = 3 + layerRecords.length;
  return [
    { head: { type: 'DOCHEAD' }, body: { docType: 'PCB', client: '6b69636164326570', uuid: pcb.uuid, updateTime: Date.now(), version: String(Date.now()), editVersion: '4.1.36', user: {} } },
    { head: { type: 'META', ticket: 1, id: 'META' }, body: { title: pcb.title, parent: '', source: '', board: pcb.board, zIndex: null } },
    { head: { type: 'CANVAS', ticket: 2, id: 'CANVAS' }, body: { originX: 0, originY: 0, unit: 'mil', gridXSize: 5, gridYSize: 5, snapXSize: 5, snapYSize: 5, altSnapXSize: 1, altSnapYSize: 1, gridType: 'GRID', multiGridType: 'NONE', multiGridRatio: 5, highlightValue: 0.5, layerBrightness: 'NORMAL' } },
    ...layerRecords,
    { head: { type: 'ACTIVE_LAYER', ticket: nextTicket, id: 'ACTIVE_LAYER' }, body: { layerId: 1 } }
  ];
}

// Read the DOCHEAD uuid of a document file (symbol/footprint docs), or null.
function readDocHeadUuid(filePath) {
  try {
    const rec = readRecords(filePath).find(r => r.type === 'DOCHEAD');
    return (rec && rec.body && rec.body.uuid) || null;
  } catch { return null; }
}

// ---- record insert helpers ----
function appendRecord(filePath, type, body, ticket, id) {
  const records = fs.existsSync(filePath) ? readRecords(filePath) : [];
  const maxTicket = records.reduce((m, r) => Math.max(m, r.ticket || 0), 0);
  const t = ticket || (maxTicket + 1);
  const recId = id || body.id || randId();
  const head = { type, ticket: t, id: recId };
  records.push({ head, body, ticket: t, id: recId, type });
  writeRecords(filePath, records);
  return { head, body, ticket: t, id: recId, type };
}

function updateRecord(filePath, predicate, mutator) {
  const records = readRecords(filePath);
  let updated = 0;
  for (const r of records) {
    if (predicate(r)) { mutator(r); updated++; }
  }
  writeRecords(filePath, records);
  return updated;
}

function removeRecord(filePath, predicate) {
  const records = readRecords(filePath);
  const kept = records.filter(r => !predicate(r));
  writeRecords(filePath, kept);
  return records.length - kept.length;
}

function formatDate(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

module.exports = {
  uuid,
  randId,
  parseRecord,
  readRecords,
  formatRecord,
  writeRecords,
  appendRecord,
  updateRecord,
  removeRecord,
  Project,
  formatDate,
  readDocHeadUuid,
  sheetDocRecords,
  pcbDocRecords,
  pcbLayerRecords
};