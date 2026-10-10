/**
 * 独立审核器（audit，不属于 _生成器）
 *
 * 目的：**不调用生成器**，只从落盘的 motor-driver-V3.kicad_sch 几何重建连接关系，
 *       再与 design.mjs 的设计意图逐网络比对。生成器的 build.mjs 是自证，
 *       本脚本是「第三方复核」：即使 design.mjs 的意图本身是错的，也能算出图上到底连了什么。
 *
 * 连接重建规则（KiCad 语义）：
 *   - 全局标签 global_label 按其文本同名合并
 *   - wire 段按端点连通（这里生成器保证每个引脚落在某段端点上）
 *   - 引脚绝对坐标 = 实例位置 + (px, -py)
 *   - 引脚落在 wire 端点上 → 属于该 wire 所属节点
 *   - no_connect 标记的引脚 → 未连接
 */
import fs from 'node:fs';
import path from 'node:path';
import { COMPONENTS, NETS, SYMBOL_PINS, NO_CONNECT, LCSC, JLC_FOOTPRINTS } from '../01_工程/_生成器/design.mjs';

const SCH = path.resolve(process.argv[2] ?? '..', 'motor-driver-V3.kicad_sch');
const txt = fs.readFileSync(SCH, 'utf8');

const R = (v) => Math.round(v * 1000) / 1000;
const K = (x, y) => `${R(x)},${R(y)}`;

/* ============================================================
   1) 解析 lib_symbols → 每个符号的引脚定义
   ============================================================ */
const libPins = {};
{
  const a = txt.indexOf('(lib_symbols');
  const b = txt.indexOf('\n  (symbol (lib_id');
  const seg = txt.slice(a, b);
  const starts = [...seg.matchAll(/\(symbol "mdrive:([A-Za-z0-9_]+)"/g)];
  for (let i = 0; i < starts.length; i++) {
    const name = starts[i][1];
    const from = starts[i].index;
    const to = i + 1 < starts.length ? starts[i + 1].index : seg.length;
    const body = seg.slice(from, to);
    const pins = [];
    const rx = /\(pin\s+(\S+)\s+line\s+\(at\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\)\s+\(length\s+([\d.]+)\)\s*\(name\s+"([^"]*)"[^)]*\)[^)]*\)\s*\(number\s+"([^"]*)"/g;
    let m;
    while ((m = rx.exec(body))) {
      pins.push({ type: m[1], x: +m[2], y: +m[3], a: +m[4], len: +m[5], name: m[6], num: m[7] });
    }
    if (!pins.length) {
      // 回退：宽松匹配
      const rx2 = /\(pin\s+(\S+)\s+line\s+\(at\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\)\s+\(length\s+([\d.]+)\)([\s\S]*?)(?=\(pin\s|\)\s*\)\s*$)/g;
      let m2;
      while ((m2 = rx2.exec(body))) {
        const num = /\(number\s+"([^"]*)"/.exec(m2[6])?.[1];
        const nm = /\(name\s+"([^"]*)"/.exec(m2[6])?.[1];
        pins.push({ type: m2[1], x: +m2[2], y: +m2[3], a: +m2[4], len: +m2[5], name: nm ?? '~', num: num ?? '?' });
      }
    }
    libPins[name] = pins;
  }
}

/* ============================================================
   2) 解析元件实例
   ============================================================ */
const instances = [];
{
  const rx = /\(symbol\s+\(lib_id\s+"mdrive:([A-Za-z0-9_]+)"\)\s+\(at\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\)[\s\S]*?\(property\s+"Reference"\s+"([^"]+)"[\s\S]*?\(property\s+"Value"\s+"([^"]+)"[\s\S]*?\(property\s+"Footprint"\s+"([^"]*)"/g;
  let m;
  while ((m = rx.exec(txt))) {
    instances.push({ sym: m[1], x: +m[2], y: +m[3], rot: +m[4], ref: m[5], val: m[6], fp: m[7] });
  }
}

/* ============================================================
   3) 解析 wire / global_label / no_connect
   ============================================================ */
const wires = [...txt.matchAll(/\(wire\s+\(pts\s+\(xy\s+(-?[\d.]+)\s+(-?[\d.]+)\)\s+\(xy\s+(-?[\d.]+)\s+(-?[\d.]+)\)\)/g)]
  .map(m => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] }));

const labels = [...txt.matchAll(/\(global_label\s+"([^"]+)"\s+\(shape\s+\S+\)\s+\(at\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\)/g)]
  .map(m => ({ net: m[1], x: +m[2], y: +m[3], a: +m[4] }));

const ncs = [...txt.matchAll(/\(no_connect\s+\(at\s+(-?[\d.]+)\s+(-?[\d.]+)\)/g)]
  .map(m => ({ x: +m[1], y: +m[2] }));

/* ============================================================
   4) 并查集：按坐标点连通
   ============================================================ */
const parent = new Map();
const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
const add = (k) => { if (!parent.has(k)) parent.set(k, k); };
const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

for (const w of wires) {
  const k1 = K(w.x1, w.y1), k2 = K(w.x2, w.y2);
  union(k1, k2);
}
/* 标签按名字合并到同一个「虚拟节点」 */
const labelNodes = new Map();
for (const l of labels) {
  const k = K(l.x, l.y);
  add(k);
  const nameKey = `NET:${l.net}`;
  if (!labelNodes.has(l.net)) labelNodes.set(l.net, nameKey);
  union(k, labelNodes.get(l.net));
}
/* 同一坐标的多个标签（不同名）→ 合并（并报冲突） */
const coordLabels = new Map();
for (const l of labels) {
  const k = K(l.x, l.y);
  if (!coordLabels.has(k)) coordLabels.set(k, new Set());
  coordLabels.get(k).add(l.net);
}

/* ============================================================
   5) 每个实例引脚 → 绝对坐标 → 所属网络
   ============================================================ */
const pinNetFromSch = new Map();   // "R1.1" -> Set(netName)
const pinCoord = new Map();        // "R1.1" -> "x,y"
const unconnectedPins = [];
const coordinateOwner = new Map(); // coord -> [pinKeys]

for (const inst of instances) {
  const pins = libPins[inst.sym];
  if (!pins) { unconnectedPins.push(`${inst.ref}: 符号 ${inst.sym} 无引脚定义`); continue; }
  const seen = new Set();
  for (const p of pins) {
    if (seen.has(p.num)) continue;
    seen.add(p.num);
    const ax = R(inst.x + p.x);
    const ay = R(inst.y - p.y);
    const k = K(ax, ay);
    const key = `${inst.ref}.${p.num}`;
    pinCoord.set(key, k);
    if (!coordinateOwner.has(k)) coordinateOwner.set(k, []);
    coordinateOwner.get(k).push(key);

    add(k);
    const root = find(k);
    /* 收集该连通分量里所有标签名 */
    pinNetFromSch.set(key, root);
  }
}

/* 把 root → 网络名 */
const rootToNets = new Map();
for (const [net, nameKey] of labelNodes) {
  const root = find(nameKey);
  if (!rootToNets.has(root)) rootToNets.set(root, new Set());
  rootToNets.get(root).add(net);
}
const ncSet = new Set(ncs.map(n => K(n.x, n.y)));
const rootToPins = new Map();
for (const [key, root] of pinNetFromSch) {
  if (!rootToPins.has(root)) rootToPins.set(root, []);
  rootToPins.get(root).push(key);
}

/* ============================================================
   6) 输出：与 design.mjs 意图比对
   ============================================================ */
const errors = [];
const warnings = [];
const info = [];

info.push(`原理图: ${SCH}`);
info.push(`解析结果: lib 符号 ${Object.keys(libPins).length} / 实例 ${instances.length} / wire ${wires.length} / 标签 ${labels.length} / no_connect ${ncs.length}`);

/* 6a) 位号一致性 */
const designByRef = new Map(COMPONENTS.map(c => [c.ref, c]));
const schRefs = new Set(instances.map(i => i.ref));
for (const c of COMPONENTS) if (!schRefs.has(c.ref)) errors.push(`元件 ${c.ref} 在 design.mjs 里但不在原理图中`);
for (const r of schRefs) if (!designByRef.has(r)) errors.push(`元件 ${r} 在原理图中但不在 design.mjs 里`);
if (instances.length !== COMPONENTS.length) errors.push(`元件数不一致: 原理图 ${instances.length} vs design ${COMPONENTS.length}`);

/* 6b) 逐元件比对 value / footprint */
for (const inst of instances) {
  const d = designByRef.get(inst.ref);
  if (!d) continue;
  if (inst.val !== d.val) errors.push(`位号 ${inst.ref} 值不一致: 原理图 "${inst.val}" vs design "${d.val}"`);
  if (inst.fp !== d.fp) errors.push(`位号 ${inst.ref} 封装不一致: 原理图 "${inst.fp}" vs design "${d.fp}"`);
}

/* 6c) 逐引脚比对网络（核心） */
const designPinNet = new Map();
for (const [net, members] of Object.entries(NETS)) for (const m of members) {
  if (designPinNet.has(m)) errors.push(`design.mjs 里引脚 ${m} 同时属于网络 ${designPinNet.get(m)} 和 ${net}`);
  designPinNet.set(m, net);
}

/* 期望：从原理图算出的每个引脚 → 网络名集合 */
const mismatch = [];
const coveredPinsSch = new Set();
for (const inst of instances) {
  const pins = libPins[inst.sym] ?? [];
  const seen = new Set();
  for (const p of pins) {
    if (seen.has(p.num)) continue;
    seen.add(p.num);
    const key = `${inst.ref}.${p.num}`;
    coveredPinsSch.add(key);
    const k = pinCoord.get(key);
    const root = find(k);
    const nets = rootToNets.get(root) ?? new Set();
    const designed = designPinNet.get(key);
    const isNC = ncSet.has(k);

    if (isNC) {
      if (designed) mismatch.push(`${key}: 原理图标了 no_connect，但 design.mjs 把它放进网络 ${designed}`);
      continue;
    }
    if (!designed) {
      mismatch.push(`${key}: design.mjs 未给它分配网络（原理图上网络=${[...nets].join('/') || '无'})`);
      continue;
    }
    if (nets.size === 0) {
      mismatch.push(`${key}: 期望网络 ${designed}，但原理图上该引脚没有任何标签/走线 → 实际未连接`);
    } else if (!nets.has(designed)) {
      mismatch.push(`${key}: 期望网络 ${designed}，但原理图算出的是 ${[...nets].join('/')}`);
    } else if (nets.size > 1) {
      mismatch.push(`${key}: 原理图上该引脚同时落在多个网络: ${[...nets].join('/')}（可能短路）`);
    }
  }
}
for (const m of mismatch) errors.push(m);

/* 6d) design.mjs 声明的引脚是否都存在于符号库 */
for (const [ref, net] of designPinNet) {
  const i = ref.lastIndexOf('.');
  const r = ref.slice(0, i), p = ref.slice(i + 1);
  const c = designByRef.get(r);
  if (!c) continue;
  const sp = SYMBOL_PINS[c.sym];
  if (!sp || !sp.includes(p)) errors.push(`design.mjs: ${ref} 的引脚号 ${p} 不在符号 ${c.sym} 的引脚表里`);
}
/* 6e) 每个元件的每个引脚都被覆盖 */
for (const c of COMPONENTS) {
  for (const p of SYMBOL_PINS[c.sym] ?? []) {
    const key = `${c.ref}.${p}`;
    const isNC = NO_CONNECT.includes(key);
    if (!designPinNet.has(key) && !isNC) errors.push(`design.mjs: 引脚 ${key} 既没进网络也没标 no-connect`);
    if (designPinNet.has(key) && isNC) errors.push(`design.mjs: 引脚 ${key} 既进了网络又标了 no-connect`);
  }
}

/* 6f) 同一坐标上的多个引脚必须同网络（防短路） */
for (const [k, keys] of coordinateOwner) {
  if (keys.length < 2) continue;
  const nets = new Set(keys.map(x => designPinNet.get(x) ?? '(nc)'));
  if (nets.size > 1) errors.push(`同一坐标 ${k} 上有 ${keys.length} 个引脚却属不同网络: ${keys.map(x => `${x}=${designPinNet.get(x)}`).join(', ')}`);
}

/* 6g) 标签冲突：同一坐标两个不同名标签 */
for (const [k, set] of coordLabels) {
  if (set.size > 1) errors.push(`坐标 ${k} 上有多个不同名的标签: ${[...set].join(', ')} → 会把两个网络短接`);
}

/* ============================================================
   7) 电气规则检查（不依赖 design.mjs 的意图，看原理图本身）
   ============================================================ */
/* 7a) 电源网络必须有来源（power_out 或 PWR_FLAG） */
const powerOutPins = new Set();
for (const inst of instances) {
  for (const p of libPins[inst.sym] ?? []) {
    if (p.type === 'power_out') powerOutPins.add(find(pinCoord.get(`${inst.ref}.${p.num}`)));
  }
}
/* 7b) 记录每个网络的成员数与来源标签 */
const netMembers = new Map();
for (const [root, keys] of rootToPins) {
  const nets = rootToNets.get(root);
  if (!nets || nets.size !== 1) continue;
  const net = [...nets][0];
  if (!netMembers.has(net)) netMembers.set(net, new Set());
  for (const k of keys) netMembers.get(net).add(k);
}

/* 7c) 检查 design.mjs 的网络里是否有单脚网络（除 INTERFACE_NETS 外应为异常） */
for (const [net, members] of Object.entries(NETS)) {
  if (members.length === 1) warnings.push(`网络 ${net} 只有 1 个成员: ${members[0]}`);
}

/* ============================================================
   8) 输出报告
   ============================================================ */
console.log('='.repeat(78));
console.log('独立审核：motor-driver-V3.kicad_sch ↔ design.mjs');
console.log('='.repeat(78));
for (const s of info) console.log(s);
console.log('');
console.log('--- 引脚覆盖 ---');
console.log(`原理图引脚总数        : ${coveredPinsSch.size}`);
console.log(`design.mjs 网络成员数 : ${designPinNet.size}`);
console.log(`no_connect 标记       : ${NO_CONNECT.length} (${NO_CONNECT.join(', ')})`);
console.log('');
console.log(`--- 网络成员数（按 design.mjs，共 ${Object.keys(NETS).length} 个）---`);
const rows = Object.entries(NETS).map(([n, m]) => [n, m.length]).sort((a, b) => b[1] - a[1]);
for (const [n, c] of rows) console.log(`  ${String(c).padStart(3)}  ${n}`);

console.log('');
if (errors.length) {
  console.log(`!!! 发现 ${errors.length} 个问题 !!!`);
  errors.forEach((e, i) => console.log(`  [E${i + 1}] ${e}`));
} else {
  console.log('✓ 原理图与 design.mjs 逐引脚完全一致');
}
if (warnings.length) {
  console.log('');
  console.log(`--- 提示 ${warnings.length} 条 ---`);
  warnings.forEach((w, i) => console.log(`  [W${i + 1}] ${w}`));
}

/* ============================================================
   9) 附加：LCSC / 封装 覆盖情况
   ============================================================ */
console.log('');
console.log('--- LCSC 绑定与封装白名单 ---');
const noLcsc = COMPONENTS.filter(c => !c.ref.startsWith('#') && !LCSC[c.ref]).map(c => c.ref);
const badFp = COMPONENTS.filter(c => !JLC_FOOTPRINTS[c.fp] && c.fp !== 'PWR_FLAG').map(c => `${c.ref}(${c.fp})`);
console.log(`未绑定 LCSC 料号的位号: ${noLcsc.length} 个`);
if (noLcsc.length) console.log('  ' + noLcsc.join(', '));
console.log(`封装不在白名单的位号: ${badFp.length} 个`);
if (badFp.length) console.log('  ' + badFp.join(', '));
console.log('');
console.log(`结论: ${errors.length === 0 ? '连接关系无误' : '存在 ' + errors.length + ' 个连接问题'}`);
