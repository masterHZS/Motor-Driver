/**
 * 布线几何体检 CLI
 * 用法：node _生成器\check-wiring.mjs
 */
import { COMPONENTS, NETS, NO_CONNECT, NET_CLASS } from './design.mjs';
import { PLACE } from './layout.mjs';
import { SYMDEFS, pinGroupsOf, bodyBoxes } from './symdefs.mjs';
import { buildRouting } from './router.mjs';
import { blockOf } from './layout.mjs';
import { checkRouting } from './check-routing.mjs';

const pinGroups = {};
for (const c of COMPONENTS) pinGroups[c.ref] = pinGroupsOf(c.ref);

const R = buildRouting({
  NETS, NET_CLASS, NO_CONNECT,
  place: PLACE, pinGroups, blockOf,
});

/* 引脚连接点 → 引脚名 */
const pinAt = new Map();
for (const c of COMPONENTS) {
  for (const g of pinGroups[c.ref]) {
    const k = `${Math.round(g.x * 100)},${Math.round(g.y * 100)}`;
    if (!pinAt.has(k)) pinAt.set(k, []);
    for (const pn of g.pins) pinAt.get(k).push(`${c.ref}.${pn}`);
  }
}

const errs = checkRouting({ wires: R.wires, labels: R.labels, junctions: R.junctions, pinAt, bodies: bodyBoxes() });

const wireNets = [...R.mode].filter(([, m]) => m === 'wire').map(([n]) => n);
const labelNets = [...R.mode].filter(([, m]) => m === 'label').map(([n]) => n);

console.log(`走线网络 ${wireNets.length} 个 / 标签网络 ${labelNets.length} 个`);
console.log(`wire ${R.wires.length} 段 / label ${R.labels.length} 个 / junction ${R.junctions.length} 个`);
console.log('');
console.log('【走线直连的网络】');
console.log('  ' + wireNets.join(' '));
console.log('【保留 global_label 的网络】');
console.log('  ' + labelNets.join(' '));
console.log('');
for (const [n, why] of R.reason) if (R.mode.get(n) === 'label') console.log(`  - ${n.padEnd(12)} ${why}`);

if (errs.length) {
  console.log('');
  console.log(`✗ 布线几何体检失败：${errs.length} 处`);
  for (const e of errs.slice(0, 200)) console.log('  ' + e);
  if (errs.length > 200) console.log(`  …… 其余 ${errs.length - 200} 处略`);
  process.exit(1);
}
console.log('');
console.log('✓ 布线几何体检通过：全部正交 / 端点不落在异网引脚或线段上 / 无共线重叠 / 不穿符号本体');
