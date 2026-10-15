#!/usr/bin/env node
'use strict';
/**
 * convert-kicad-lib.js — Convert KiCad libraries into one EasyEDA Pro
 *                       library package (.elibz2).
 *
 * Usage:
 *   node scripts/convert-kicad-lib.js convert <KiCadLibDir> <output.elibz2> [--name <LibName>]
 *
 * The directory is scanned for:
 *   - *.kicad_sym            symbol libraries  → SYMBOL docs + devices
 *   - *.pretty/*.kicad_mod   footprint libraries → FOOTPRINT docs
 * Symbols whose Footprint property matches a converted footprint name are
 * linked to it in device2.json automatically.
 */
const fs = require('fs');
const path = require('path');
const { parse, nodeSymbol, extractFootprintNode } = require('./lib/kicad');
const { buildElibz2 } = require('./lib/elibz2');
const { parseArgs, printHelp, die } = require('./lib/utils');

const schema = [{ name: 'name', hasValue: true, desc: 'Override package/elibu base name' }];

// KiCad 7+ marks power symbols with (symbol_type "power"); they use a
// dedicated device class in EasyEDA (META docType 18).
function isPowerSymbolNode(node) {
  for (const it of node.slice(1)) {
    if (Array.isArray(it) && it[0].v === 'symbol_type' && it[1] && it[1].v === 'power') return true;
    if (Array.isArray(it) && it[0].v === 'power') return true;
  }
  return false;
}

function main() {
  const usage = 'convert-kicad-lib.js convert <KiCadLibDir> <output.elibz2> [--name <LibName>]';
  const sub = process.argv[2];
  if (!sub || sub === 'help') { printHelp(usage, schema); process.exit(sub ? 0 : 1); }
  if (sub !== 'convert') die(`Unknown command: ${sub}`);
  const { opts, positional } = parseArgs(process.argv.slice(3), schema);
  const [srcArg, dstArg] = positional;
  if (!srcArg || !dstArg) { printHelp(usage, schema); die('Missing <KiCadLibDir> or <output.elibz2>', 1); }

  const src = path.resolve(srcArg);
  const dst = path.resolve(dstArg);
  if (!fs.existsSync(src)) die(`Source not found: ${src}`);
  const name = opts.name || path.basename(dstArg).replace(/\.elibz2$/i, '') || path.basename(src);

  const symbols = [];
  for (const f of fs.readdirSync(src).filter(f => f.endsWith('.kicad_sym'))) {
    const root = parse(fs.readFileSync(path.join(src, f), 'utf8'));
    let count = 0;
    for (const node of root.slice(1)) {
      if (!Array.isArray(node) || node[0].v !== 'symbol') continue;
      const sym = nodeSymbol(node);
      if (!sym.name) continue;
      sym.power = isPowerSymbolNode(node);
      symbols.push(sym);
      count++;
    }
    console.log(`  sym lib: ${f} (${count} symbols)`);
  }

  const footprints = [];
  for (const d of fs.readdirSync(src).filter(d => d.endsWith('.pretty'))) {
    const files = fs.readdirSync(path.join(src, d)).filter(f => f.endsWith('.kicad_mod'));
    for (const f of files) {
      try {
        const root = parse(fs.readFileSync(path.join(src, d, f), 'utf8'));
        if (!Array.isArray(root) || root[0].v !== 'footprint') continue;
        footprints.push(extractFootprintNode(root));
      } catch (e) {
        console.warn(`  warn: skip ${d}/${f}: ${e.message}`);
      }
    }
    console.log(`  footprint lib: ${d} (${files.length} footprints)`);
  }

  if (!symbols.length && !footprints.length) {
    die(`No .kicad_sym or .pretty libraries found in ${src}`);
  }

  const zip = buildElibz2({ name, symbols, footprints });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, zip);
  console.log(`Wrote ${dst}: ${symbols.length} symbols, ${footprints.length} footprints (${zip.length} bytes)`);
}

main();
