/**
 * 版面：显式功能块 + 块内显式排布。A2 图幅 594 × 420 mm。
 *
 * ── 排布原则（配合 router.mjs / wires.mjs）──────────────────────────
 *  1. 芯片的**串联小元件**（串阻/自举二极管/自举电容/去耦）贴到对应引脚旁，
 *     且与引脚**同行**，让正交布线短、不压符号。
 *  2. 电源/地/母线引脚只留短引线给 global_label。
 *  3. 6 个 MOSFET 各自带栅极串阻 + G-S 下拉，构成独立模块（需求 3），
 *     模块内走线见 wires.mjs 的 NMOS_TEMPLATE。
 *
 * ★ 所有坐标先吸附 0.01 mm 网格。
 * ★ 每个元件必须恰好属于一个功能块（下面会校验）。
 */
import { COMPONENTS } from './design.mjs';

export const PAPER = { w: 594, h: 420 };

export const BLOCKS = [
  { id: 'B1', title: '① 功率级（三相半桥 6×MOSFET · 每管独立栅极模块）', x: 12, y: 20, w: 290, h: 168 },
  { id: 'B2', title: '② 栅驱动 FD6288T + 自举 + 去耦', x: 12, y: 196, w: 290, h: 108 },
  { id: 'B3', title: '③ 辅助电源 XL7005A → 12V', x: 12, y: 312, w: 290, h: 100 },
  { id: 'B4', title: '④ 母线电容 + 保护', x: 310, y: 20, w: 130, h: 168 },
  { id: 'B5', title: '⑤ 主控 HC32F005C6PA（TSSOP-20）+ 模拟前端 + 调试焊盘', x: 310, y: 196, w: 272, h: 216 },
  { id: 'B6', title: '⑥ 母线电压采样 + 3.3V LDO', x: 448, y: 20, w: 134, h: 168 },
  { id: 'B7', title: '⑦ 母线电流采样（INA181A2）', x: 448, y: 20, w: 0.01, h: 0.01 },
  { id: 'B8', title: '⑧ 相电压采集 + 虚拟中性点 ★核心', x: 448, y: 20, w: 0.01, h: 0.01 },
];

const snap = (v) => Math.round(v * 100) / 100;
const P = {};
const at = (id, ref, dx, dy) => {
  if (P[ref]) throw new Error(`元件 ${ref} 被重复排布`);
  P[ref] = { b: id, x: snap(dx), y: snap(dy) };
};
const B = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));

/* ================================================================
 * ① 功率级：6 个独立 MOSFET 模块（3 列 × 2 行）
 * 锚点 = NMOS 中心；模块模板见 wires.mjs
 * ================================================================ */
const MOD = {
  A: { hi: 'Q2', lo: 'Q1', rgHi: 'R6', rgLo: 'R1', gsHi: 'R12', gsLo: 'R7' },
  B: { hi: 'Q3', lo: 'Q5', rgHi: 'R5', rgLo: 'R2', gsHi: 'R13', gsLo: 'R8' },
  C: { hi: 'Q6', lo: 'Q4', rgHi: 'R4', rgLo: 'R3', gsHi: 'R14', gsLo: 'R9' },
};
{
  const id = 'B1';
  const ORG = { A: [62, 40], B: [152, 40], C: [242, 40] };
  for (const [ph, m] of Object.entries(MOD)) {
    const [ox, oy] = ORG[ph];
    for (const [side, dy, rg, gs] of [['hi', 0, m.rgHi, m.gsHi], ['lo', 78, m.rgLo, m.gsLo]]) {
      at(id, m[side], ox, oy + dy);
      at(id, rg, ox - 33.02, oy + dy - 11.43);
      at(id, gs, ox - 22.86, oy + dy - 22.86);
    }
  }
  /* 低边就近陶瓷去耦（VCC_BUS ↔ LS_STAR），挂在模块右侧空位 */
  at(id, 'C18', 22, 36);
  at(id, 'C19', 22, 66);
  at(id, 'C20', 22, 96);
}

/* ================================================================
 * ② 栅驱动 FD6288T + 自举 + 去耦
 * 自举：Dn 阳极 = VCC（标签），阴极 = VBn；Cn 跨 VBn–VSx
 * ================================================================ */
{
  const id = 'B2', ux = 60, uy = 62;
  at(id, 'U1', ux, uy);
  /* 自举：Dn 阴极 = VBn（接 U1 的 VBn 脚），Cn 跨 VBn–VSx */
  const VB = { 1: 13.97, 2: 3.81, 3: -6.35 };
  const VS = { 1: 1.27, 2: -8.89, 3: -19.05 };
  for (const k of [1, 2, 3]) {
    at(id, `D${k}`, ux + 40, uy - VB[k] + 3.81);      // 竖直：pin1(阴极)=VBn 在上
    at(id, `C${k + 4}`, ux + 62, uy - (VB[k] + VS[k]) / 2);  // 跨 VBn–VSx
  }
  at(id, 'C1', ux + 104, uy - 22);
  at(id, 'C13', ux + 104, uy - 4);
}

/* ================================================================
 * ③ 辅助电源 XL7005A
 * ================================================================ */
{
  const id = 'B3', ux = 50, uy = 46;
  at(id, 'U2', ux, uy);
  at(id, 'L1', ux + 58, uy - 5.08);
  at(id, 'D5', ux + 58, uy + 7.62);
  at(id, 'C8', ux + 96, uy - 20);
  at(id, 'C9', ux + 114, uy - 20);
  at(id, 'C10', ux + 132, uy - 20);
  at(id, 'C11', ux + 150, uy - 20);
  at(id, 'C12', ux + 168, uy - 20);
  at(id, 'R10', ux + 96, uy + 34);
  at(id, 'R11', ux + 112, uy + 34);
  at(id, 'R15', ux + 140, uy + 34);
  at(id, 'R16', ux + 156, uy + 34);
  at(id, 'C29', ux + 172, uy + 34);
}

/* ================================================================
 * ④ 母线电容 + 保护
 * ================================================================ */
{
  const id = 'B4';
  at(id, 'F1', 30, 26);
  at(id, 'D4', 78, 26);
  at(id, 'C2', 30, 62);
  at(id, 'C14', 56, 62);
  at(id, 'C15', 82, 62);
  at(id, 'C16', 30, 94);
  at(id, 'C17', 56, 94);
}

/* ================================================================
 * ⑤ 主控 + 模拟前端 + 调试焊盘
 * ================================================================ */
{
  const id = 'B5', ux = 150, uy = 60;
  at(id, 'U5', ux, uy);
  /* 串阻：与 MCU 引脚同行（图纸 y = uy - 符号 y，见 SYMDEFS.MCU） */
  const LY = { 1: -11.43, 2: -8.89, 3: -6.35, 4: -3.81, 5: -1.27, 6: 1.27, 7: 3.81, 8: 6.35, 9: 8.89, 10: 11.43 };
  const RY = { 11: 11.43, 12: 8.89, 13: 6.35, 14: 3.81, 15: 1.27, 16: -1.27, 17: -3.81, 18: -6.35, 19: -8.89, 20: -11.43 };
  /* 左带串阻（x = ux-96）：pin2 与 MCU 脚同行；两列交错避免本体相撞 */
  at(id, 'R36', ux - 96, uy - LY[1]);
  at(id, 'R49', ux - 78, uy - LY[2] - 3.81);
  at(id, 'R39', ux - 96, uy - LY[3] - 7.62);
  at(id, 'R48', ux - 78, uy - LY[5] - 11.43);
  at(id, 'R28', ux - 96, uy - LY[6] - 15.24);
  /* 右带串阻：两列交错（x = ux+56 / ux+76），节距 12.7 mm */
  at(id, 'R40', ux + 56, uy - RY[11]);
  at(id, 'R35', ux + 76, uy - RY[13] - 12.70);
  at(id, 'R26', ux + 56, uy - RY[14] - 25.40);
  at(id, 'R37', ux + 76, uy - RY[15] - 38.10);
  at(id, 'R38', ux + 56, uy - RY[16] - 50.80);
  at(id, 'R27', ux + 76, uy - RY[20] - 63.50);
  /* 模拟前端滤波电容 */
  at(id, 'C25', ux - 44, uy - 20);
  at(id, 'C26', ux - 44, uy - 4);
  at(id, 'C34', ux - 66, uy + 12);
  at(id, 'C27', ux - 66, uy + 26);
  at(id, 'C32', ux - 66, uy + 40);
  at(id, 'C46', ux + 74, uy + 18);
  at(id, 'C43', ux + 74, uy + 32);
  at(id, 'C44', ux - 20, uy + 52);
  at(id, 'C45', ux - 4, uy + 52);
  at(id, 'R47', ux - 40, uy + 52);
  at(id, '#FLG1', ux - 26, uy - 22);
  at(id, '#FLG2', ux - 44, uy - 22);
  /* 相电压分压 + 虚拟中性点 */
  const DIV = [
    { up: 'R17', dn: 'R18', c: 'C21', star: 'R23' },
    { up: 'R19', dn: 'R20', c: 'C22', star: 'R24' },
    { up: 'R21', dn: 'R22', c: 'C23', star: 'R25' },
  ];
  DIV.forEach((d, i) => {
    const y = uy + 78 + i * 22;
    at(id, d.up, ux - 92, y);
    at(id, d.dn, ux - 92, y + 11);
    at(id, d.c, ux - 66, y + 11);
    at(id, d.star, ux - 66, y);
  });
  at(id, 'C24', ux - 30, uy + 78);
  /* 母线电压采样 */
  at(id, 'R30', ux + 74, uy + 60);
  at(id, 'R31', ux + 74, uy + 74);
  at(id, 'C30', ux + 96, uy + 74);
  /* 3.3V LDO */
  at(id, 'U4', ux + 128, uy + 130);
  at(id, 'C40', ux + 112, uy + 156);
  at(id, 'C41', ux + 156, uy + 156);
  at(id, 'C42', ux + 172, uy + 156);
  /* 母线电流采样 */
  at(id, 'U3', ux + 120, uy + 40);
  at(id, 'C33', ux + 122, uy + 66);
  at(id, 'R32', ux + 74, uy + 92);
  at(id, 'R33', ux + 100, uy + 92);
  at(id, 'R34', ux + 100, uy + 104);
  at(id, 'C31', ux + 118, uy + 104);
  /* 调试焊盘 */
  const order = ['TP1', 'TP2', 'TP3', 'TP4', 'TP5', 'TP6', 'TP7', 'TP8', 'TP9', 'TP10',
                 'TP11', 'TP12', 'TP13', 'TP14', 'TP15', 'TP16', 'TP17', 'TP18', 'TP19'];
  order.forEach((ref, i) => {
    const c = i % 2, r = Math.floor(i / 2);
    at(id, ref, ux - 130 + c * 60, uy + 118 + r * 14);
  });
}

/* ================================================================
 * 落位
 * ================================================================ */
export const PLACE = {};
export const BLOCK_OF = {};
for (const [ref, p] of Object.entries(P)) {
  const b = B[p.b];
  if (!b) throw new Error(`元件 ${ref} 引用了不存在的功能块 ${p.b}`);
  PLACE[ref] = { x: snap(b.x + p.x), y: snap(b.y + p.y) };
  BLOCK_OF[ref] = p.b;
}

const missing = COMPONENTS.filter((c) => !PLACE[c.ref]).map((c) => c.ref);
if (missing.length) throw new Error(`以下元件未安排坐标: ${missing.join(', ')}`);

export const blockOf = (ref) => BLOCK_OF[ref];
