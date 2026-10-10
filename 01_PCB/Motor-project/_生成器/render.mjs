/**
 * 从生成好的 .kicad_sch 渲染工程图 SVG。
 * 独立解析该文件（含图框、功能块边框、标题、元件属性位置），
 * 因此渲染结果本身就是一次交叉验证。
 */
import fs from 'node:fs';
import path from 'node:path';
import { NET_CLASS, PROJECT } from './design.mjs';
import { PAPER } from './layout.mjs';

const DIR = path.resolve(import.meta.dirname, '..');
const SRC = path.join(DIR, `${PROJECT.fileBase}.kicad_sch`);
const DST = path.join(DIR, `${PROJECT.fileBase}.svg`);
const txt = fs.readFileSync(SRC, 'utf8');

/* ---------- lib_symbols ---------- */
/* 按括号配对找 lib_symbols 的真正结尾，避免把后续内容吞进最后一个符号 */
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
const lib = {};
{
  const ls = txt.indexOf('(lib_symbols');
  const seg = txt.slice(ls, blockEnd(txt, ls));
  const starts = [...seg.matchAll(/\(symbol "mdrive:([A-Za-z0-9_]+)"/g)];
  for (let i = 0; i < starts.length; i++) {
    const name = starts[i][1];
    const body = seg.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : seg.length);
    const gfx = [];
    for (const m of body.matchAll(/\(rectangle \(start (-?[\d.]+) (-?[\d.]+)\) \(end (-?[\d.]+) (-?[\d.]+)\)/g))
      gfx.push({ t: 'rect', x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] });
    for (const m of body.matchAll(/\(polyline \(pts ((?:\(xy -?[\d.]+ -?[\d.]+\)\s*)+)\)/g))
      gfx.push({ t: 'poly', pts: [...m[1].matchAll(/\(xy (-?[\d.]+) (-?[\d.]+)\)/g)].map(p => [+p[1], +p[2]]) });
    const pins = [];
    for (const pb of body.split('(pin ').slice(1)) {
      const at = pb.match(/^\w+ line \(at (-?[\d.]+) (-?[\d.]+) (\d+)\) \(length ([\d.]+)\)/);
      const nm = pb.match(/\(name "([^"]*)"/);
      const num = pb.match(/\(number "([^"]+)"/);
      if (at && num) pins.push({ x: +at[1], y: +at[2], a: +at[3], l: +at[4], name: nm ? nm[1] : '~', num: num[1] });
    }
    lib[name] = { gfx, pins };
  }
}

/* ---------- 元件实例（含属性绝对坐标） ---------- */
const insts = [];
{
  const seg = txt.slice(txt.indexOf('  (symbol (lib_id'), txt.indexOf('  (sheet_instances'));
  for (const blk of seg.split('  (symbol (lib_id "mdrive:').slice(1)) {
    const sym = blk.slice(0, blk.indexOf('"'));
    const at = blk.match(/^[A-Za-z0-9_]+"\) \(at (-?[\d.]+) (-?[\d.]+) (\d+)\)/);
    if (!at) continue;
    const prop = (n) => {
      const m = blk.match(new RegExp(`\\(property "${n}" "([^"]*)" \\(at (-?[\\d.]+) (-?[\\d.]+) \\d+\\) \\(effects \\(font \\(size ([\\d.]+) ([\\d.]+)\\)\\)(?: \\(justify (\\w+)\\))?`));
      return m ? { text: m[1], x: +m[2], y: +m[3], size: +m[4], justify: m[6] ?? 'left' } : null;
    };
    insts.push({ sym, X: +at[1], Y: +at[2], ref: prop('Reference'), val: prop('Value') });
  }
}

/* ---------- wire / label / 功能块 / 标题 ---------- */
const wires = [...txt.matchAll(/\(wire \(pts \(xy (-?[\d.]+) (-?[\d.]+)\) \(xy (-?[\d.]+) (-?[\d.]+)\)\)/g)]
  .map(m => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] }));
const labels = [...txt.matchAll(/\(global_label "([^"]+)" \(shape passive\) \(at (-?[\d.]+) (-?[\d.]+) (\d+)\)/g)]
  .map(m => ({ net: m[1], x: +m[2], y: +m[3], a: +m[4] }));
const blockBoxes = [];
for (const m of txt.matchAll(/\(polyline \(pts ((?:\(xy -?[\d.]+ -?[\d.]+\)\s*)+)\) \(stroke \(width [\d.]+\) \(type dash\)\)/g))
  blockBoxes.push({ pts: [...m[1].matchAll(/\(xy (-?[\d.]+) (-?[\d.]+)\)/g)].map(p => [+p[1], +p[2]]) });
const texts = [...txt.matchAll(/\(text "([^"]+)" \(at (-?[\d.]+) (-?[\d.]+) 0\) \(effects \(font \(size ([\d.]+)/g)]
  .map(m => ({ text: m[1], x: +m[2], y: +m[3], size: +m[4] }));

/* ---------- 绘制 ---------- */
const S = 5.4;                      // px / mm
const W = PAPER.w, H = PAPER.h;
const e = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const X = (x) => +(x * S).toFixed(2);
const Y = (y) => +(y * S).toFixed(2);

const CLASS_COLOR = {
  power: '#c0392b', phase: '#d35400', gnd: '#2c3e50', boot: '#8e44ad',
  gate: '#1a7a44', analog: '#1f4e9c', logic: '#7d3c98', other: '#555',
};
const o = [];
o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}" viewBox="0 0 ${W * S} ${H * S}" font-family="Consolas,Menlo,monospace">`);
o.push(`<rect width="${W * S}" height="${H * S}" fill="#fffdf7"/>`);
o.push(`<rect x="${X(5)}" y="${Y(5)}" width="${X(W - 10).toFixed(1)}" height="${Y(H - 10).toFixed(1)}" fill="none" stroke="#333" stroke-width="1.6"/>`);
o.push(`<rect x="${X(8)}" y="${Y(8)}" width="${X(W - 16).toFixed(1)}" height="${Y(H - 16).toFixed(1)}" fill="none" stroke="#333" stroke-width="0.6"/>`);

/* 功能块边框（虚线） */
for (const b of blockBoxes) {
  const d = b.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])} ${Y(p[1])}`).join(' ');
  o.push(`<path d="${d}" fill="none" stroke="#b06a00" stroke-width="1.2" stroke-dasharray="8 5"/>`);
}
/* 功能块标题 + 说明文字（size ≥2 视为标题，加粗橙色；否则为说明，深灰） */
for (const t of texts) {
  const isTitle = t.size >= 2;
  o.push(`<text x="${X(t.x)}" y="${Y(t.y)}" font-size="${(t.size * S * 0.62).toFixed(1)}" font-weight="${isTitle ? 'bold' : 'normal'}" fill="${isTitle ? '#a3540a' : '#333'}">${e(t.text)}</text>`);
}

/* 元件 */
for (const it of insts) {
  const L = lib[it.sym];
  if (!L) continue;
  const P = (px, py) => [X(it.X + px), Y(it.Y - py)];
  for (const g of L.gfx) {
    if (g.t === 'rect') {
      const [x1, y1] = P(Math.min(g.x1, g.x2), Math.max(g.y1, g.y2));
      const [x2, y2] = P(Math.max(g.x1, g.x2), Math.min(g.y1, g.y2));
      o.push(`<rect x="${x1}" y="${y1}" width="${(x2 - x1).toFixed(2)}" height="${(y2 - y1).toFixed(2)}" fill="#f2f7ff" stroke="#0b3d91" stroke-width="1.1"/>`);
    } else {
      o.push(`<path d="${g.pts.map((p, i) => `${i ? 'L' : 'M'}${P(p[0], p[1]).join(' ')}`).join(' ')}" fill="none" stroke="#0b3d91" stroke-width="1.3"/>`);
    }
  }
  for (const p of L.pins) {
    const dx = p.a === 0 ? p.l : p.a === 180 ? -p.l : 0;
    const dy = p.a === 90 ? p.l : p.a === 270 ? -p.l : 0;
    const [ax, ay] = P(p.x, p.y);
    const [bx, by] = P(p.x + dx, p.y + dy);
    o.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#0b3d91" stroke-width="1"/>`);
    o.push(`<circle cx="${ax}" cy="${ay}" r="1.5" fill="#0b3d91"/>`);
    if (p.name && p.name !== '~') {
      const inward = p.a === 180 ? bx - 3 : bx + 3;
      o.push(`<text x="${inward}" y="${(ay + 3).toFixed(1)}" font-size="6.5" fill="#0b3d91" text-anchor="${p.a === 180 ? 'end' : 'start'}">${e(p.name)}</text>`);
    }
    o.push(`<text x="${ax}" y="${(ay - 2.5).toFixed(1)}" font-size="5.5" fill="#999" text-anchor="middle">${e(p.num)}</text>`);
  }
  for (const pr of [it.ref, it.val]) {
    if (!pr) continue;
    const anchor = pr.justify === 'right' ? 'end' : 'start';
    o.push(`<text x="${X(pr.x)}" y="${Y(pr.y)}" font-size="${(pr.size * S * 0.62).toFixed(1)}" font-weight="${pr === it.ref ? 'bold' : 'normal'}" fill="${pr === it.ref ? '#111' : '#555'}" text-anchor="${anchor}">${e(pr.text)}</text>`);
  }
}

/* 走线 */
for (const w of wires)
  o.push(`<line x1="${X(w.x1)}" y1="${Y(w.y1)}" x2="${X(w.x2)}" y2="${Y(w.y2)}" stroke="#1a7a44" stroke-width="1.3"/>`);

/* 网络标签 */
for (const l of labels) {
  const c = CLASS_COLOR[NET_CLASS[l.net] ?? 'other'];
  const right = l.a === 180;
  o.push(`<circle cx="${X(l.x)}" cy="${Y(l.y)}" r="1.8" fill="${c}"/>`);
  o.push(`<text x="${X(l.x) + (right ? -4 : 4)}" y="${(Y(l.y) + 3).toFixed(1)}" font-size="${(1.27 * S * 0.62).toFixed(1)}" fill="${c}" text-anchor="${right ? 'end' : 'start'}">${e(l.net)}</text>`);
}

/* 图例（放在 ⑫ 接口块右侧空位） */
const legend = [['电源/母线', 'power'], ['相线', 'phase'], ['地', 'gnd'], ['自举', 'boot'], ['栅极', 'gate'], ['模拟/采样', 'analog'], ['逻辑/PWM', 'logic']];
const LGX = 566, LGY = 292;
o.push(`<text x="${X(LGX)}" y="${Y(LGY)}" font-size="13" font-weight="bold" fill="#111" text-anchor="end">网络颜色图例</text>`);
legend.forEach(([t, k], i) => {
  o.push(`<rect x="${X(LGX) - 9}" y="${Y(LGY + 5.5 + i * 6)}" width="9" height="3.2" fill="${CLASS_COLOR[k]}"/>`);
  o.push(`<text x="${X(LGX) - 13}" y="${Y(LGY + 8.1 + i * 6)}" font-size="10.5" fill="#333" text-anchor="end">${e(t)}</text>`);
});

/* 标题栏 */
const tb = [
  [PROJECT.title, 20, '#111', 'bold'],
  ['无感六步换向 + 反电动势过零检测（3 路相电压 → ADC 扫描 + ADT 硬件触发）', 13, '#333', ''],
  ['六路 PWM：TIM4/TIM5/TIM6 各一对硬件互补 + 硬件死区（DTUAR/DTDAR），直接驱动 FD6288T', 11, '#333', ''],
  ['母线 12.0–16.8 V（4S LiPo 专用）｜ 电机 2216-730KV / 90 W / 14600 rpm ｜ 额定 8.8 A，过流 13 A', 11, '#333', ''],
  ['⚠️ ISP(P35/P36) 已被 PWM/ADC 占用 → 必须用 SWD 烧录；⚠️ 无 VC 硬件刹车 → 软件限流 + FD6288T 自带 SCP', 11, '#a3540a', ''],
  ['⚠️ 母线不支持 3S（12 V 轨需 ≥13.4 V 母线）→ 固件欠压门限应设 ≥13.5 V；3.3 V 负载须 ≤30 mA', 11, '#a3540a', ''],
  ['PGND 与 AGND 经 R47(0Ω) 单点星接 ｜ 124 位号 / 58 网络 ｜ 图幅 A1 ｜ KiCad 格式，可导入嘉立创EDA专业版', 11, '#333', ''],
  [`Rev ${PROJECT.rev}   ${PROJECT.date}`, 11, '#333', ''],
];
tb.forEach(([t, sz, col, wt], i) => {
  o.push(`<text x="${X(W - 14)}" y="${Y(H - 14 - (tb.length - 1 - i) * 7)}" font-size="${sz}" font-weight="${wt || 'normal'}" fill="${col}" text-anchor="end">${e(t)}</text>`);
});

o.push('</svg>');
fs.writeFileSync(DST, o.join('\n'), 'utf8');
console.log(`SVG 已生成: ${DST}`);
console.log(`  元件实例 ${insts.length} / 走线 ${wires.length} / 标签 ${labels.length} / 功能块 ${blockBoxes.length} / 文字 ${texts.length}`);
console.log(`  图幅 A1 (${W}×${H} mm)，${S} px/mm → ${(W * S).toFixed(0)}×${(H * S).toFixed(0)} px`);
