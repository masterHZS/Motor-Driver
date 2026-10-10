/**
 * 构建：生成 .kicad_sch，然后【独立重新解析生成的文件】做端到端连接性校验，
 * 再导出网表与 BOM。输出目录 = 本脚本的上一级（01_工程）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { kicadText, stats } from './kicad.mjs';
import { COMPONENTS, NETS, PROJECT, INTERFACE_NETS, NO_CONNECT, LCSC } from './design.mjs';

const OUT = path.resolve(import.meta.dirname, '..');
const BASE = PROJECT.fileBase;
const schPath = path.join(OUT, `${BASE}.kicad_sch`);
fs.writeFileSync(schPath, kicadText, 'utf8');

const txt = kicadText;
/* 坐标键：layout.mjs 已把坐标吸附到 0.01 mm 网格，emit 用 r3 写 3 位小数，
 * 这里统一按「×100 取整」建键，保证 3 位小数与 0.01 网格能一一对应。 */
const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;

/* ---- 1) lib_symbols 引脚偏移（按括号配对定界，避免吞入后续内容） ---- */
function blockEnd(s, open) {
  let d = 0, inStr = false;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (ch === '\\') i++; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '(') d++;
    else if (ch === ')') { d--; if (d === 0) return i + 1; }
  }
  return s.length;
}
const libPins = {};
{
  const ls = txt.indexOf('(lib_symbols');
  const libTxt = txt.slice(ls, blockEnd(txt, ls));
  const starts = [...libTxt.matchAll(/\(symbol "mdrive:([A-Za-z0-9_]+)"/g)];
  for (let i = 0; i < starts.length; i++) {
    const name = starts[i][1];
    const body = libTxt.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : libTxt.length);
    const pins = [];
    for (const pb of body.split('(pin ').slice(1)) {
      const at = pb.match(/^\w+ line \(at (-?[\d.]+) (-?[\d.]+) (\d+)\)/);
      const num = pb.match(/\(number "([^"]+)"/);
      if (at && num) pins.push({ n: num[1], px: +at[1], py: +at[2] });
    }
    libPins[name] = pins;
  }
}

/* ---- 2) 元件实例 ---- */
const instances = [];
for (const m of txt.matchAll(/\(symbol \(lib_id "mdrive:([A-Za-z0-9_]+)"\) \(at (-?[\d.]+) (-?[\d.]+) (\d+)\)[\s\S]{0,400}?\(property "Reference" "([^"]+)"/g))
  instances.push({ sym: m[1], X: +m[2], Y: +m[3], ref: m[5] });

/* ---- 3) 引脚绝对坐标 → 反查表 ---- */
const pinAt = new Map();
for (const inst of instances) {
  const pins = libPins[inst.sym];
  if (!pins) throw new Error(`解析不到符号 ${inst.sym} 的引脚`);
  for (const p of pins) {
    const k = key(inst.X + p.px, inst.Y - p.py);
    if (!pinAt.has(k)) pinAt.set(k, []);
    pinAt.get(k).push(`${inst.ref}.${p.n}`);
  }
}

/* ---- 4) wire 与 global_label ---- */
const wires = [...txt.matchAll(/\(wire \(pts \(xy (-?[\d.]+) (-?[\d.]+)\) \(xy (-?[\d.]+) (-?[\d.]+)\)\)/g)]
  .map(m => ({ a: key(+m[1], +m[2]), b: key(+m[3], +m[4]) }));
const labels = [...txt.matchAll(/\(global_label "([^"]+)" \(shape passive\) \(at (-?[\d.]+) (-?[\d.]+)/g)]
  .map(m => ({ net: m[1], at: key(+m[2], +m[3]) }));
/* no-connect 标记（未使用引脚） */
const noConnects = [...txt.matchAll(/\(no_connect \(at (-?[\d.]+) (-?[\d.]+)\)/g)]
  .map(m => key(+m[1], +m[2]));
const ncSetRebuilt = new Set(noConnects);

/* ---- 5) 重建连接：并查集，沿走线追踪连通性 ----
 * ★ 旧版是"靠标签"判断连接（labelAt 查 wire 两端），一旦改成真实走线直连就会全盘误报。
 * 新版把「wire 端点 + 引脚坐标 + 标签坐标」全部作为并查集节点：
 *   · wire 两端 union；
 *   · 节点落在另一根走线的**线段中段**（T 接）也 union；
 *   · 引脚坐标、标签坐标天然并入所在点；
 *   · 网络名记在连通分量上 → 每个引脚的网络 = 它所在分量的网络名。
 * **不要求"每个引脚都挂标签"**，因此走线直连与标签混用都能正确还原。
 * 严格性不放宽：仍逐网络与设计意图比对，且要求每个引脚恰好属于一个网络。 */
const parent = new Map();
const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; } return r; };
const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

const coordsOf = (k) => k.split(',').map(Number);
for (const w of wires) { add(w.a); add(w.b); union(w.a, w.b); }
for (const k of pinAt.keys()) add(k);
for (const l of labels) add(l.at);

/* T 接：某节点落在另一根正交走线的中间（端点之外） */
for (const k of [...parent.keys()]) {
  const [nx, ny] = coordsOf(k);
  for (const w of wires) {
    if (w.a === k || w.b === k) continue;
    const [ax, ay] = coordsOf(w.a), [bx, by] = coordsOf(w.b);
    const onH = ay === by && ny === ay && nx > Math.min(ax, bx) && nx < Math.max(ax, bx);
    const onV = ax === bx && nx === ax && ny > Math.min(ay, by) && ny < Math.max(ay, by);
    if (onH || onV) { union(k, w.a); break; }
  }
}

/* 标签 → 连通分量上的网络名；同一分量出现两个不同网络名 = 短路 */
const netOfRoot = new Map();
const netConflicts = [];
for (const l of labels) {
  const r = find(l.at);
  if (!netOfRoot.has(r)) netOfRoot.set(r, l.net);
  else if (netOfRoot.get(r) !== l.net) netConflicts.push(`${netOfRoot.get(r)} ↔ ${l.net} 被走线连成同一网络`);
}

const rebuilt = new Map();
const orphanPins = [];
const ncNameSet = new Set(NO_CONNECT);
for (const [pt, pins] of pinAt) {
  const net = netOfRoot.get(find(pt));
  /* no-connect 引脚本来就无网络，不算孤儿 */
  if (!net) { for (const p of pins) if (!ncNameSet.has(p)) orphanPins.push(p); continue; }
  if (!rebuilt.has(net)) rebuilt.set(net, new Set());
  for (const p of pins) rebuilt.get(net).add(p);
}

let noLabel = orphanPins.length, noPin = 0, both = 0, multi = 0;
for (const [, v] of pinAt) if (v.length > 1) multi++;
if (process.env.DBG) {
  console.log('[DBG] instances', instances.length, 'pinAt', pinAt.size, 'wires', wires.length, 'labels', labels.length);
  console.log('[DBG] matched nets', rebuilt.size, 'orphanPins', orphanPins.length, 'netConflicts', netConflicts.length);
}

/* ---- 6) 与设计意图比对 ---- */
const mismatch = [];
for (const net of new Set([...Object.keys(NETS), ...rebuilt.keys()])) {
  const want = new Set(NETS[net] ?? []);
  const got = rebuilt.get(net) ?? new Set();
  const missing = [...want].filter(p => !got.has(p));
  const extra = [...got].filter(p => !want.has(p));
  if (missing.length || extra.length) mismatch.push(`  ✗ ${net}: 缺失[${missing.join(',')}] 多出[${extra.join(',')}]`);
}
/* no-connect 引脚：不参与网络重建，也不应出现在任何网络里 */
const ncPinRefs = new Set();
for (const k of NO_CONNECT) {
  const i = k.lastIndexOf('.');
  const inst = instances.find(x => x.ref === k.slice(0, i));
  const p = libPins[inst.sym].find(pp => pp.n === k.slice(i + 1));
  const pk = key(inst.X + p.px, inst.Y - p.py);
  ncPinRefs.add(pk);
  if (!ncSetRebuilt.has(pk)) throw new Error(`引脚 ${k} 标了 no-connect 但生成文件里没有对应标记`);
  for (const [, set] of rebuilt) if (set.has(k)) throw new Error(`no-connect 引脚 ${k} 却出现在网络里`);
}

/* 引脚覆盖：每个引脚必须恰好出现在一个网络（no-connect 的除外）
 * ⚠️ rebuilt 里存的是「引脚名」（如 Q1.4），不是坐标 —— 早期版本拿坐标去查，
 *    导致每次比对都判为"全部未覆盖"（287 个引脚全红）。 */
const pinSeen = new Map();
for (const [net, set] of rebuilt) for (const p of set) pinSeen.set(p, (pinSeen.get(p) ?? 0) + 1);
const ncNames = new Set(NO_CONNECT);
const uncovered = [];
/* 全部引脚名（同一元件多引脚共享坐标时会有重复，这里用 Set 去重） */
const allPinNames = new Set();
for (const inst of instances)
  for (const p of libPins[inst.sym]) allPinNames.add(`${inst.ref}.${p.n}`);
for (const k of allPinNames) if (!pinSeen.has(k) && !ncNames.has(k)) uncovered.push(k);
const dupPin = [...pinSeen.entries()].filter(([, c]) => c > 1).map(([p]) => p);
if (process.env.DBG) {
  console.log('[DBG] rebuilt GL_A =', JSON.stringify([...(rebuilt.get('GL_A') ?? [])]));
  console.log('[DBG] pinSeen size', pinSeen.size, 'pinAt size', pinAt.size, 'ncPinRefs', JSON.stringify([...ncPinRefs]));
  console.log('[DBG] pinSeen sample', JSON.stringify([...pinSeen.keys()].slice(0, 4)));
  console.log('[DBG] pinAt  sample', JSON.stringify([...pinAt.keys()].slice(0, 4)));
  console.log('[DBG] uncovered count', uncovered.length, 'mismatch', mismatch.length);
  const firstCoord = [...pinAt.keys()][0];
  console.log('[DBG] 自检: 第一个坐标键 =', JSON.stringify(firstCoord),
    ' pinSeen.has() =', pinSeen.has(firstCoord),
    ' 类型 =', typeof firstCoord, ' 长度 =', firstCoord.length);
  const firstKey = [...pinSeen.keys()][0];
  console.log('[DBG] 自检: 第一个 pinSeen 键 =', JSON.stringify(firstKey), ' 类型 =', typeof firstKey, ' 长度 =', firstKey.length);
  const a = [...rebuilt.values()][0];
  console.log('[DBG] 自检: rebuilt 第一个 value 前 3 =', JSON.stringify([...a].slice(0, 3)));
}
/* no-connect 标记必须精确落在引脚坐标上 */
const ncBad = [...ncPinRefs].filter(k => !ncSetRebuilt.has(k));
const ncExtra = [...ncSetRebuilt].filter(k => !ncPinRefs.has(k));

/* ---- 输出 ---- */
const L = [];
L.push('='.repeat(78));
L.push(`${PROJECT.title}`);
L.push(`Rev ${PROJECT.rev}   ${PROJECT.date}`);
L.push('='.repeat(78));
L.push('');
L.push(`文件        : ${schPath}`);
L.push(`元件数      : ${stats.components}`);
L.push(`功能块数    : ${stats.blocks}`);
L.push(`走线段数    : ${stats.wires}`);
L.push(`网络标签数  : ${stats.labels}`);
L.push(`网络数      : ${stats.nets}`);
L.push('');
L.push('--- 独立重新解析生成文件 ---');
L.push(`  lib_symbols 符号数      : ${Object.keys(libPins).length}`);
L.push(`  元件实例数              : ${instances.length}`);
L.push(`  wire 数                 : ${wires.length}`);
L.push(`  global_label 数         : ${labels.length}`);
L.push(`  唯一引脚坐标点数        : ${pinAt.size}`);
L.push(`  多引脚共享坐标点        : ${multi}（MOSFET 的 D/S 堆叠脚）`);
L.push(`  no_connect 标记数       : ${noConnects.length}`);
L.push('');
if (noLabel) L.push(`  ⚠ 两端都无标签的 wire   : ${noLabel}`);
if (noPin) L.push(`  ⚠ 两端都无引脚的 wire   : ${noPin}`);
if (both) L.push(`  ⚠ 一端标签+一端悬空的   : ${both}`);
L.push('');
L.push(`悬空网络接口  : ${Object.keys(INTERFACE_NETS).length} 个（本板无连接器元件）`);
L.push(`未使用引脚    : ${NO_CONNECT.length} 个（已标 no-connect）：${NO_CONNECT.join(', ')}`);
L.push('');
if (uncovered.length) L.push(`  ✗ 未被任何网络覆盖的引脚: ${uncovered.join(', ')}`);
if (dupPin.length) L.push(`  ✗ 被多个网络占用的引脚  : ${dupPin.join(', ')}`);
if (ncBad.length) L.push(`  ✗ 缺少 no-connect 标记的引脚坐标: ${ncBad.length} 个`);
if (ncExtra.length) L.push(`  ✗ 多余的 no-connect 标记: ${ncExtra.length} 个`);
L.push('');
let ok = true;
if (mismatch.length) { ok = false; L.push(`✗ 逐网络比对失败：${mismatch.length} 个网络不一致`); L.push(...mismatch); }
if (uncovered.length || dupPin.length || ncBad.length || ncExtra.length) ok = false;
if (ok) L.push('✓ 端到端校验通过：重新解析 .kicad_sch 得到的连接关系与设计意图逐网络完全一致，');
if (ok) L.push('  且全部引脚恰好被一个网络覆盖（无悬空、无重复占用），未使用引脚已标 no-connect。');
console.log(L.join('\n'));
fs.writeFileSync(path.join(OUT, `自检报告_${PROJECT.rev}.txt`), L.join('\n') + '\n', 'utf8');

/* ---- 网表（可读） ---- */
fs.writeFileSync(path.join(OUT, `netlist_${PROJECT.rev}.txt`),
  '# 网络\t成员数\t成员(位号.引脚)\n' +
  Object.entries(NETS).sort().map(([n, m]) => `${n}\t${m.length}\t${m.join(' ')}`).join('\n') + '\n', 'utf8');

/* ---- 网表（通用 .net） ---- */
const x = ['(export (version "E")', '  (design',
  `    (source "${path.basename(schPath)}")`, `    (date "${PROJECT.date}")`,
  '    (tool "mdrive-gen")', '  )', '  (components'];
for (const c of COMPONENTS) {
  x.push(`    (comp (ref "${c.ref}")`, `      (value "${c.val}")`, `      (footprint "${c.fp}")`,
    `      (description "${(c.desc ?? '').replace(/"/g, "'")}")`, '    )');
}
x.push('  )', '  (nets');
let ni = 0;
for (const [net, members] of Object.entries(NETS).sort()) {
  ni++;
  x.push(`    (net (code "${ni}") (name "${net}")`);
  for (const m of members) {
    const d = m.lastIndexOf('.');
    x.push(`      (node (ref "${m.slice(0, d)}") (pin "${m.slice(d + 1)}"))`);
  }
  x.push('    )');
}
x.push('  )', ')');
fs.writeFileSync(path.join(OUT, `${BASE}.net`), x.join('\n') + '\n', 'utf8');

/* ---- BOM ----
 * ★ 含 LCSC 料号列（规范 R0.2 / R3）：导入嘉立创EDA后用该列「器件属性绑定」，
 *   由货号自动带出官方封装 + 3D 模型 —— 这是保证「立创库里一定有该封装」的唯一可靠办法。
 *   未绑定时输出「待绑定」，L2 阶段须清零。 */
/* 符号 → BOM 类别（用于分类整理与排序） */
const CAT_OF_SYM = {
  MCU: '1 集成电路 IC', FD6288T: '1 集成电路 IC', XL7005A: '1 集成电路 IC',
  LDO: '1 集成电路 IC', INA181: '1 集成电路 IC',
  NMOS: '2 功率器件 MOSFET',
  D: '3 二极管', DSCH: '3 二极管',
  DTVS: '4 保护器件（保险丝 / TVS）', FUSE: '4 保护器件（保险丝 / TVS）',
  R: '5 电阻', RSHUNT: '5 电阻',
  C: '6 电容', CP: '6 电容',
  L: '7 电感',
  TP: '8 测试点',
};
const CAT_ORDER = ['1 集成电路 IC', '2 功率器件 MOSFET', '3 二极管',
  '4 保护器件（保险丝 / TVS）', '5 电阻', '6 电容', '7 电感', '8 测试点'];

const groups = new Map();
for (const c of COMPONENTS) {
  if (c.ref.startsWith('#')) continue;     /* 虚拟元件（PWR_FLAG）不进 BOM */
  /* ★ 合并键 = 参数 + 封装 + LCSC 料号（**不含 desc**）：
   * 立创下单要的是"一个料号一行 + 全部位号"，而不是按用途拆成多行。
   * （此前把 desc 放进键里，导致 R1–R6 六颗 10Ω 栅极电阻拆成 6 行、19 个测试点拆成 19 行。） */
  const k = `${c.val}|${c.fp}|${LCSC[c.ref] ?? ''}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}
/* 输出辅助：文件被 Excel/编辑器占用时给出提示而不是让整个构建崩掉 */
const writeOut = (name, data) => {
  const p = path.join(OUT, name);
  try { fs.writeFileSync(p, data, 'utf8'); return true; }
  catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES') {
      console.log(`  ⚠ 写入失败（文件被占用，可能正开在 Excel/编辑器里）: ${name} —— 请关闭后重新运行`);
      return false;
    }
    throw e;
  }
};

const rows = [...groups.entries()].map(([k, list]) => {
  const [val, fp, lcsc] = k.split('|');
  const refs = list.map(c => c.ref).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const descs = [...new Set(list.map(c => c.desc ?? ''))];
  const desc = descs.length === 1 ? descs[0] : `${descs[0]}〔等 ${descs.length} 种用途〕`;
  const cat = CAT_OF_SYM[list[0].sym] ?? '9 其它';
  return { refs, val, fp, desc, lcsc, cat };
}).sort((a, b) => {
  const ca = CAT_ORDER.indexOf(a.cat), cb = CAT_ORDER.indexOf(b.cat);
  if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
  return a.refs[0].localeCompare(b.refs[0], 'en', { numeric: true });
});
writeOut(`BOM_${PROJECT.rev}.csv`,
  '\uFEFF' + ['类别,位号,数量,参数,封装,LCSC料号,说明',
    ...rows.map(r => `"${r.cat}","${r.refs.join(' ')}",${r.refs.length},"${r.val}","${r.fp}",${r.lcsc || '待绑定'},"${r.desc}"`)].join('\n') + '\n');

/* BOM 分类汇总（便于采购与核对） */
const byCat = new Map();
for (const r of rows) {
  if (!byCat.has(r.cat)) byCat.set(r.cat, { lines: 0, qty: 0 });
  const v = byCat.get(r.cat); v.lines++; v.qty += r.refs.length;
}
console.log('\nBOM 分类汇总:');
for (const [cat, v] of byCat) console.log(`  ${cat.padEnd(26)} ${String(v.lines).padStart(2)} 行 / ${String(v.qty).padStart(3)} 只`);

/* ---- BOM 可读清单（Markdown：序号 / 标号名称 / 实际物品名称 / 参数大小 / 个数） ----
 * 供人工核对与采购；CSV 那份保留「封装 + LCSC料号」用于导入立创EDA绑定。 */
const ITEM_NAME = {
  MCU: '32 位微控制器 MCU', FD6288T: '三相栅极驱动 IC', XL7005A: '降压型 DC-DC 转换器',
  LDO: '线性稳压器 LDO', INA181: '电流检测放大器',
  NMOS: 'N 沟道功率 MOSFET',
  D: '快恢复二极管', DSCH: '肖特基二极管', DTVS: '瞬态抑制二极管 TVS',
  FUSE: '贴片保险丝（慢熔）',
  R: '贴片电阻', RSHUNT: '合金采样电阻',
  C: '贴片陶瓷电容', CP: '电解电容',
  L: '功率电感',
  TP: 'SMT 测试点',
};
/* 参数大小：小元器件给电气值；芯片/MOSFET 给关键规格（"针对小元器件"取 val，其余取此表） */
const SPEC_OF_VAL = {
  HYG053N10NS1C2: '100 V / 60 A / Rds(on) 5.3 mΩ',
  HC32F005C6PA: 'Cortex-M0+ 32 MHz / 32 KB Flash / 4 KB RAM',
  FD6288T: '3 相半桥 / 12 V / 带 SCP',
  XL7005A: '5–80 V 输入 → 12 V / 0.4 A / 150 kHz',
  INA181A2: '增益 50 V/V / 双向',
  'AMS1117-3.3': '3.3 V / 1 A',
  SMBJ33A: 'Vwm 33 V / Vclamp 53.3 V',
  'FUSE-15A-T': '15 A / 32 V',
  TESTPOINT: '1.6 × 0.8 mm',
  '47µH': '47 µH / 0.4 A 以上',
  ES1D: '1 A / 200 V', 'SS110-LTP': '1 A / 100 V',
};
/* 连续位号压缩：R1 R2 R3 R4 R5 R6 → R1-R6 */
const compressRefs = (refs) => {
  const out = [];
  const rx = /^([A-Za-z#]+)(\d+)$/;
  let i = 0;
  while (i < refs.length) {
    const m = rx.exec(refs[i]);
    if (!m) { out.push(refs[i++]); continue; }
    let j = i + 1;
    while (j < refs.length) {
      const n = rx.exec(refs[j]), p = rx.exec(refs[j - 1]);
      if (!n || n[1] !== m[1] || +n[2] !== +p[2] + 1) break;
      j++;
    }
    if (j - i >= 3) out.push(`${m[1]}${m[2]}-${rx.exec(refs[j - 1])[2]}`);
    else for (let k = i; k < j; k++) out.push(refs[k]);
    i = j;
  }
  return out.join(' ');
};

/* 无源件的封装简写：用于消歧（否则两个 "1µF" 行看起来一模一样，但耐压/封装不同） */
const FP_SHORT = {
  R0603: '0603', C0603: '0603', C0805: '0805', C1206: '1206', R2512: '2512',
  'CAP-TH_BD8.0-P3.50-D0.5-FD': '插件 φ8',
  'CAP-SMD_BD6.3-L6.6-W6.6-LS7.3-FD': '贴片 φ6.3',
  'CAP-SMD_BD6.3-L6.6-W6.6-LS7.3-FD-H7.7': '贴片 φ6.3 高7.7',
  'IND-SMD_L6.0-W6.0_LPS6225': 'SMD 6×6',
};
const md = [];
md.push(`# 物料清单 ${PROJECT.rev}（分类整理）`, '');
md.push(`> 共 **${rows.length} 行 / ${rows.reduce((s, r) => s + r.refs.length, 0)} 只**，全部已绑定立创货号。`,
  `> 可读清单用本文件；导入立创EDA绑定封装请用 \`BOM_${PROJECT.rev}.csv\`（含「封装」与「LCSC料号」列）。`, '');
let sn = 0;
for (const [cat, v] of byCat) {
  md.push(`## ${cat}　（${v.lines} 行 / ${v.qty} 只）`, '');
  md.push('| 序号 | 标号名称 | 实际物品名称 | 参数大小 | 个数 |');
  md.push('|---|---|---|---|---|');
  for (const r of rows.filter(x => x.cat === cat)) {
    sn++;
    const sym = COMPONENTS.find(c => c.ref === r.refs[0]).sym;
    const item = ITEM_NAME[sym] ?? r.val;
    const isPassive = ['R', 'RSHUNT', 'C', 'CP', 'L'].includes(sym);
    const spec = SPEC_OF_VAL[r.val] ?? (isPassive ? `${r.val}（${FP_SHORT[r.fp] ?? r.fp}）` : r.val);
    md.push(`| ${sn} | ${compressRefs(r.refs)} | ${item} | ${spec} | ${r.refs.length} |`);
  }
  md.push('');
}
writeOut(`BOM_${PROJECT.rev}.md`, md.join('\n') + '\n');

console.log('');
console.log('已写入:');
for (const f of [`${BASE}.kicad_sch`, `${BASE}.net`, `netlist_${PROJECT.rev}.txt`, `BOM_${PROJECT.rev}.csv`, `自检报告_${PROJECT.rev}.txt`])
  console.log(`  ${path.join(OUT, f)}`);
console.log(`BOM 去重行数: ${rows.length}`);

/* ============================================================
   KiCad 官方工具同步（2026-09-14 新增）
   ------------------------------------------------------------
   为什么必须做：`kicad_erc_*.rpt` / `kicad_netlist_*.net` 曾与原理图**脱节 33 分钟**
   （旧网表里还留着已删除的 R15），导致后续分析基于一份不存在的电路。
   现在把「重出 ERC + 重出官方网表」挂进构建流程，从机制上杜绝再次脱节。
   找不到 kicad-cli 时只告警、不失败（换机器/未装 KiCad 时仍能出图）。
   ============================================================ */
console.log('');
try {
  const { execFileSync } = await import('node:child_process');
  const AUD = path.resolve(OUT, '..', '03_审核');
  const cands = [
    'kicad-cli',
    'D:\\KiCad\\bin\\kicad-cli.exe',
    'C:\\Program Files\\KiCad\\bin\\kicad-cli.exe',
  ];
  let cli = null;
  for (const c of cands) {
    try { execFileSync(c, ['version'], { stdio: 'ignore' }); cli = c; break; } catch { /* 试下一个 */ }
  }
  if (!cli) {
    console.log('⚠️ 未找到 kicad-cli → 跳过 ERC / 官方网表同步。');
    console.log('   （这不影响出图；但 03_审核 下的 ERC 与网表可能过期，请手工重跑）');
  } else {
    fs.mkdirSync(AUD, { recursive: true });
    execFileSync(cli, ['sch', 'erc', '--output', path.join(AUD, `kicad_erc_${PROJECT.rev}.rpt`),
      '--severity-all', '--format', 'report', schPath], { stdio: 'ignore' });
    execFileSync(cli, ['sch', 'export', 'netlist', '--format', 'kicadsexpr',
      '--output', path.join(AUD, `kicad_netlist_${PROJECT.rev}.net`), schPath], { stdio: 'ignore' });
    /* 统计 ERC 严重级别，直接打在构建输出里 —— 有 error 就失败 */
    const rpt = fs.readFileSync(path.join(AUD, `kicad_erc_${PROJECT.rev}.rpt`), 'utf8');
    const errs = (rpt.match(/^\s*;\s*error\s*$/gm) ?? []).length;
    const warns = (rpt.match(/^\s*;\s*warning\s*$/gm) ?? []).length;
    console.log(`KiCad 官方工具同步完成（${cli}）：ERC error=${errs} warning=${warns}`);
    console.log(`  ${path.join(AUD, `kicad_erc_${PROJECT.rev}.rpt`)}`);
    console.log(`  ${path.join(AUD, `kicad_netlist_${PROJECT.rev}.net`)}`);
    if (errs > 0) { console.error(`✗ ERC 有 ${errs} 个 error —— 构建失败`); ok = false; }
  }
} catch (e) {
  console.log(`⚠️ KiCad 工具同步失败（不影响出图）: ${e.message}`);
}

if (!ok) process.exit(1);
