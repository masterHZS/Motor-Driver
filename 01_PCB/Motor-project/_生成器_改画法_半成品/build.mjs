/**
 * 构建：生成 .kicad_sch，然后【独立重新解析生成的文件】做端到端连接性校验，
 * 再导出网表与 BOM。输出目录 = 本脚本的上一级（01_工程）。
 *
 * ── 校验方式（改造后）──────────────────────────────────────────────
 * 旧版靠「标签坐标 → 网络名」判断连接；改成块内走线直连后，绝大多数网络
 * 没有标签，旧办法必然失效。
 * 现在改成 **并查集沿走线追踪连通性**：
 *   节点 = 全部 wire 端点 + 全部引脚坐标 + 全部标签坐标
 *   ① wire 两端 union
 *   ② wire 端点落在另一根 wire 的中段 → 也 union（T 接）
 *   ③ 同坐标的引脚点 union
 *   ④ 标签点 union，并把网络名记在连通分量上
 *   每个引脚的所属网络 = 其所在连通分量的网络名。
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

/* ---- 1) lib_symbols 引脚偏移（按括号配对定界） ---- */
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
const pinAt = new Map();          // "x,y" → [ref.pin, ...]
for (const inst of instances) {
  const pins = libPins[inst.sym];
  if (!pins) throw new Error(`解析不到符号 ${inst.sym} 的引脚`);
  for (const p of pins) {
    const k = key(inst.X + p.px, inst.Y - p.py);
    if (!pinAt.has(k)) pinAt.set(k, []);
    pinAt.get(k).push(`${inst.ref}.${p.n}`);
  }
}

/* ---- 4) wire / global_label / no_connect ---- */
const wires = [...txt.matchAll(/\(wire \(pts \(xy (-?[\d.]+) (-?[\d.]+)\) \(xy (-?[\d.]+) (-?[\d.]+)\)\)/g)]
  .map((m) => ({ ax: +m[1], ay: +m[2], bx: +m[3], by: +m[4] }));
const labels = [...txt.matchAll(/\(global_label "([^"]+)" \(shape passive\) \(at (-?[\d.]+) (-?[\d.]+) (\d+)\)/g)]
  .map((m) => ({ net: m[1], x: +m[2], y: +m[3] }));
const noConnects = [...txt.matchAll(/\(no_connect \(at (-?[\d.]+) (-?[\d.]+)\)/g)].map((m) => key(+m[1], +m[2]));
const ncSetRebuilt = new Set(noConnects);

/* ---- 5) 并查集沿走线追踪连通性 ---- */
const parent = new Map();
const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
const node = (k) => { if (!parent.has(k)) parent.set(k, k); return k; };

const near = (a, b) => Math.abs(a - b) < 0.001;
/** 点 (x,y) 是否落在某根 wire 的**中段**（不含端点） */
function onSegment(w, x, y) {
  if (near(w.ay, w.by)) {
    if (!near(y, w.ay)) return false;
    const lo = Math.min(w.ax, w.bx), hi = Math.max(w.ax, w.bx);
    return x > lo + 0.001 && x < hi - 0.001;
  }
  if (near(w.ax, w.bx)) {
    if (!near(x, w.ax)) return false;
    const lo = Math.min(w.ay, w.by), hi = Math.max(w.ay, w.by);
    return y > lo + 0.001 && y < hi - 0.001;
  }
  return false;
}

/* 节点：引脚坐标、wire 端点、标签坐标 */
for (const k of pinAt.keys()) node(k);
for (const w of wires) { node(key(w.ax, w.ay)); node(key(w.bx, w.by)); }
for (const l of labels) node(key(l.x, l.y));

/* ① wire 两端 union */
for (const w of wires) union(key(w.ax, w.ay), key(w.bx, w.by));

/* ② T 接：任一端点落在另一根 wire 的中段 → union */
const allEnds = new Set();
for (const w of wires) { allEnds.add(key(w.ax, w.ay)); allEnds.add(key(w.bx, w.by)); }
for (const k of allEnds) {
  const [x, y] = k.split(',').map(Number);
  for (const w of wires) if (onSegment(w, x / 100, y / 100)) union(k, key(w.ax, w.ay));
}
/* ②b 引脚坐标也可能落在 wire 中段（走线穿过引脚连接点）→ union */
for (const k of pinAt.keys()) {
  const [x, y] = k.split(',').map(Number);
  for (const w of wires) if (onSegment(w, x / 100, y / 100)) union(k, key(w.ax, w.ay));
}

/* ③ 同坐标的引脚（同一坐标多脚）本就是同一电气点，node() 已保证 */

/* ④ 标签 → 网络名记录在连通分量上 */
const compNet = new Map();        // root → Set(netName)
for (const l of labels) {
  const r = find(key(l.x, l.y));
  if (!compNet.has(r)) compNet.set(r, new Set());
  compNet.get(r).add(l.net);
}

/* 每个引脚的所属网络 */
const rebuilt = new Map();        // net → Set(pinName)
const pinNetRebuilt = new Map();  // pinName → net
const conflicts = [];
for (const [k, names] of pinAt) {
  const r = find(k);
  const nets = compNet.get(r);
  if (!nets) continue;                                  // 该点没有标签、也没连到带标签的网络
  if (nets.size > 1) conflicts.push(`坐标 ${k} 同时挂了多个网络标签: ${[...nets].join(',')}`);
  const net = [...nets][0];
  for (const p of names) {
    if (pinNetRebuilt.has(p) && pinNetRebuilt.get(p) !== net)
      conflicts.push(`${p} 同时属于 ${pinNetRebuilt.get(p)} 与 ${net}`);
    pinNetRebuilt.set(p, net);
    if (!rebuilt.has(net)) rebuilt.set(net, new Set());
    rebuilt.get(net).add(p);
  }
}

/* ---- 6) 与设计意图比对 ---- */
const mismatch = [];
for (const net of new Set([...Object.keys(NETS), ...rebuilt.keys()])) {
  const want = new Set(NETS[net] ?? []);
  const got = rebuilt.get(net) ?? new Set();
  const missing = [...want].filter((p) => !got.has(p));
  const extra = [...got].filter((p) => !want.has(p));
  if (missing.length || extra.length) mismatch.push(`  ✗ ${net}: 缺失[${missing.join(',')}] 多出[${extra.join(',')}]`);
}

/* no-connect 引脚：不得出现在任何网络里 */
const ncPinRefs = new Set();
for (const k of NO_CONNECT) {
  const i = k.lastIndexOf('.');
  const inst = instances.find((x) => x.ref === k.slice(0, i));
  const p = libPins[inst.sym].find((pp) => pp.n === k.slice(i + 1));
  const pk = key(inst.X + p.px, inst.Y - p.py);
  ncPinRefs.add(pk);
  if (!ncSetRebuilt.has(pk)) throw new Error(`引脚 ${k} 标了 no-connect 但生成文件里没有对应标记`);
  for (const [, set] of rebuilt) if (set.has(k)) throw new Error(`no-connect 引脚 ${k} 却出现在网络里`);
}

/* 引脚覆盖：每个引脚必须恰好出现在一个网络（no-connect 除外） */
const pinSeen = new Map();
for (const [net, set] of rebuilt) for (const p of set) pinSeen.set(p, (pinSeen.get(p) ?? 0) + 1);
const ncNames = new Set(NO_CONNECT);
const allPinNames = new Set();
for (const inst of instances) for (const p of libPins[inst.sym]) allPinNames.add(`${inst.ref}.${p.n}`);
const uncovered = [...allPinNames].filter((k) => !pinSeen.has(k) && !ncNames.has(k));
const dupPin = [...pinSeen.entries()].filter(([, c]) => c > 1).map(([p]) => p);

/* no-connect 标记必须精确落在引脚坐标上 */
const ncBad = [...ncPinRefs].filter((k) => !ncSetRebuilt.has(k));
const ncExtra = [...ncSetRebuilt].filter((k) => !ncPinRefs.has(k));

/* 走线几何：必须全部正交 + 0.01 网格 */
let orthoBad = 0, gridBad = 0;
for (const w of wires) {
  if (!(near(w.ax, w.bx) || near(w.ay, w.by))) orthoBad++;
  for (const v of [w.ax, w.ay, w.bx, w.by])
    if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) gridBad++;
}

/* ---- 输出 ---- */
const multi = [...pinAt.values()].filter((v) => v.length > 1).length;
const L = [];
L.push('='.repeat(78));
L.push(`${PROJECT.title}`);
L.push(`Rev ${PROJECT.rev}   ${PROJECT.date}`);
L.push('='.repeat(78));
L.push('');
L.push(`文件        : ${schPath}`);
L.push(`元件数      : ${stats.components}`);
L.push(`功能块数    : ${stats.blocks}`);
L.push(`走线段数    : ${stats.wires}（其中 ${stats.wireNets} 个网络用走线直连）`);
L.push(`网络标签数  : ${stats.labels}（${stats.labelNets} 个网络用 global_label）`);
L.push(`T 型连接点  : ${stats.junctions}`);
L.push(`网络数      : ${stats.nets}`);
L.push('');
L.push('--- 独立重新解析生成文件（并查集沿走线追踪）---');
L.push(`  lib_symbols 符号数      : ${Object.keys(libPins).length}`);
L.push(`  元件实例数              : ${instances.length}`);
L.push(`  wire 数                 : ${wires.length}`);
L.push(`  global_label 数         : ${labels.length}`);
L.push(`  唯一引脚坐标点数        : ${pinAt.size}`);
L.push(`  多引脚共享坐标点        : ${multi}（MOSFET 的 D/S 堆叠脚）`);
L.push(`  no_connect 标记数       : ${noConnects.length}`);
L.push(`  非正交走线              : ${orthoBad}`);
L.push(`  非 0.01 网格坐标        : ${gridBad}`);
L.push('');
L.push(`悬空网络接口  : ${Object.keys(INTERFACE_NETS).length} 个（本板无连接器元件）`);
L.push(`未使用引脚    : ${NO_CONNECT.length} 个（已标 no-connect）：${NO_CONNECT.join(', ')}`);
L.push('');
if (uncovered.length) L.push(`  ✗ 未被任何网络覆盖的引脚: ${uncovered.join(', ')}`);
if (dupPin.length) L.push(`  ✗ 被多个网络占用的引脚  : ${dupPin.join(', ')}`);
if (ncBad.length) L.push(`  ✗ 缺少 no-connect 标记的引脚坐标: ${ncBad.length} 个`);
if (ncExtra.length) L.push(`  ✗ 多余的 no-connect 标记: ${ncExtra.length} 个`);
if (conflicts.length) L.push(`  ✗ 标签/网络冲突: ${conflicts.length} 处`, ...conflicts.map((c) => '    ' + c));
if (orthoBad) L.push(`  ✗ 存在斜线（非正交走线）: ${orthoBad} 段`);
if (gridBad) L.push(`  ✗ 存在非 0.01 mm 网格坐标: ${gridBad} 个`);
L.push('');
let ok = true;
if (mismatch.length) { ok = false; L.push(`✗ 逐网络比对失败：${mismatch.length} 个网络不一致`); L.push(...mismatch); }
if (uncovered.length || dupPin.length || ncBad.length || ncExtra.length || conflicts.length || orthoBad || gridBad) ok = false;
if (ok) {
  L.push('✓ 端到端校验通过：重新解析 .kicad_sch（并查集沿走线追踪连通性）得到的连接关系');
  L.push('  与设计意图逐网络完全一致，且全部引脚恰好被一个网络覆盖（无悬空、无重复占用），');
  L.push('  未使用引脚已标 no-connect，走线全部正交且落在 0.01 mm 网格上。');
}
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

/* ---- BOM ---- */
const groups = new Map();
for (const c of COMPONENTS) {
  if (c.ref.startsWith('#')) continue;     /* 虚拟元件（PWR_FLAG）不进 BOM */
  const k = `${c.val}|${c.fp}|${LCSC[c.ref] ?? ''}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}
const rows = [...groups.entries()].map(([k, list]) => {
  const [val, fp, lcsc] = k.split('|');
  const refs = list.map((c) => c.ref).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const descs = [...new Set(list.map((c) => c.desc ?? ''))];
  const desc = descs.length === 1 ? descs[0] : `${descs[0]}〔等 ${descs.length} 种用途〕`;
  return { refs, val, fp, desc, lcsc };
}).sort((a, b) => a.refs[0].localeCompare(b.refs[0], 'en', { numeric: true }));
fs.writeFileSync(path.join(OUT, `BOM_${PROJECT.rev}.csv`),
  '\uFEFF' + ['位号,数量,参数,封装,LCSC料号,说明',
    ...rows.map((r) => `${r.refs.join(' ')},${r.refs.length},"${r.val}","${r.fp}",${r.lcsc || '待绑定'},"${r.desc}"`)].join('\n') + '\n', 'utf8');

console.log('');
console.log('已写入:');
for (const f of [`${BASE}.kicad_sch`, `${BASE}.net`, `netlist_${PROJECT.rev}.txt`, `BOM_${PROJECT.rev}.csv`, `自检报告_${PROJECT.rev}.txt`])
  console.log(`  ${path.join(OUT, f)}`);
console.log(`BOM 去重行数: ${rows.length}`);
if (!ok) process.exit(1);
