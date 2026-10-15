#!/usr/bin/env node
/** 抽查生成的 MCU 符号里 脚号↔引脚名 是否与数据源一致（防生成器写错）。 */
import { readFileSync } from 'node:fs';
import { LQFP64 } from './lib/pins.mjs';

const t = readFileSync(new URL('./build/drvctrl.kicad_sym', import.meta.url), 'utf8');
const start = t.indexOf('(symbol "STM32G431RBT6"');
let end = t.length;
// 括号配平取块
let d = 0; let inStr = false;
for (let i = t.indexOf('(', start); i < t.length; i += 1) {
  const c = t[i];
  if (inStr) { if (c === '\\') i += 1; else if (c === '"') inStr = false; continue; }
  if (c === '"') inStr = true;
  else if (c === '(') d += 1;
  else if (c === ')') { d -= 1; if (d === 0) { end = i + 1; break; } }
}
const body = t.slice(start, end);

const pairs = [];
const re = /\(pin\s+\S+\s+\S+\s*\(at[^)]*\)\s*\(length[^)]*\)\s*\(name\s+"([^"]*)"[\s\S]*?\(number\s+"(\d+)"/g;
let m;
while ((m = re.exec(body)) !== null) pairs.push([Number(m[2]), m[1]]);

const map = new Map(pairs);
const want = new Map(LQFP64.map(([n, nm, , assign]) => {
  const shown = (assign && assign !== 'NC' && assign !== 'RSV') ? assign : nm;
  return [n, shown];
}));

let bad = 0;
for (let n = 1; n <= 64; n += 1) {
  const got = map.get(n);
  const exp = want.get(n);
  if (got !== exp) { bad += 1; console.log(`✗ 脚 ${n}: 符号里是 ${got}，数据源期望 ${exp}`); }
}
console.log(bad ? `\n✗ ${bad}/64 个脚号在符号里与数据源不一致` : '✓ 符号内 64 个脚号↔引脚名 与数据源完全一致');
process.exit(bad ? 1 : 0);
