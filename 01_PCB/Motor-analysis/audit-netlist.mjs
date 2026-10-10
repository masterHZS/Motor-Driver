/**
 * 用 KiCad 官方导出的网表（03_审核/kicad_netlist_V3.0.net，Eeschema 10.0.6 生成）
 * 交叉验证 design.mjs 的设计意图。
 *
 * 这是**真正的外部证据**：该文件由 KiCad 自己从 .kicad_sch 解析导出，
 * 不是本项目的生成器产物，因此能独立发现「原理图实际连了什么」与「设计想连什么」的差异。
 */
import fs from 'node:fs';
import path from 'node:path';
import { NETS, NO_CONNECT } from '../01_工程/_生成器/design.mjs';

/* 参数可以是网表文件本身，也可以是目录（目录下取 kicad_netlist_V3.0.net） */
const arg = process.argv[2] ?? '.';
const NET = arg.toLowerCase().endsWith('.net')
  ? path.resolve(arg)
  : path.resolve(arg, 'kicad_netlist_V3.0.net');
const lines = fs.readFileSync(NET, 'utf8').split(/\r?\n/);

/* ---- 解析 nets 段 ---- */
const nets = new Map();   // name -> Set("REF.PIN")
{
  let i = lines.findIndex(l => /^\s*\(nets\s*$/.test(l));
  if (i < 0) throw new Error('未找到 (nets 段');
  i++;
  let cur = null;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '(net') { cur = { name: null, nodes: new Set() }; continue; }
    if (!cur) continue;
    if (t === ')') {
      // 一个 net 结束 —— 但 node 也用 ')'，所以靠 cur.name 是否已设置 + 后续判断
      // 简化：用缩进深度法，见下
    }
    const mName = /^\(name\s+"([^"]*)"\)$/.exec(t);
    if (mName && !cur.name) { cur.name = mName[1]; continue; }
    const mRef = /^\(ref\s+"([^"]*)"\)$/.exec(t);
    if (mRef) { cur.ref = mRef[1]; continue; }
    const mPin = /^\(pin\s+"([^"]*)"\)$/.exec(t);
    if (mPin) {
      if (cur.ref) cur.nodes.add(`${cur.ref}.${mPin[1]}`);
      cur.pin = mPin[1];
      continue;
    }
    // net 结束：遇到顶层的 "(net" 或 "(nets" 结束
    if (t === ')' && cur.name && cur.nodes.size >= 0 && lines[i + 1] && /^\s*\(net\s*$/.test(lines[i + 1])) {
      if (!nets.has(cur.name)) nets.set(cur.name, new Set());
      for (const n of cur.nodes) nets.get(cur.name).add(n);
      cur = null;
      continue;
    }
  }
  if (cur && cur.name) {
    if (!nets.has(cur.name)) nets.set(cur.name, new Set());
    for (const n of cur.nodes) nets.get(cur.name).add(n);
  }
}

/* ---- 反向索引 ---- */
const kicadPinNet = new Map();
for (const [net, nodes] of nets) for (const n of nodes) {
  if (kicadPinNet.has(n)) console.log(`  ! 引脚 ${n} 在 KiCad 网表里同时属于 ${kicadPinNet.get(n)} 和 ${net}`);
  kicadPinNet.set(n, net);
}

/* ---- 比对 ---- */
const errors = [];
const known = [];   // 已知的 KiCad 导出行为差异（非设计缺陷）
console.log('='.repeat(78));
console.log('交叉验证：KiCad 官方网表 ↔ design.mjs');
console.log('='.repeat(78));
console.log(`KiCad 网表: ${NET}`);
console.log(`KiCad 网络数: ${nets.size}   design.mjs 网络数: ${Object.keys(NETS).length}`);
console.log('');

/* 已知良性差异，不计为错误：
 *  ① 虚拟元件 PWR_FLAG（#FLG*）是 ERC 标记，KiCad 不把它导出到网表连接里；
 *  ② 标了 no_connect 的引脚，KiCad 会生成 unconnected-(U5-Pxx-PadNN) 这种自动命名的单脚网络。 */
const isPwrFlag = (m) => /^#FLG\d+\./.test(m);
const isUnconnectedAuto = (n) => /^unconnected-\(/.test(n);

/* 网络名集合 */
const kNames = new Set(nets.keys());
const dNames = new Set(Object.keys(NETS));
for (const n of dNames) if (!kNames.has(n)) errors.push(`design.mjs 有网络 ${n}，但 KiCad 网表里没有`);
for (const n of kNames) {
  if (dNames.has(n)) continue;
  if (isUnconnectedAuto(n)) { known.push(`KiCad 自动生成的未连接网络 ${n}（对应 no-connect 引脚）`); continue; }
  errors.push(`KiCad 网表有网络 ${n}，但 design.mjs 里没有`);
}

/* 逐网络逐引脚 */
let compared = 0;
for (const [net, members] of Object.entries(NETS)) {
  const k = nets.get(net);
  if (!k) continue;
  const d = new Set(members);
  for (const m of d) {
    if (isPwrFlag(m)) { known.push(`虚拟元件 ${m} 不属于网表网络 ${net}（KiCad 不导出 PWR_FLAG 连接）`); continue; }
    compared++;
    if (!k.has(m)) errors.push(`网络 ${net}: design 期望含 ${m}，但 KiCad 网表里 ${m} 不属于该网络${kicadPinNet.has(m) ? `（实际在 ${kicadPinNet.get(m)}）` : '（未连接）'}`);
  }
  for (const m of k) {
    if (isPwrFlag(m)) continue;
    if (!d.has(m)) errors.push(`网络 ${net}: KiCad 网表含 ${m}，但 design.mjs 里没有它`);
  }
}

/* no-connect 引脚不应出现在任何**真实**网络里（KiCad 自动命名的 unconnected-* 不算） */
for (const nc of NO_CONNECT) {
  const n = kicadPinNet.get(nc);
  if (n && !isUnconnectedAuto(n)) errors.push(`no-connect 引脚 ${nc} 却出现在 KiCad 网络 ${n} 里`);
}

console.log(`逐引脚比对: ${compared} 个 design 引脚成员`);
if (known.length) {
  console.log('');
  console.log(`--- 已归属为「KiCad 导出行为差异」（非缺陷），共 ${known.length} 条 ---`);
  known.forEach(k => console.log(`  · ${k}`));
}
console.log('');
if (errors.length) {
  console.log(`!!! ${errors.length} 处不一致 !!!`);
  errors.slice(0, 60).forEach((e, i) => console.log(`  [${i + 1}] ${e}`));
} else {
  console.log('✓ KiCad 官方网表与 design.mjs 完全一致 —— 原理图的真实连接 = 设计意图');
}
console.log('');
console.log('--- KiCad 网表各网络成员数 ---');
[...nets.entries()].map(([n, s]) => [n, s.size]).sort((a, b) => b[1] - a[1])
  .forEach(([n, c]) => console.log(`  ${String(c).padStart(3)}  ${n}`));
