#!/usr/bin/env node
/**
 * tools/test-guards.mjs
 * 对数据源自检做**注入测试**：故意注入错误，确认闸门真的会拦。
 * 依据仓库纪律：「一条从未失败过的规则等于没有规则」。
 *
 * 用法：node tools/test-guards.mjs
 */
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(HERE, 'lib', 'pins.mjs');
const BACKUP = join(HERE, 'lib', 'pins.mjs.bak');

const original = readFileSync(TARGET, 'utf8');

const CASES = [
  {
    name: '必需信号漏分配（删掉 DRV_EN）',
    from: "[19, 'PA5', 'bidirectional', 'DRV_EN'],",
    to: "[19, 'PA5', 'bidirectional', 'RSV'],",
    expect: /必需信号 DRV_EN/,
  },
  {
    name: '模拟信号分到没有 ADC 的脚（VN -> PB15）',
    from: ["[11, 'PC3', 'bidirectional', 'VN'],", "[37, 'PB15', 'bidirectional', 'RSV'],"],
    to: ["[11, 'PC3', 'bidirectional', 'RSV'],", "[37, 'PB15', 'bidirectional', 'VN'],"],
    expect: /没有 ADC 通道/,
  },
  {
    name: 'PWM 低边分到没有 CHxN 的脚（INLA -> PB10）',
    from: ["[25, 'PB1', 'bidirectional', 'INLA'],", "[30, 'PB10', 'bidirectional', 'LED'],"],
    to: ["[25, 'PB1', 'bidirectional', 'RSV'],", "[30, 'PB10', 'bidirectional', 'INLA'],"],
    expect: /INLA|TIM1_CH/,
  },
  {
    name: '分配标记重复占用（两个脚都叫 VBUS）',
    from: "[9, 'PC1', 'bidirectional', 'VBUS'],",
    to: "[9, 'PC1', 'bidirectional', 'VBUS'],\n  [10, 'PC2', 'bidirectional', 'VBUS'],",
    expect: /分配标记 VBUS/,
  },
  {
    name: '脚号错位（pin 27 与 28 名字对调）',
    from: ["[27, 'VSSA', 'power_in', 'GNDA'],", "[28, 'VREF+', 'power_in', 'VREF_PLUS'],"],
    to: ["[27, 'VREF+', 'power_in', 'GNDA'],", "[28, 'VSSA', 'power_in', 'VREF_PLUS'],"],
    expect: /不符/,
    gate: 'ref',   // ★ 只靠自检拦不住：自检查"自身自洽"，脚号错位是"与官方不符"
  },
];

function runCheck() {
  const r = spawnSync(process.execPath, [join(HERE, 'build.mjs'), 'check'],
    { encoding: 'utf8', cwd: join(HERE, '..') });
  return { out: (r.stdout || '') + (r.stderr || ''), status: r.status };
}

/** ★ 独立权威闸门：与 KiCad 官方符号库逐脚比对（能拦"脚号错位"这类自身自洽的错误） */
function runRef() {
  const r = spawnSync(process.execPath, [join(HERE, 'ref-pinmap.mjs'), '--compare'],
    { encoding: 'utf8', cwd: join(HERE, '..') });
  return { out: (r.stdout || '') + (r.stderr || ''), status: r.status };
}

let failed = 0;
console.log('=== 数据源自检闸门 · 注入测试 ===\n');

// 基线：必须先通过
{
  const b = runCheck();
  if (b.status === 0) console.log('基线：✓ 未注入时自检通过');
  else { console.log('✗ 基线就不通过，先修好再来做注入测试'); process.exit(1); }
}

for (const c of CASES) {
  const froms = Array.isArray(c.from) ? c.from : [c.from];
  const tos = Array.isArray(c.to) ? c.to : [c.to];
  let mutated = original;
  let applied = true;
  for (let i = 0; i < froms.length; i += 1) {
    if (!mutated.includes(froms[i])) { applied = false; break; }
    mutated = mutated.replace(froms[i], tos[i]);
  }
  if (!applied) {
    console.log(`⚠ ${c.name} —— 注入串未命中（测试无效，请更新 from）`);
    failed += 1;
    continue;
  }
  writeFileSync(TARGET, mutated, 'utf8');
  const r = c.gate === 'ref' ? runRef() : runCheck();
  const hit = c.expect.test(r.out);
  const blocked = r.status !== 0;
  if (hit && blocked) {
    console.log(`✓ ${c.name} —— 被拦（闸门 ${c.gate || 'check'}，exit ${r.status}）`);
  } else {
    console.log(`✗ ${c.name} —— **没拦住**（闸门 ${c.gate || 'check'}，exit ${r.status}，匹配 ${hit}）`);
    console.log('  输出片段：' + r.out.split('\n').filter((l) => l.includes('✗')).slice(0, 3).join(' | '));
    failed += 1;
  }
  writeFileSync(TARGET, original, 'utf8');
}

// 还原并确认回到通过状态
writeFileSync(TARGET, original, 'utf8');
const after = runCheck();
console.log(`\n还原：${after.status === 0 ? '✓ 自检恢复通过' : '✗ 还原后仍不通过！'}`);
if (after.status !== 0) failed += 1;

console.log(failed ? `\n✗ ${failed}/${CASES.length} 个注入未被正确拦截` : `\n✓ ${CASES.length}/${CASES.length} 个注入全部被正确拦截`);
process.exit(failed ? 1 : 0);
