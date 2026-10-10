/**
 * KiCad 8 原理图生成器
 *
 * ── 画法（改造后）────────────────────────────────────────────────
 *  · 块内网络（全部引脚落在同一个功能块里）→ **真实正交走线直连**
 *  · 电源/地/母线网络 + 跨功能块网络      → **global_label**
 *  判定与布线都在 router.mjs（kicad.mjs / render.mjs 共用同一份结果）。
 *
 * 坐标变换：符号空间 +Y 向上，图纸空间 +Y 向下 → sheet = (X + px, Y − py)
 */
import { COMPONENTS, NETS, NO_CONNECT, PROJECT, NET_CLASS } from './design.mjs';
import { PLACE, BLOCKS, blockOf } from './layout.mjs';
import { SYMDEFS, pinPos, pinGroupsOf, pinNameOf, refPrefixFor } from './symdefs.mjs';
import { buildRouting } from './router.mjs';
import { buildExplicit, MOSFET_MODS, EXPLICIT_NETS } from './wires.mjs';

let uuidSeq = 0;
const uuid = () => `a0000000-0000-4000-8000-${(++uuidSeq).toString(16).padStart(12, '0')}`;
const ROOT_UUID = 'a0000000-0000-4000-8000-000000000001';

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const r3 = (v) => Math.round(v * 1000) / 1000;
const out = [];
const w = (s = '') => out.push(s);

/* ---------------- 布线（共用模块） ---------------- */
const pinGroups = {};
for (const c of COMPONENTS) pinGroups[c.ref] = pinGroupsOf(c.ref);
const ex = buildExplicit(MOSFET_MODS);
export const ROUTING = buildRouting({
  NETS, NET_CLASS, NO_CONNECT, place: PLACE, pinGroups, blockOf,
  explicitWires: ex.wires, extraLabels: ex.labels,
});

w(`(kicad_sch`);
w(`  (version 20231120)`);
w(`  (generator "mdrive-gen")`);
w(`  (generator_version "8.0")`);
w(`  (uuid "${ROOT_UUID}")`);
w(`  (paper "A2")`);
w(`  (title_block`);
w(`    (title "${esc(PROJECT.title)}")`);
w(`    (date "${PROJECT.date}")`);
w(`    (rev "${PROJECT.rev}")`);
w(`    (comment 1 "母线 9.0-16.8V(3-4S LiPo) / 无感六步换向 / 反电动势过零检测由片上 HC32F005 的 ADC 完成")`);
w(`    (comment 2 "★HC32F005C6PA 片上主控：TIM4/5/6 各一对硬件互补 PWM+硬件死区，直接驱动 FD6288T")`);
w(`    (comment 3 "PGND 与 AGND 经 R47(0R) 单点星接；ISP(P35/P36) 已占用，必须用 SWD 烧录")`);
w(`    (comment 4 "画法：块内小元件用正交走线直连；电源/地/母线/跨块网络用 global_label")`);
w(`  )`);

w(`  (lib_symbols`);
for (const [name, sd] of Object.entries(SYMDEFS)) {
  w(`    (symbol "mdrive:${name}"`);
  w(`      (pin_names (offset 0.762))`);
  w(`      (exclude_from_sim no) (in_bom yes) (on_board yes)`);
  w(`      (property "Reference" "${refPrefixFor(name)}" (at ${sd.refAt[0]} ${sd.refAt[1]} 0) (effects (font (size 1.27 1.27)) (justify ${sd.j})))`);
  w(`      (property "Value" "${name}" (at ${sd.valAt[0]} ${sd.valAt[1]} 0) (effects (font (size 1.27 1.27)) (justify ${sd.j})))`);
  w(`      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))`);
  w(`      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))`);
  w(`      (symbol "${name}_0_1"`);
  for (const g of sd.gfx) w(`        ${g}`);
  w(`      )`);
  w(`      (symbol "${name}_1_1"`);
  for (const p of sd.pins) {
    const nm = pinNameOf(name, p.n);
    w(`        (pin ${p.t} line (at ${p.x} ${p.y} ${p.a}) (length ${p.l})`);
    w(`          (name "${esc(nm)}" (effects (font (size 1.016 1.016))))`);
    w(`          (number "${p.n}" (effects (font (size 1.016 1.016)))))`);
  }
  w(`      )`);
  w(`    )`);
}
w(`  )`);

/* 功能块边框 + 标题 + 说明文字（先画，处于底层） */
for (const b of BLOCKS) {
  if (!b.w || !b.h) continue;
  const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]];
  w(`  (polyline (pts ${pts.map(([x, y]) => `(xy ${x} ${y})`).join(' ')}) (stroke (width 0.3) (type dash)) (uuid "${uuid()}"))`);
  w(`  (text "${esc(b.title)}" (at ${b.x} ${b.y - 1.6} 0) (effects (font (size 2.2 2.2) bold) (justify left bottom)) (uuid "${uuid()}"))`);
  (b.note ?? []).forEach((line, i) => {
    if (line === '') return;
    w(`  (text "${esc(line)}" (at ${b.x + 2} ${b.y + 6 + i * 3.6} 0) (effects (font (size 1.5 1.5)) (justify left)) (uuid "${uuid()}"))`);
  });
}

/* 元件实例 */
const PROJ = 'motor-driver';
for (const c of COMPONENTS) {
  const p = PLACE[c.ref];
  const sd = SYMDEFS[c.sym];
  w(`  (symbol (lib_id "mdrive:${c.sym}") (at ${p.x} ${p.y} 0) (unit 1)`);
  w(`    (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)`);
  w(`    (uuid "${uuid()}")`);
  w(`    (property "Reference" "${c.ref}" (at ${r3(p.x + sd.refAt[0])} ${r3(p.y - sd.refAt[1])} 0) (effects (font (size 1.27 1.27)) (justify ${sd.j})))`);
  w(`    (property "Value" "${esc(c.val)}" (at ${r3(p.x + sd.valAt[0])} ${r3(p.y - sd.valAt[1])} 0) (effects (font (size 1.27 1.27)) (justify ${sd.j})))`);
  w(`    (property "Footprint" "${esc(c.fp)}" (at ${p.x} ${p.y} 0) (effects (font (size 1.27 1.27)) hide))`);
  w(`    (property "Datasheet" "" (at ${p.x} ${p.y} 0) (effects (font (size 1.27 1.27)) hide))`);
  const seen = new Set();
  for (const pd of sd.pins) { if (seen.has(pd.n)) continue; seen.add(pd.n); w(`    (pin "${pd.n}" (uuid "${uuid()}"))`); }
  w(`    (instances (project "${PROJ}" (path "/${ROOT_UUID}" (reference "${c.ref}") (unit 1))))`);
  w(`  )`);
}

/* 走线 */
for (const s of ROUTING.wires)
  w(`  (wire (pts (xy ${s.x1} ${s.y1}) (xy ${s.x2} ${s.y2})) (stroke (width 0) (type default)) (uuid "${uuid()}"))`);

/* T 型连接点 */
for (const j of ROUTING.junctions)
  w(`  (junction (at ${j.x} ${j.y}) (diameter 0) (color 0 0 0 0) (uuid "${uuid()}"))`);

/* 全局标签 */
for (const l of ROUTING.labels) {
  w(`  (global_label "${esc(l.net)}" (shape passive) (at ${l.x} ${l.y} ${l.a}) (fields_autoplaced yes)`);
  w(`    (effects (font (size 1.27 1.27)) (justify ${l.a === 180 ? 'right' : 'left'})) (uuid "${uuid()}"))`);
}

/* 未使用引脚：no-connect 标记 */
let ncCount = 0;
for (const k of NO_CONNECT) {
  const i = k.lastIndexOf('.');
  const ref = k.slice(0, i);
  const pp = pinPos(ref, k.slice(i + 1));
  w(`  (no_connect (at ${r3(pp.x)} ${r3(pp.y)}) (uuid "${uuid()}"))`);
  ncCount++;
}

w(`  (sheet_instances (path "/" (page "1")))`);
w(`)`);

/* ---------------- 自检 ---------------- */
const pinNet = ROUTING.pinNet;
const designNets = new Set(Object.keys(NETS));
const ncSetEmit = new Set(NO_CONNECT);
for (const c of COMPONENTS)
  for (const pd of SYMDEFS[c.sym].pins) {
    const k = `${c.ref}.${pd.n}`;
    if (ncSetEmit.has(k)) continue;
    if (!designNets.has(pinNet.get(k))) throw new Error(`网络名不在设计中: ${k}`);
  }
/* 同一坐标的引脚必须同网络（否则走线必然短路） */
for (const c of COMPONENTS)
  for (const g of pinGroups[c.ref]) {
    const nets = new Set(g.pins.map((pn) => pinNet.get(`${c.ref}.${pn}`)).filter(Boolean));
    if (nets.size > 1) throw new Error(`${c.ref} 同坐标引脚却属不同网络: ${[...nets].join(',')}`);
  }

export const kicadText = out.join('\n') + '\n';
export const stats = {
  components: COMPONENTS.length,
  wires: ROUTING.wires.length,
  labels: ROUTING.labels.length,
  junctions: ROUTING.junctions.length,
  wireNets: ROUTING.stats.wireNets,
  labelNets: ROUTING.stats.labelNets,
  nets: designNets.size,
  blocks: BLOCKS.length,
  noConnect: ncCount,
};
