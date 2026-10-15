English | [中文](README.md)

# kicad-to-easyeda-eprj3

Convert KiCAD project files to the eprj3 project format of EasyEDA Pro, and KiCad libraries to the EasyEDA Pro library format `.elibz2`.

## Features

- **Project conversion**: Batch-traverses all `.kicad_sch` / `.kicad_pcb` files under a directory and generates a complete eprj3 folder project (`<name>.eprj3` index + `sch/` + `pcb/`)
- **Library conversion**: Packs all KiCad libraries under a directory (`*.kicad_sym` symbol libs + `*.pretty/*.kicad_mod` footprint libs) into a single EasyEDA Pro library file `.elibz2`

## Requirements

- Node.js ≥ 18, with no npm dependencies.

## Usage

### 1) KiCad project → eprj3 project (batch)

```bash
node scripts/convert-kicad.js convert <KiCad project directory> <output directory> [--project-name <name>]
```

Example — convert the sample project shipped with this repository:

```bash
node scripts/convert-kicad.js convert example/kicad/kicad-project ./eprj3 --project-name kicad-project
```

Output:

```text
Created eprj3 project at D:/…/eprj3
  sch: kicad-project.kicad_sch -> D:/…/eprj3/sch/Schematic1/P1.esch2
  pcb: kicad-project.kicad_pcb -> D:/…/eprj3/pcb/PCB1.epcb2
```

The generated project (`<output directory>/kicad-project.eprj3`, containing `sch/` and `pcb/`) can be opened directly in EasyEDA Pro.

- The two directories are passed positionally: 1st is the KiCad project directory, 2nd is the eprj3 output directory
- Each `*.kicad_sch` under the source directory generates one schematic (`Schematic1`, `Schematic2`, …), and each `*.kicad_pcb` generates one board (`PCB1`, `PCB2`, …)

### 2) KiCad library directory → EasyEDA Pro library package (.elibz2)

```bash
node scripts/convert-kicad-lib.js convert <KiCad library directory> <output.elibz2> [--name <LibName>]
```

Example — put symbol and footprint libraries into one directory and pack them together (the scan is non-recursive; `.kicad_sym` files and `.pretty/` directories must be direct children):

```text
mylibs/
├── Device.kicad_sym
├── LED.kicad_sym
├── Resistor_SMD.pretty/
│   ├── R_0805_2012Metric.kicad_mod
│   └── …
└── LED_SMD.pretty/
    └── …
```

```bash
node scripts/convert-kicad-lib.js convert mylibs ./DeviceLED.elibz2 --name DeviceLED
```

Output:

```text
  sym lib: Device.kicad_sym (533 symbols)
  sym lib: LED.kicad_sym (63 symbols)
  footprint lib: LED_SMD.pretty (100 footprints)
  footprint lib: Resistor_SMD.pretty (67 footprints)
Wrote DeviceLED.elibz2: 596 symbols, 167 footprints (636245 bytes)
```

The resulting `DeviceLED.elibz2` can be installed into your local libraries through EasyEDA Pro's library import.

- Scans the directory for all `*.kicad_sym` (symbol libraries) and `*.pretty/` (footprint libraries, reading their `*.kicad_mod` files) and merges everything into **one** `.elibz2`
- `--name` (optional): overrides the package name (defaults to the output file name minus the `.elibz2` suffix)
- A `.elibz2` is a zip archive containing:
  - `device2.json` — device/symbol/footprint index (uuid → metadata); symbols carry `docType:2`, footprints `docType:4`, and every symbol gets an auto-generated device entry
  - `<LibName>.elibu` — a record stream (same format as `.esch2`/`.epcb2`); each symbol/footprint is written as two segments: `DOCHEAD+META` and `DOCHEAD+records`
- When a symbol's `Footprint` property (e.g. `Resistor_SMD:R_0805`) matches a converted footprint name, the device's `Footprint` attribute is automatically linked to that footprint's uuid
- Power symbols (`symbol_type "power"`) get META `docType:18`; footprint docs include the 19-layer table + `ACTIVE_LAYER` + a full `CANVAS` and carry no `PART` record
- Example: `example/easyeda/easyeda-pro-libs.elibz2` is a reference library package exported from EasyEDA Pro

## Conversion Coverage (best-effort)

Output strictly follows the official format documentation from [easyeda-pro-format-skill](https://github.com/easyeda/easyeda-pro-format-skill) (types / field definitions / JSON Schemas), calibrated against real exported data where the schemas diverge from actual app output; see also the [official eprj3 format example project](https://github.com/easyeda/easyeda-pro-eprj3-format):

| KiCad | eprj3 |
| --- | --- |
| `lib_symbols` (schematic-embedded symbol libs) | Embedded `SYMBOL` doc segments (`PART`/graphics/pins) + `DEVICE` doc segments in `.esch2` |
| `symbol` instances (with `property`, `mirror`) | `COMPONENT` (`partId` → embedded `PART`, `DeviceName` → `DEVICE`, mirror/rotation converted) + `Designator`/`Value` `ATTR` |
| `wire` | `WIRE` + multiple `LINE` records sharing a `lineGroup` |
| `bus` / `bus_entry` | `BUS` + `LINE` / `BUSENTRY` |
| `junction` | Filled `CIRCLE` (electrical dot) |
| `no_connect` | Two `LINE` records (X marker) |
| `label` / `global_label` / `hierarchical_label` | `NETLABEL` |
| `text` / `text_box` | `TEXT` (+ `RECT` border) |
| `polyline` / `rectangle` / `circle` / `arc` / `bezier` | `POLY` / `RECT` / `CIRCLE` / `ARC` (center from three points) / `BEZIER`, with stroke/fill styles mapped |
| `image` | `OBJ` (base64-embedded) |
| `sheet` (hierarchy) | `RECT` + name `TEXT` + per-pin `NETLABEL` |
| Pin electrical/graphic types | Numeric `PIN.electric` / `PIN.pinShape` mapping |
| `footprint` (with `pad`) | Embedded `FOOTPRINT` doc segments (`PART`/`PAD`/silkscreen graphics) + `DEVICE` doc segments + `COMPONENT` placements + `Designator`/`Footprint`/`Device` `ATTR` in `.epcb2` |
| pad nets / oval drills | `PAD_NET` (component-pad binding) + `NET` index records / `holeType ROUND` width×height |
| `segment` / `arc` (PCB traces) | `FILL` on the corresponding layer (straight tracks as closed thin polygons; track arcs as closed polygons with `ARC` segments) |
| `via` | `VIA` (net, hole and pad diameters) |
| `zone` | `POUR` (`pourType`/`keepIsland`) + one `POURED` per zone/layer (`pourFill`, head id linked to the `POUR`); keepouts → `REGION` (`regionType PROHIBIT` + `prohibitType`) |
| `dimension` (aligned/orthogonal/radial/leader) | `DIMENSION` (`dimensionType LENGTH-CONSTRAINT` + `controlDot`) |
| `gr_line` / `gr_arc` / `gr_rect` / `gr_poly` / `gr_circle` / `bezier` | `LINE` / `ARC` / closed `POLY` (circles as `["CIRCLE",…]` paths, beziers as `"C"`-segment paths) |
| `gr_text` | `STRING` (alignment origin, mirroring, knockout→reverse) |
| `gr_rect`/`gr_line`/`gr_arc`/`gr_poly` on `Edge.Cuts` | Stitched into `POLY` `BOARD_OUTLINE` (`layerId=11`) |
| Layer mapping | `F.Cu=1`, `B.Cu=2`, `F.SilkS=3`, `B.SilkS=4`, `F.Mask=5`, `Edge.Cuts=11`, `In{n}.Cu=14+n`…; the PCB doc carries the official 60-layer table |

- Unit conversion: KiCad mm → eprj3 mil (×39.3700787); axis flip: KiCad Y-down → eprj3 Y-up; rotation (360−deg)%360
- uuid linkage (official convention): the `DOCHEAD.uuid` of the `.esch2` page / `.epcb2` / `.ecfg` equals the `sheets` / `pcbs` / `schematics` uuid in the index respectively
- Also generates `sch/<name>/<name>.ecfg` (design-rules skeleton) and `.evar` (assembly variants, empty)
- **Not migrated**: 3D models, net classes, SPICE models, custom rules; elements that cannot be translated are skipped with a warning

### Library Conversion Coverage (.elibz2)

| KiCad library | .elibz2 |
| --- | --- |
| Every `(symbol …)` in a `*.kicad_sym` | `SYMBOL` doc segment (`PART`/`PIN`/`POLY`/`RECT`/`CIRCLE`/`ARC`/`BEZIER`) + a `device2.json` symbol index entry + a device entry |
| `symbol_type "power"` | META `docType:18` (power class) |
| Symbol `property` entries (other than Reference/Value) | Passed through into device `attributes` |
| Symbol `Footprint` property | Auto-written to the device's `attributes.Footprint` (uuid) when it matches a footprint name |
| Every `(footprint …)` in `*.pretty/*.kicad_mod` | `FOOTPRINT` doc segment (19-layer table + `PAD`/`POLY`/`ARC` + `ACTIVE_LAYER`) + a `device2.json` footprint index entry |
| pad `thru_hole`/`oval` drills | `PAD` `holeDiameter`/`holeWidth`/`holeType ROUND` |
| `F.SilkS`/`B.SilkS` graphics | layerId 3/4; Fab/CrtYd/Dwgs and the rest → Document layer 13 |

## Directory Structure

```
kicad-to-easyeda-eprj3/
├── scripts/
│   ├── convert-kicad.js      ← Batch project conversion entry point (→ eprj3 project directory)
│   ├── convert-kicad-lib.js  ← Library conversion entry point (→ .elibz2 package)
│   └── lib/
│       ├── kicad.js          ← KiCad S-expression parser
│       ├── kicad-to-eprj3.js ← Symbols/footprints → eprj3 records
│       ├── eprj3.js          ← eprj3 read/write core (from easyeda-eprj3-skill, corrected against the official example)
│       ├── elibz2.js         ← .elibz2 package assembly (device2.json + .elibu)
│       ├── zip.js            ← Dependency-free zip read/write (zlib deflate/store)
│       └── utils.js
├── example/
│   ├── easyeda/              ← Reference EasyEDA Pro library package easyeda-pro-libs.elibz2
│   └── kicad/                ← Sample KiCad project
└── test/
    ├── smoke.js              ← End-to-end smoke suite (68 assertions)
    └── validate-format.js    ← Format validator checking generated records against the official JSON Schemas
```

## Testing

```bash
npm test
```

Generated records can additionally be validated one by one against the official Schemas (`sch`/`pcb`/`lib` contexts; `lib` routes each doc's records by its docType):

```bash
node test/validate-format.js <generated .esch2|.epcb2|.elibu> <sch|pcb|lib>
```

> The validator uses `validate.js` from [easyeda-pro-format-skill](https://github.com/easyeda/easyeda-pro-format-skill), found in the sibling directory by default, or via the `EASYEDA_FORMAT_SKILL` environment variable. Note: the official Schemas slightly diverge from real app exports (e.g. `POUR.pourType`, PCB `ATTR.groupID`, the `DIMENSION` structure); the validator is calibrated to the real exported data.

## Related Projects

- [easyeda-pro-format-skill](https://github.com/easyeda/easyeda-pro-format-skill) — The EasyEDA Pro file format skill pack (type index, per-primitive field definitions, JSON Schemas, validate.js); the authoritative format reference for this repository
- [easyeda-eprj3-skill](https://github.com/easyeda/easyeda-eprj3-skill) — A skill pack that teaches AI coding assistants to generate `.eprj3` projects from scratch; `scripts/lib/eprj3.js` and `utils.js` in this repository come from that project's core library
- [easyeda-pro-eprj3-format](https://github.com/easyeda/easyeda-pro-eprj3-format) — Official eprj3 format example project

## License

[Apache-2.0](LICENSE)
