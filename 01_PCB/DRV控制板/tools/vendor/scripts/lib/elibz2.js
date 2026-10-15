'use strict';

// Build an EasyEDA Pro library package (.elibz2): a zip containing
//   device2.json    — device/symbol/footprint index (uuid → metadata)
//   <name>.elibu    — record stream with SYMBOL + FOOTPRINT doc segments
// Payload shapes mirror the real package written by EasyEDA Pro
// (see example/easyeda/easyeda-pro-libs.elibz2).

const { createZip } = require('./zip');
const { uuid, formatRecord } = require('./eprj3');
const { buildSymbolRecords, buildFootprintRecords, kicadToEprj3, flipY } = require('./kicad-to-eprj3');

const EDIT_VERSION = '4.1.35';

// The 19-layer footprint canvas table as written by the app.
const FOOTPRINT_LAYERS = [
  ['TOP', 'Top Layer', '#FF0000', '#7F0000'],
  ['BOTTOM', 'Bottom Layer', '#0000FF', '#00007F'],
  ['TOP_SILK', 'Top Silkscreen Layer', '#FFCC00', '#7F6600'],
  ['BOT_SILK', 'Bottom Silkscreen Layer', '#66CC33', '#336619'],
  ['TOP_PASTE_MASK', 'Top Paste Mask Layer', '#808080', '#404040'],
  ['BOT_PASTE_MASK', 'Bottom Paste Mask Layer', '#800000', '#400000'],
  ['TOP_SOLDER_MASK', 'Top Solder Mask Layer', '#800080', '#400040'],
  ['BOT_SOLDER_MASK', 'Bottom Solder Mask Layer', '#AA00FF', '#55007F'],
  ['DOCUMENT', 'Document Layer', '#FFFFFF', '#7F7F7F'],
  ['OUTLINE', 'Board Outline Layer', '#FF00FF', '#7F007F'],
  ['MULTI', 'Multi-Layer', '#C0C0C0', '#606060'],
  ['TOP_ASSEMBLY', 'Top Assembly Layer', '#33CC99', '#19664C'],
  ['BOT_ASSEMBLY', 'Bottom Assembly Layer', '#5555FF', '#2A2A7F'],
  ['MECHANICAL', 'Mechanical Layer', '#F022F0', '#781178'],
  ['COMPONENT_MODEL', 'Component Model Layer', '#FFFFFF', '#7F7F7F'],
  ['COMPONENT_SHAPE', 'Component Shape Layer', '#00CCCC', '#006666'],
  ['PIN_FLOATING', 'Pin Floating Layer', '#FF99FF', '#7F4C7F'],
  ['COMPONENT_MARKING', 'Component Marking Layer', '#66FFCC', '#337F66'],
  ['PIN_SOLDERING', 'Pin Soldering Layer', '#CC9999', '#664C4C']
];

const FOOTPRINT_CANVAS = {
  originX: 0, originY: 0, unit: 'mm',
  gridXSize: 10, gridYSize: 10, snapXSize: 0.5, snapYSize: 0.5,
  gridType: 'NONE', multiGridType: 'NONE', highlightValue: 0.5,
  layerBrightness: 'NORMAL'
};

function docHead(docType, docUuid) {
  const now = Date.now();
  return {
    head: { type: 'DOCHEAD' },
    body: {
      docType, client: uuid(16), uuid: docUuid,
      updateTime: now, version: String(now), editVersion: EDIT_VERSION, user: {}
    }
  };
}

function metaRec(title, extra = {}) {
  return {
    head: { type: 'META', ticket: 1, id: 'META' },
    body: { title, description: '', tags: [], source: '', ...extra }
  };
}

function person(ownerUuid) {
  return { uuid: ownerUuid, nickname: 'kicad-to-easyeda-eprj3', username: 'kicad-to-easyeda-eprj3' };
}

function libIndexEntry(uuidStr, name, ownerUuid, docType, extra = {}) {
  const now = Date.now();
  return {
    uuid: uuidStr, path: ownerUuid, ticket: 1,
    updateTime: now, createTime: now,
    title: name.toLowerCase(), description: extra.description || '',
    display_title: name,
    creator: person(ownerUuid), modifier: person(ownerUuid), owner: person(ownerUuid),
    custom_tags: '[]', ...(docType != null ? { docType } : {}), ...extra
  };
}

// kicadSym properties → device attributes
function symbolDeviceAttributes(sym, name, fpUuid) {
  const props = sym.properties || {};
  const ref = props.Reference || '?';
  const attrs = {
    Symbol: sym.uuid,
    Footprint: fpUuid || '',
    Designator: ref.endsWith('?') ? ref : ref + '?',
    Value: props.Value || name,
    Name: '={Value}',
    'Add into BOM': 'yes',
    'Convert to PCB': 'yes'
  };
  for (const [k, v] of Object.entries(props)) {
    if (!v || /^(Reference|Value|Footprint|ki_.*)$/.test(k)) continue;
    attrs[k] = v;
  }
  return attrs;
}

// KiCad symbol footprint property ("Lib:FPName") → match key
function footprintMatchKey(propValue) {
  if (!propValue) return '';
  return String(propValue).split(':').pop().trim().toLowerCase();
}

/**
 * Build an .elibz2 package from parsed KiCad libraries.
 * @param {object} opts
 * @param {string} opts.name package / elibu base name
 * @param {Array<{kicadSym}>} opts.symbols parsed KiCad symbols (nodeSymbol output)
 * @param {Array<{name,pads,shapes,texts}>} opts.footprints extracted KiCad footprints
 * @returns {Buffer} zip data
 */
function buildElibz2({ name, symbols = [], footprints = [] }) {
  const ownerUuid = uuid(32);
  const elibu = [];
  const device2 = { devices: {}, symbols: {}, footprints: {}, panelLibs: {} };

  const fpUuidByName = {};
  const fpRecordsByName = {};
  for (const fp of footprints) {
    const docUuid = uuid(16);
    fpUuidByName[(fp.name || '').toLowerCase()] = docUuid;
    const { records } = buildFootprintRecords(fp, { includePart: false, canvasBody: FOOTPRINT_CANVAS });
    elibu.push(
      docHead('FOOTPRINT', docUuid),
      metaRec(fp.name || ''),
      docHead('FOOTPRINT', docUuid),
      ...FOOTPRINT_LAYERS.map(([layerType, layerName, activeColor, inactiveColor]) => ({
        head: { type: 'LAYER', ticket: 1, id: 'LAYER' },
        body: { layerType, layerName, use: true, show: true, locked: false, activeColor, activateTransparency: 1, inactiveColor, inactiveTransparency: 1 }
      })),
      { head: { type: 'ACTIVE_LAYER', ticket: 1, id: 'ACTIVE_LAYER' }, body: { layerId: 1 } },
      ...records
    );
    device2.footprints[docUuid] = libIndexEntry(docUuid, fp.name || '', ownerUuid, 4);
    fpRecordsByName[(fp.name || '').toLowerCase()] = records;
  }

  for (const sym of symbols) {
    const symName = sym.name || 'SYM';
    const symUuid = uuid(16);
    sym.uuid = symUuid;
    const fpProp = footprintMatchKey(sym.properties && sym.properties.Footprint);
    const fpUuid = (fpProp && fpUuidByName[fpProp]) || '';

    const { records } = buildSymbolRecords(sym, {
      partId: symName + '.1',
      partTitle: symName + '.1',
      libAttrs: true
    });
    elibu.push(
      docHead('SYMBOL', symUuid),
      metaRec(symName, { docType: sym.power ? 18 : 2 }),
      docHead('SYMBOL', symUuid),
      ...records
    );
    device2.symbols[symUuid] = libIndexEntry(symUuid, symName, ownerUuid, 2);

    const attrs = symbolDeviceAttributes(sym, symName, fpUuid);
    const devUuid = uuid(16);
    device2.devices[devUuid] = libIndexEntry(devUuid, symName, ownerUuid, null, {
      attributes: attrs,
      images: [],
      symbol_type: 2,
      description: attrs.Description || ''
    });
  }

  const elibuText = elibu.map(r => formatRecord(r.head, r.body)).join('\n') + '\n';
  return createZip([
    { name: 'device2.json', data: JSON.stringify(device2, null, 2) },
    { name: `${name}.elibu`, data: elibuText }
  ]);
}

module.exports = { buildElibz2, FOOTPRINT_LAYERS, FOOTPRINT_CANVAS };
