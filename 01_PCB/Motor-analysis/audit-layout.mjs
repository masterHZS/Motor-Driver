/**
 * 版面重叠体检：用三个生成器共用的 PLACE / SYMDEFS 几何，检测
 *   ① 功能块矩形两两相交
 *   ② 元件包围盒两两相交（排除同块内本就该相邻的串联小元件？——这里全部报出，人工判断）
 *   ③ 标签（global_label）落点是否落在别的元件包围盒内
 * 只做**报告**，不改设计。
 */
import { COMPONENTS, NETS, SYMBOL_PINS } from '../01_工程/_生成器/design.mjs';
import { BLOCKS, PLACE, PAPER } from '../01_工程/_生成器/layout.mjs';

/* 与 kicad.mjs 保持一致的符号几何（仅取包围盒所需的引脚/图形范围） */
const SYM_BOX = {
  R: [-1.016, -2.54, 1.016, 2.54], RSHUNT: [-1.27, -2.54, 1.27, 2.54],
  FUSE: [-1.016, -2.54, 1.016, 2.54], C: [-1.524, -0.508, 1.524, 0.508],
  CP: [-1.778, -0.508, 1.778, 1.524], L: [-1.27, -2.54, 1.27, 2.54],
  D: [-1.27, -1.27, 1.27, 1.27], DSCH: [-1.27, -1.27, 1.27, 1.905],
  DTVS: [-1.651, -1.27, 1.651, 1.905],
  NMOS: [-6.35, -7.62, 5.08, 7.62],
  FD6288T: [-12.7, -16.51, 12.7, 16.51],
  XL7005A: [-10.16, -7.62, 10.16, 7.62],
  LDO: [-7.62, -5.08, 7.62, 5.08],
  INA181: [-8.89, -8.89, 8.89, 8.89],
  TP: [-0.762, -1.016, 0.762, 1.016],
  PWRFLAG: [-1.524, -1.27, 1.524, 5.588],
  MCU: [-15.24, -13.97, 15.24, 13.97],
};
const BOX = (ref) => {
  const c = COMPONENTS.find(x => x.ref === ref);
  const [x1, y1, x2, y2] = SYM_BOX[c.sym];
  const p = PLACE[ref];
  return { ref, x1: p.x + x1, y1: p.y - y2, x2: p.x + x2, y2: p.y - y1 };
};
const hit = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

console.log('='.repeat(72));
console.log('版面重叠体检');
console.log('='.repeat(72));

/* ① 功能块相交 */
console.log('\n【① 功能块矩形两两相交】（空块 w=0/h=0 跳过）');
let n1 = 0;
const real = BLOCKS.filter(b => b.w > 0 && b.h > 0);
for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) {
  const a = real[i], b = real[j];
  if (hit({ x1: a.x, y1: a.y, x2: a.x + a.w, y2: a.y + a.h },
          { x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y + b.h })) {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    console.log(`  ✗ ${a.id}(${a.title.slice(0, 14)}) × ${b.id}(${b.title.slice(0, 14)})  重叠 ${ox.toFixed(1)}×${oy.toFixed(1)} mm`);
    n1++;
  }
}
if (!n1) console.log('  ✓ 无相交');

/* ② 元件包围盒相交 */
console.log('\n【② 元件包围盒两两相交】');
const boxes = COMPONENTS.map(c => BOX(c.ref));
const n2list = [];
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  if (hit(boxes[i], boxes[j])) n2list.push([boxes[i].ref, boxes[j].ref]);
}
if (!n2list.length) console.log('  ✓ 无相交');
else {
  console.log(`  发现 ${n2list.length} 对：`);
  for (const [a, b] of n2list) console.log(`  ✗ ${a} × ${b}`);
}

/* ③ 元件是否越出所属功能块 */
console.log('\n【③ 元件越出所属功能块边界】');
const blockOf = new Map();
for (const b of BLOCKS) for (const r of (b.members ?? Object.keys(b.explicit ?? {}))) blockOf.set(r, b);
let n3 = 0;
for (const c of COMPONENTS) {
  const b = blockOf.get(c.ref);
  if (!b || b.w === 0) continue;
  const k = BOX(c.ref);
  if (k.x1 < b.x - 0.5 || k.x2 > b.x + b.w + 0.5 || k.y1 < b.y - 0.5 || k.y2 > b.y + b.h + 0.5) {
    console.log(`  ✗ ${c.ref} 越界: 元件[${k.x1.toFixed(1)},${k.y1.toFixed(1)}]-[${k.x2.toFixed(1)},${k.y2.toFixed(1)}]  块[${b.x},${b.y}]-[${b.x + b.w},${b.y + b.h}]`);
    n3++;
  }
}
if (!n3) console.log('  ✓ 全部在块内');

/* ④ 元件越出图幅 */
console.log('\n【④ 元件越出图幅】');
let n4 = 0;
for (const c of COMPONENTS) {
  const k = BOX(c.ref);
  if (k.x1 < 0 || k.y1 < 0 || k.x2 > PAPER.w || k.y2 > PAPER.h) {
    console.log(`  ✗ ${c.ref} 越界 [${k.x1.toFixed(1)},${k.y1.toFixed(1)}]-[${k.x2.toFixed(1)},${k.y2.toFixed(1)}]（图幅 ${PAPER.w}×${PAPER.h}）`);
    n4++;
  }
}
if (!n4) console.log('  ✓ 全部在图幅内');

console.log(`\n合计：块相交 ${n1} / 元件相交 ${n2list.length} / 越块 ${n3} / 越幅 ${n4}`);
