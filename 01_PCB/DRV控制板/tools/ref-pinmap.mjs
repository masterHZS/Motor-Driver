#!/usr/bin/env node
/**
 * tools/ref-pinmap.mjs
 * 从 **KiCad 官方符号库** 提取 STM32G431RBTx（LQFP64）的「脚号 ↔ 引脚名」，作为独立第三方权威。
 *
 * 为什么需要它：本仓库自己的 pins.mjs 是从 ST 数据手册提取的，
 * 一旦提取口径出错就会「自证正确」。用完全独立的第三方数据源（KiCad 官方库，
 * 由 ST 官方数据手册持续校对）逐脚比对，才能抓出系统性的脚号偏移。
 *
 * 用法：
 *   node tools/ref-pinmap.mjs                       # 打印 64 脚
 *   node tools/ref-pinmap.mjs --json <路径>          # 额外落盘 JSON
 *   node tools/ref-pinmap.mjs --compare             # 与 tools/lib/pins.mjs 逐脚比对
 *
 * 注意：官方库用 `(extends "基符号")` 派生封装变体，**引脚在基符号里**。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CANDIDATE_LIBS = [
  process.env.KICAD_SYM_LIB,
  'F:\\Kicad\\share\\kicad\\symbols\\MCU_ST_STM32G4.kicad_sym',
  'C:\\Program Files\\KiCad\\10.0\\share\\kicad\\symbols\\MCU_ST_STM32G4.kicad_sym',
  'C:\\Program Files\\KiCad\\9.0\\share\\kicad\\symbols\\MCU_ST_STM32G4.kicad_sym',
].filter(Boolean);

function matchParen(s, from) {
  let d = 0; let inStr = false;
  for (let i = from; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) { if (c === '\\') i += 1; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '(') d += 1;
    else if (c === ')') { d -= 1; if (d === 0) return i + 1; }
  }
  return s.length;
}

/** 逐行状态机提取 pin：KiCad 库每脚形如
 *   (pin bidirectional line
 *     (at -25.4 40.64 0)
 *     (length 5.08)
 *     (name "PA0" (effects ...))
 *     (number "12" (effects ...))
 *   )
 */
function extractPins(body) {
  const pins = {};
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*\(pin\s+\S+\s+\S+\s*$/.test(lines[i].replace(/\r$/, ''))) continue;
    let nm = null; let nu = null;
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j += 1) {
      const l = lines[j];
      if (!nm) { const mm = /\(name\s+"([^"]*)"/.exec(l); if (mm) nm = mm[1]; }
      if (!nu) { const mm = /\(number\s+"([^"]*)"/.exec(l); if (mm) nu = mm[1]; }
      if (nm && nu) break;
      if (/^\s*\(pin\s/.test(l)) break;   // 下一脚了
    }
    if (nm && nu) pins[nu] = nm;
  }
  return pins;
}

const lib = CANDIDATE_LIBS.find((p) => existsSync(p));
if (!lib) {
  console.error('✗ 找不到 KiCad 官方 STM32G4 符号库；用环境变量 KICAD_SYM_LIB 指定路径');
  process.exit(2);
}
const text = readFileSync(lib, 'utf8');

let target = null;
for (const v of ['STM32G431RBTx', 'STM32G431RBT6', 'STM32G431RBTxTR']) {
  if (text.includes(`(symbol "${v}"`)) { target = v; break; }
}
if (!target) {
  console.error('✗ 没找到 STM32G431RBTx');
  process.exit(1);
}

let start = text.indexOf(`(symbol "${target}"`);
let body = text.slice(start, matchParen(text, text.indexOf('(', start)));
const ext = /\(extends\s+"([^"]+)"\)/.exec(body);
let baseNote = '';
if (ext) {
  const base = ext[1];
  const bStart = text.indexOf(`(symbol "${base}"`);
  if (bStart < 0) { console.error(`✗ 找不到基符号 ${base}`); process.exit(1); }
  body = text.slice(bStart, matchParen(text, text.indexOf('(', bStart)));
  baseNote = ` ← extends "${base}"`;
}

const raw = extractPins(body);
const pins = {};
for (const k of Object.keys(raw)) {
  const n = Number(k);
  if (Number.isInteger(n) && n >= 1 && n <= 64) pins[n] = raw[k];
}
const nums = Object.keys(pins).map(Number).sort((a, b) => a - b);

console.log(`参考库  : ${lib}`);
console.log(`符号    : ${target}${baseNote}`);
console.log(`解析到  : ${nums.length} 个引脚（1..64）\n`);

export { pins as kicadPins, lib as kicadLibPath };

const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx > 0 && process.argv[jsonIdx + 1]) {
  const out = {};
  for (const n of nums) out[String(n)] = pins[n];
  writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(out, null, 1) + '\n', 'utf8');
  console.log(`已写出 ${process.argv[jsonIdx + 1]}\n`);
}

if (nums.length !== 64) {
  console.error(`✗ 期望 64 个引脚，实际 ${nums.length}`);
  process.exit(1);
}

if (process.argv.includes('--compare')) {
  const { LQFP64 } = await import('./lib/pins.mjs');
  const ours = new Map(LQFP64.map(([n, nm]) => [n, nm]));
  let bad = 0;
  console.log('脚号  本仓库 pins.mjs        KiCad 官方            判定');
  console.log('-'.repeat(64));
  for (const n of nums) {
    const a = (ours.get(n) || '???').replace(/-\w+$/, '');
    const b = (pins[n] || '???').replace(/-\w+$/, '');
    const same = a === b;
    if (!same) bad += 1;
    console.log(`${String(n).padStart(3)}   ${(ours.get(n) || '???').padEnd(20)} ${(pins[n] || '???').padEnd(20)} ${same ? 'ok' : '✗ 不符'}`);
  }
  console.log('-'.repeat(64));
  console.log(bad ? `✗ ${bad}/64 个脚号不符` : '✓ 64/64 与 KiCad 官方库一致');
  process.exit(bad ? 1 : 0);
} else {
  for (const n of nums) console.log(`${String(n).padStart(3)}  ${pins[n]}`);
}
