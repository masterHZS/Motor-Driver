/**
 * 走线体检（只读，不改任何文件）
 * 用途：确认「走线直连」的网络几何是否正确 —— 端点是否落在引脚上、标签是否朝远离芯片一侧。
 * 用法：node _生成器\check-wires.mjs
 */
import fs from 'node:fs';

const f = 'motor-driver-V3.kicad_sch';
const txt = fs.readFileSync(f, 'utf8');

/* 引脚绝对坐标 */
const comps = [...txt.matchAll(/\(symbol \(lib_id "mdrive:(\w+)"\) \(at ([\d.-]+) ([\d.-]+) 0\)([\s\S]*?)\n  \)/g)];
console.log(`解析到元件实例: ${comps.length}`);

const wires = [...txt.matchAll(/\(wire \(pts \(xy (-?[\d.]+) (-?[\d.]+)\) \(xy (-?[\d.]+) (-?[\d.]+)\)\)/g)]
  .map(m => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] }));
const labels = [...txt.matchAll(/\(global_label "([^"]+)" \(shape passive\) \(at (-?[\d.]+) (-?[\d.]+) (\d+)\)/g)]
  .map(m => ({ net: m[1], x: +m[2], y: +m[3], a: +m[4] }));

/* 单根长走线（>10mm）视为"直连走线"，它替代了原来的一堆 5.08mm 短线 */
const long = wires.filter(w => Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1) > 10);
console.log(`\n走线总数 ${wires.length}，其中长走线(>10mm，即直连走线) ${long.length} 根：\n`);

/* 标签端点集合，用于判断某根长走线的哪一端挂了标签 */
const labelAt = new Set(labels.map(l => `${Math.round(l.x * 100)},${Math.round(l.y * 100)}`));
const k = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;

for (const w of long) {
  const aLab = labelAt.has(k(w.x1, w.y1)), bLab = labelAt.has(k(w.x2, w.y2));
  const len = Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1);
  const dir = w.y1 === w.y2 ? '水平' : '垂直';
  console.log(`  ${dir}  (${w.x1},${w.y1}) -> (${w.x2},${w.y2})  长${len.toFixed(2)}mm  标签: A端=${aLab ? '有' : '无'} B端=${bLab ? '有' : '无'}`);
}

/* 命名标签（挂在长走线端点上的那些） */
const namedOnLong = labels.filter(l => long.some(w => k(w.x1, w.y1) === k(l.x, l.y) || k(w.x2, w.y2) === k(l.x, l.y)));
console.log(`\n挂在直连走线上的命名标签 (${namedOnLong.length}):`);
for (const l of namedOnLong) console.log(`  ${l.net.padEnd(12)} @(${l.x}, ${l.y})  朝向 ${l.a}`);
