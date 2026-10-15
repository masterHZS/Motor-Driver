#!/usr/bin/env node
/**
 * tools/validate-lib.mjs   （无外部依赖的轻量结构校验）
 *
 * 校验生成的 .kicad_sym：
 *   ① 括号平衡  ② 顶层符号数  ③ 引脚数
 *   ④ LQFP64 符号内部 1..64 脚号齐全且唯一  ⑤ 每个符号都有 LCSC 属性行
 *   ⑥ 缩进风格守卫：**必须是本生成器的空格缩进**（防被 kicad-cli 就地改写）
 *
 * 注意：`.kicad_sym` 里**顶层符号行与子单元行的缩进相同**，所以不能靠缩进切块，
 *       必须用括号配平来找每个符号的完整范围（2026-10-15 踩过这个坑）。
 *
 * ⚠️ 工作纪律：`kicad-cli sym upgrade <file>` 是**原地改写**，会污染生成物。
 *   要验证符号库，请用 `node tools/check-kicad.mjs`（只读 + 渲染 SVG）。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LQFP64 } from './lib/pins.mjs';
import { COMPONENTS, PROJECT } from './design.config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const file = join(HERE, 'build', `${PROJECT.libName}.kicad_sym`);
const text = readFileSync(file, 'utf8');

const problems = [];
const oks = [];

// ---------- 工具：按括号配平切出每个顶层符号块 ----------
/** 跳过字符串字面量，找到 from 处 '(' 对应的 ')' 的下标+1 */
function matchParen(s, from) {
  let depth = 0;
  let inStr = false;
  for (let i = from; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i += 1;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return s.length;
}

const isSubUnit = (n) => /_\d+_\d+$/.test(n);

// 顶层符号块的起点：行首（允许缩进）的 `(symbol "名"`，且名不是子单元
const blocks = [];
const re = /^[\t ]*\(symbol "([^"]+)"/gm;
let m;
while ((m = re.exec(text)) !== null) {
  const name = m[1];
  if (isSubUnit(name)) continue;
  const start = m.index;
  const end = matchParen(text, text.indexOf('(', start));
  blocks.push({ id: name, body: text.slice(start, end) });
  re.lastIndex = end;   // 跳过整个块，子单元不再重复计数
}

// ① 括号平衡
let depth = 0;
for (const ch of text) {
  if (ch === '(') depth += 1;
  else if (ch === ')') depth -= 1;
}
if (depth !== 0) problems.push(`括号不平衡：depth=${depth}`);
else oks.push('括号平衡');

// ⑥ 缩进风格守卫（先查，避免后续结论被误导）
const tabIndent = (text.match(/^\t/m) || []).length;
const genMark = text.includes('drvctrl-gen-lib');
if (tabIndent > 0 || !genMark) {
  problems.push(`生成物像是被 kicad-cli 就地改写过（Tab 行 ${tabIndent}，生成器标记 ${genMark ? '在' : '丢失'}）`
    + ' ⇒ 重跑 `node tools/gen-lib.mjs`');
} else {
  oks.push('缩进风格与生成器一致（未被就地改写）');
}

// ② 顶层符号数
if (blocks.length !== COMPONENTS.length) {
  problems.push(`顶层符号数 ${blocks.length} ≠ 元件表 ${COMPONENTS.length}（${blocks.map((b) => b.id).join(', ')}）`);
} else {
  oks.push(`顶层符号数 ${blocks.length} = 元件表条目数`);
}

// ③ 引脚数
const pinCount = (text.match(/\(pin \w+ line \(at /g) || []).length;
const expectPins = COMPONENTS.reduce((a, c) => a + (c.kind === 'lqfp64' ? 64 : (c.pins || []).length), 0);
if (pinCount !== expectPins) problems.push(`引脚数 ${pinCount} ≠ 期望 ${expectPins}`);
else oks.push(`引脚数 ${pinCount} = 期望值`);

// ④ LQFP64 内部脚号 1..64 齐全且唯一
const bare = (id) => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id);
const mcuId = COMPONENTS.find((c) => c.kind === 'lqfp64')?.libId;
const mcuBare = mcuId ? bare(mcuId) : null;
const mcuBlock = blocks.find((b) => b.id === mcuBare);
if (!mcuBlock) {
  problems.push(`未找到 MCU 符号 ${mcuBare}（配置里写作 ${mcuId}）`);
} else {
  const mcuNums = [...mcuBlock.body.matchAll(/\(number "(\d+)"/g)].map((x) => Number(x[1]));
  const want = new Set(LQFP64.map((r) => r[0]));
  const missing = [...want].filter((n) => !mcuNums.includes(n));
  const dupes = mcuNums.filter((v, i) => mcuNums.indexOf(v) !== i);
  if (missing.length) problems.push(`LQFP64 缺脚号 ${missing.join(',')}`);
  if (dupes.length) problems.push(`LQFP64 脚号重复 ${[...new Set(dupes)].join(',')}`);
  if (mcuNums.length !== 64) problems.push(`LQFP64 引脚数 ${mcuNums.length} ≠ 64`);
  if (!missing.length && !dupes.length && mcuNums.length === 64) oks.push('LQFP64 符号内 1..64 脚号齐全且唯一');
}

// ④b 每个顶层符号内部脚号不得重复
for (const b of blocks) {
  const nums = [...b.body.matchAll(/\(number "([^"]+)"/g)].map((x) => x[1]);
  const seen = nums.filter((v, i) => nums.indexOf(v) !== i);
  if (seen.length) problems.push(`${b.id}: 符号内脚号重复 ${[...new Set(seen)].join(',')}`);
}

// ⑤ LCSC 属性行
const lcscProps = (text.match(/\(property "LCSC"/g) || []).length;
if (lcscProps !== COMPONENTS.length) problems.push(`LCSC 属性行 ${lcscProps} ≠ ${COMPONENTS.length}`);
else oks.push('每个符号都有 LCSC 属性行');

console.log(`校验 ${file}`);
for (const o of oks) console.log(`  ✓ ${o}`);
for (const p of problems) console.log(`  ✗ ${p}`);
console.log(problems.length ? '\n✗ 校验失败' : '\n✓ 结构校验通过');
process.exit(problems.length ? 1 : 0);
