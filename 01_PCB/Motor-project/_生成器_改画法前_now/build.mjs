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

/* ---- 5) 重建连接 ---- */
const labelAt = new Map();
for (const l of labels) labelAt.set(l.at, l.net);

const rebuilt = new Map();
let noLabel = 0, noPin = 0, both = 0, multi = 0;
for (const wr of wires) {
  const netA = labelAt.get(wr.a), netB = labelAt.get(wr.b);
  const pinsA = pinAt.get(wr.a), pinsB = pinAt.get(wr.b);
  let net, pins;
  if (netA && pinsB) { net = netA; pins = pinsB; }
  else if (netB && pinsA) { net = netB; pins = pinsA; }
  else { if (!netA && !netB) noLabel++; else if (!pinsA && !pinsB) noPin++; else both++; continue; }
  if (!rebuilt.has(net)) rebuilt.set(net, new Set());
  for (const p of pins) rebuilt.get(net).add(p);
}
for (const [, v] of pinAt) if (v.length > 1) multi++;
if (process.env.DBG) {
  console.log('[DBG] instances', instances.length, 'pinAt', pinAt.size, 'wires', wires.length, 'labels', labels.length);
  console.log('[DBG] matched nets', rebuilt.size, 'noLabel', noLabel, 'noPin', noPin, 'both', both);
  console.log('[DBG] wire0', JSON.stringify(wires[0]), 'label0', JSON.stringify(labels[0]));
  console.log('[DBG] pinAt(wire0.a)', JSON.stringify(pinAt.get(wires[0].a)), 'labelAt(wire0.b)', labelAt.get(wires[0].b));
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
const rows = [...groups.entries()].map(([k, list]) => {
  const [val, fp, lcsc] = k.split('|');
  const refs = list.map(c => c.ref).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const descs = [...new Set(list.map(c => c.desc ?? ''))];
  const desc = descs.length === 1 ? descs[0] : `${descs[0]}〔等 ${descs.length} 种用途〕`;
  return { refs, val, fp, desc, lcsc };
}).sort((a, b) => a.refs[0].localeCompare(b.refs[0], 'en', { numeric: true }));
fs.writeFileSync(path.join(OUT, `BOM_${PROJECT.rev}.csv`),
  '\uFEFF' + ['位号,数量,参数,封装,LCSC料号,说明',
    ...rows.map(r => `${r.refs.join(' ')},${r.refs.length},"${r.val}","${r.fp}",${r.lcsc || '待绑定'},"${r.desc}"`)].join('\n') + '\n', 'utf8');

console.log('');
console.log('已写入:');
for (const f of [`${BASE}.kicad_sch`, `${BASE}.net`, `netlist_${PROJECT.rev}.txt`, `BOM_${PROJECT.rev}.csv`, `自检报告_${PROJECT.rev}.txt`])
  console.log(`  ${path.join(OUT, f)}`);
console.log(`BOM 去重行数: ${rows.length}`);
if (!ok) process.exit(1);
