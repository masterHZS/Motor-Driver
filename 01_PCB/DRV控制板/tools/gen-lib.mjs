#!/usr/bin/env node
/**
 * tools/gen-lib.mjs
 * 由 design.config.mjs + lib/pins.mjs 生成 KiCad 符号库（.kicad_sym）。
 *
 * 产出：build/drvctrl.kicad_sym
 * 供 libgen 步骤打包成嘉立创EDA专业版库包（.elibz2）。
 *
 * 约定：不手写 .kicad_sym，一律由本脚本生成 —— 与仓库既有的「单一数据源」做法一致。
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LQFP64, selfCheck } from './lib/pins.mjs';
import { COMPONENTS, PROJECT } from './design.config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, 'build');

/**
 * ⚠️ 关键坑（2026-10-15 由 KiCad 10.0.6 `kicad-cli sym upgrade` 实测发现）：
 * `.kicad_sym` 库文件里 **symbol 名不能含冒号**。
 * 冒号形式（`Device:C`）是原理图里的 LIBID，不是库内符号名；
 * 一旦带冒号，**整个库文件加载失败**（kicad-cli 只报「无法加载库」，无具体行号）。
 * ⇒ design.config.mjs 里保留 `库名:符号名` 便于阅读，写库时只取冒号后面的部分。
 */
const bareName = (libId) => (libId.includes(':') ? libId.slice(libId.indexOf(':') + 1) : libId);

const FONT = (size = 1.27) => `(effects (font (size ${size} ${size})))`;

function prop(name, value, { x = 0, y = 0, rot = 0, hide = false, size = 1.27 } = {}) {
  return `      (property "${name}" "${value}"
        (at ${x} ${y} ${rot})
        (effects (font (size ${size} ${size}))${hide ? ' (hide yes)' : ''})
      )`;
}

/** 通用矩形符号（R/C/LED/二极管/晶振/开关/测试点/连接器 等） */
function genericSymbol(c) {
  const id = bareName(c.libId);
  const p = c.pins || [];
  const half = Math.max(2.54, (Math.ceil(p.length / 2) - 1) * 1.27 + 2.54);
  // 体宽按「左右两列最长引脚名之和」自动算，中间再留 2.2 mm 空隙，
  // 否则两列名字会在体中央对撞（Conn_02x16 踩过）。
  const NAME_W = 0.95 * 1.27;                 // 单字符宽度估算
  const leftNames = p.filter((_, i) => i % 2 === 0);
  const rightNames = p.filter((_, i) => i % 2 === 1);
  const longest = (arr) => arr.reduce((m, q) => Math.max(m, (q.name || '').length), 1);
  const needW = (longest(leftNames) + longest(rightNames)) * NAME_W + 2.2;
  const bodyHalfW = Math.max(3.81, needW / 2);
  const lines = [];
  lines.push(`    (symbol "${id}"`);
  lines.push(`      (pin_names (offset 0.508))`);
  lines.push(`      (exclude_from_sim no) (in_bom yes) (on_board yes)`);
  lines.push(prop('Reference', c.refPrefix, { x: 0, y: half + 1.27, hide: false }));
  lines.push(prop('Value', c.value, { x: 0, y: -half - 1.27 }));
  lines.push(prop('Footprint', c.footprint || '', { hide: true }));
  lines.push(prop('Datasheet', c.datasheet || '', { hide: true }));
  lines.push(prop('Description', c.desc || '', { hide: true }));
  lines.push(prop('LCSC', c.lcsc || '', { hide: true }));
  lines.push(`      (symbol "${id}_0_1"`);
  lines.push(`        (rectangle (start ${-bodyHalfW} ${half}) (end ${bodyHalfW} ${-half})`);
  lines.push(`          (stroke (width 0.254) (type default)) (fill (type background))`);
  lines.push(`        )`);
  lines.push(`      )`);
  lines.push(`      (symbol "${id}_1_1"`);
  p.forEach((pin, i) => {
    const side = i % 2 === 0 ? -1 : 1;               // 左 / 右
    const row = Math.floor(i / 2);
    const y = half - 1.27 - row * 2.54;
    const x = side < 0 ? -bodyHalfW - 2.54 : bodyHalfW + 2.54;
    const rot = side < 0 ? 0 : 180;
    lines.push(`        (pin ${pin.type || 'passive'} line (at ${x} ${y} ${rot}) (length 2.54)`);
    lines.push(`          (name "${pin.name}" ${FONT(1.27)})`);
    lines.push(`          (number "${pin.number}" ${FONT(1.27)})`);
    lines.push(`        )`);
  });
  lines.push(`      )`);
  lines.push(`    )`);
  return lines.join('\n');
}

/** LQFP64 四边出脚符号（MCU） */
function lqfp64Symbol(c) {
  const id = bareName(c.libId);
  const rows = 16;
  const pitch = 2.54;
  // 体宽/体高要放得下最长的引脚名（PC14-OSC32_IN / FAULT_BKIN），留足内部空间
  const xHalf = 27.94;                       // 体宽 55.88 mm
  const yHalf = (rows / 2) * pitch + 5.08;   // 25.4 mm：左右各 12.7，给上下排的长引脚名留出行车道
  const errs = selfCheck();
  if (errs.length) throw new Error('pins.mjs 自检失败: ' + errs.join('; '));

  const L = [];
  L.push(`    (symbol "${id}"`);
  L.push(`      (pin_names (offset 2.032))`);   // 引脚名离引脚根 2.032 mm，避免与相邻排撞字
  L.push(`      (exclude_from_sim no) (in_bom yes) (on_board yes)`);
  // 参考号与值都放到**体上方**、且左右分开，避免压到顶部引脚名
  L.push(prop('Reference', c.refPrefix, { x: -xHalf + 2.54, y: yHalf + 7.62 }));
  L.push(prop('Value', c.value, { x: xHalf - 2.54, y: yHalf + 7.62 }));
  L.push(prop('Footprint', c.footprint || '', { hide: true }));
  L.push(prop('Datasheet', c.datasheet || '', { hide: true }));
  L.push(prop('Description', c.desc || '', { hide: true }));
  L.push(prop('LCSC', c.lcsc || '', { hide: true }));
  L.push(`      (symbol "${id}_0_1"`);
  L.push(`        (rectangle (start ${-xHalf} ${yHalf}) (end ${xHalf} ${-yHalf})`);
  L.push(`          (stroke (width 0.254) (type default)) (fill (type background))`);
  L.push(`        )`);
  L.push(`      )`);
  L.push(`      (symbol "${id}_1_1"`);

  // 脚号 n -> 几何边与序号
  // 左：1..16 自上而下；下：17..32 自左而右；右：33..48 自下而上；上：49..64 自右而左
  const geom = new Map();
  for (let k = 0; k < rows; k += 1) {
    geom.set(1 + k, { side: 'L', i: k });
    geom.set(17 + k, { side: 'B', i: k });
    geom.set(33 + k, { side: 'R', i: k });
    geom.set(49 + k, { side: 'T', i: k });
  }
  for (const [num, name, type, assign] of LQFP64) {
    const g = geom.get(num);
    if (!g) throw new Error(`引脚 ${num} 无几何位置`);
    const off = -(rows / 2 - 0.5) * pitch + g.i * pitch;   // 19.05 .. -19.05
    let x; let y; let rot;
    if (g.side === 'L') { x = -xHalf - 5.08; y = off; rot = 0; }
    else if (g.side === 'R') { x = xHalf + 5.08; y = off; rot = 180; }
    else if (g.side === 'B') { x = off; y = -yHalf - 5.08; rot = 90; }
    else { x = off; y = yHalf + 5.08; rot = 270; }
    const pname = assign && assign !== 'NC' && assign !== 'RSV' ? assign : name;
    L.push(`        (pin ${type} line (at ${x} ${y} ${rot}) (length 5.08)`);
    L.push(`          (name "${pname}" ${FONT(1.27)})`);
    L.push(`          (number "${num}" ${FONT(1.27)})`);
    L.push(`        )`);
  }
  L.push(`      )`);
  L.push(`    )`);
  return L.join('\n');
}

// ---------------- 主流程 ----------------
mkdirSync(BUILD, { recursive: true });
const out = [];
out.push('(kicad_symbol_lib');
out.push('  (version 20231120)');
out.push('  (generator "drvctrl-gen-lib")');
out.push(`  (generator_version "${PROJECT.version}")`);
for (const c of COMPONENTS) {
  out.push(c.kind === 'lqfp64' ? lqfp64Symbol(c) : genericSymbol(c));
}
out.push(')');
const text = out.join('\n') + '\n';
const target = join(BUILD, `${PROJECT.libName}.kicad_sym`);
writeFileSync(target, text, 'utf8');
console.log(`[gen-lib] ${COMPONENTS.length} 个符号 -> ${target} (${text.length} 字节)`);
