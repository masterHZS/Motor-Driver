#!/usr/bin/env node
/**
 * tools/parse-af.mjs
 * 从 ST DS12589 的 Table 13（Alternate function）解析「引脚 -> AF0..AF15」。
 *
 * 列结构已核实（PA0/PA1/PA2 逐格对齐验证）：
 *   Port | AF0 | AF1 | ... | AF15
 * 每行 16 格，空位是 `-`；单元格内可能有换行（靠尾随 `_` 或 `/` 拼接）。
 *
 * 输入：tools/measure 阶段从 PDF 抽出的文本（tmp/g431_pinout.txt）
 * 用法：node tools/parse-af.mjs [--json 输出] [--pin PA8 ...]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SRC = process.argv.find((a) => a.startsWith('--src='))?.slice(6)
  || 'tmp/g431_pinout.txt';
if (!existsSync(SRC)) {
  console.error(`✗ 找不到 ${SRC}`);
  process.exit(2);
}
const all = readFileSync(SRC, 'utf8');

// 取 Table 13 区段
const i0 = all.indexOf('Table 13. Alternate function');
let i1 = all.indexOf('Table 14.');
if (i1 < 0) i1 = all.indexOf('Table 15.');
const segText = all.slice(i0, i1 > 0 ? i1 : i0 + 400000);

const raw = segText.split('\n').map((l) => l.replace(/\r$/, '').trim());

// 去掉页眉页脚噪声
const NOISE = /^(DS12589|Rev \d|\d+\/198|STM32G431x6|Pinouts and pin description|Table 13\..*|\(continued\)|Port|AF\d+)$/;
const toks = raw.filter((l) => l && !NOISE.test(l));

// 引脚名行 = 单独一行的 Pxn
const isPin = (s) => /^P[A-H]\d{1,2}$/.test(s);

const af = {};        // pin -> [16 项]
let cur = null;
let cells = [];
const problems = [];

function flush() {
  if (!cur) return;
  // 合并被拆开的单元格：以 `_` 或 `/` 结尾的与下一段拼接
  const merged = [];
  for (const c of cells) {
    if (merged.length && /[_/]$/.test(merged[merged.length - 1])) {
      merged[merged.length - 1] += c;
    } else {
      merged.push(c);
    }
  }
  if (merged.length !== 16) {
    problems.push(`${cur}: 解析到 ${merged.length} 格（应为 16） -> ${JSON.stringify(merged)}`);
  } else {
    af[cur] = merged;
  }
}

for (const t of toks) {
  if (isPin(t)) {
    flush();
    cur = t;
    cells = [];
  } else if (cur) {
    cells.push(t);
  }
}
flush();

const pins = Object.keys(af);
console.log(`解析到 ${pins.length} 个引脚，问题 ${problems.length} 条`);
for (const p of problems) console.log('  ⚠ ' + p);

const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx > 0 && process.argv[jsonIdx + 1]) {
  writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(af, null, 1) + '\n', 'utf8');
  console.log(`已写出 ${process.argv[jsonIdx + 1]}`);
}

// 查询
const want = process.argv.slice(2).filter((a) => /^P[A-H]\d{1,2}$/.test(a));
const show = want.length ? want : ['PA8', 'PA9', 'PA10', 'PB13', 'PB14', 'PB15', 'PA6', 'PB12', 'PC0', 'PC1', 'PC2', 'PC3', 'PA3', 'PB11', 'PB3', 'PB4'];
for (const p of show) {
  if (!af[p]) { console.log(`${p}: (未解析到)`); continue; }
  console.log(`\n${p}`);
  af[p].forEach((c, k) => { if (c !== '-') console.log(`   AF${String(k).padStart(2)}  ${c}`); });
}
