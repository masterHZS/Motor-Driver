#!/usr/bin/env node
/**
 * tools/verify-adc-channels.mjs
 * 从 DS12589 Table 12 的抽取产物**独立**复核各引脚的模拟通道，特别是 `PA2` 有没有 ADC2 侧。
 *
 * 动机：R4 文档指出「`PA2` 只有 `ADC1_IN3`」，与原记录的「`PA0/1/2` 都是 ADC12」不符 ——
 *       必须有独立复核手段，不能靠谁的记忆。
 *
 * 数据来源：`审查/g431_table12_af.json`（由 tools/measure/06_g431_table12_af.py 从 DS12589 Table 12 抽取，
 *           raw 字段保留了原文片段供核对）。
 * 用法：在 01_PCB/DRV控制板/ 下运行 `node tools/verify-adc-channels.mjs`
 */
import { readFileSync, existsSync } from 'node:fs';

const j = '审查/g431_table12_af.json';
if (!existsSync(j)) {
  console.error('✗ 找不到 ' + j + '（请在 01_PCB/DRV控制板/ 下运行）');
  process.exit(2);
}
const data = JSON.parse(readFileSync(j, 'utf8'));
const recs = Object.values(data);
console.log(`来源：${j}（共 ${recs.length} 个引脚条目，均含 Table 12 原文片段）\n`);

const WANT = ['PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7',
  'PB0', 'PB1', 'PB2', 'PB11', 'PB12', 'PB14',
  'PC0', 'PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PF0', 'PF1'];

const byName = new Map();
for (const r of recs) byName.set((r.name || '').replace(/-\w+$/, ''), r);

console.log('引脚    Table 12 原文里的模拟通道        ADC1  ADC2   结论');
console.log('-'.repeat(72));
const dual = []; const only1 = []; const only2 = []; const none = [];
for (const name of WANT) {
  const r = byName.get(name);
  if (!r) { console.log(`${name.padEnd(7)} （抽取产物无此条）`); continue; }
  const found = new Set();
  for (const m of (r.raw || '').matchAll(/ADC(?:12|1|2)_IN\d+/g)) found.add(m[0]);
  for (const a of (r.af || [])) if (/^ADC/.test(a)) found.add(a);
  const list = [...found].sort();
  const has1 = list.some((x) => /^ADC1|^ADC12/.test(x));
  const has2 = list.some((x) => /^ADC2|^ADC12/.test(x));
  const verdict = has1 && has2 ? '双（可双 ADC 同步）' : has1 ? '**仅 ADC1**' : has2 ? '仅 ADC2' : '无 ADC';
  console.log(`${name.padEnd(7)} ${list.join(' / ').padEnd(31)} ${(has1 ? '✓' : '—').padEnd(5)} ${(has2 ? '✓' : '—').padEnd(6)} ${verdict}`);
  if (has1 && has2) dual.push(name); else if (has1) only1.push(name); else if (has2) only2.push(name); else none.push(name);
}
console.log('-'.repeat(72));
console.log(`双通道（可双 ADC 同步）：**${dual.join(' ') || '（无）'}**`);
console.log(`仅 ADC1：${only1.join(' ') || '（无）'}`);
console.log(`仅 ADC2：${only2.join(' ') || '（无）'}`);
console.log(`无 ADC：${none.join(' ') || '（无）'}`);

console.log('\n=== 关键判定 ===');
for (const [pin, claim] of [['PA2', '只有 ADC1_IN3'], ['PC3', 'ADC12_IN9（双）'], ['PB0', '只有 ADC1_IN15']]) {
  const r = byName.get(pin);
  if (!r) { console.log(`${pin}: 抽取产物无此条，无法判定`); continue; }
  const raw = r.raw || '';
  const has2 = /ADC2_IN\d/.test(raw) || /ADC12_IN\d/.test(raw);
  console.log(`${pin}：${raw.slice(0, 110)}`);
  console.log(`   ⇒ 含 ADC2 侧？${has2 ? '是' : '否'}；文档称「${claim}」⇒ ${(has2 === /双/.test(claim) || (!has2 && /只有/.test(claim))) ? '一致 ✓' : '需人工确认'}\n`);
}

// 与 pins.mjs 的一致性检查
const { ADC_CHANNELS, DUAL_ADC_PINS } = await import('./lib/pins.mjs');
console.log('=== 与 tools/lib/pins.mjs 的一致性 ===');
let bad = 0;
for (const name of WANT) {
  const r = byName.get(name);
  if (!r) continue;
  const raw = r.raw || '';
  const has1 = /ADC1_IN\d|ADC12_IN\d/.test(raw);
  const has2 = /ADC2_IN\d|ADC12_IN\d/.test(raw);
  const mine = ADC_CHANNELS[name] || [];
  const myHas1 = mine.some((x) => /^ADC1|^ADC12/.test(x));
  const myHas2 = mine.some((x) => /^ADC2|^ADC12/.test(x));
  if (has1 !== myHas1 || has2 !== myHas2) {
    console.log(`✗ ${name}: 原文 (ADC1=${has1}, ADC2=${has2}) vs pins.mjs (ADC1=${myHas1}, ADC2=${myHas2})`);
    bad += 1;
  }
}
console.log(bad ? `\n✗ ${bad} 个引脚的通道记录与原文不符 —— 需修 pins.mjs` : '\n✓ 全部一致');
process.exit(bad ? 1 : 0);
