/**
 * 版面：显式功能块（带边框与标题）+ 块内自动排布。
 * 图幅 A2 (594 × 420 mm)。标题置于框外，元件与标题不重叠。
 *
 * 每个元件必须**恰好**属于一个功能块（脚本会校验），否则抛错。
 */
import { COMPONENTS } from './design.mjs';

export const PAPER = { w: 594, h: 420 };

export const BLOCKS = [
  { id: 'B1', title: '① 功率级（三相半桥 6×MOSFET）', x: 12, y: 24, w: 158, h: 74,
    cols: 3, members: ['Q2', 'Q3', 'Q6', 'Q1', 'Q5', 'Q4'] },

  { id: 'B2', title: '② 栅极电阻 + 栅源下拉', x: 12, y: 106, w: 158, h: 56,
    cols: 6, members: ['R6', 'R5', 'R4', 'R1', 'R2', 'R3', 'R12', 'R13', 'R14', 'R7', 'R8', 'R9'] },

  { id: 'B3', title: '③ 栅驱动 FD6288T + 自举', x: 178, y: 24, w: 136, h: 138, cols: 0,
    explicit: { U1: [40, 68], D1: [92, 24], C5: [114, 24], D2: [92, 54], C6: [114, 54],
                D3: [92, 84], C7: [114, 84], C1: [96, 112], C13: [118, 112] } },

  { id: 'B4', title: '④ MCU → 栅驱动 串阻（3.3V，VIH 2.7V）', x: 178, y: 170, w: 136, h: 62,
    cols: 3, members: ['R35', 'R36', 'R37', 'R38', 'R39', 'R40'] },

  { id: 'B5', title: '⑤ 辅助电源 XL7005A → 12V', x: 322, y: 24, w: 122, h: 138, cols: 0,
    explicit: { U2: [34, 34], L1: [86, 26], D5: [106, 26], C8: [22, 72], C9: [44, 72], C10: [66, 72],
                C11: [90, 72], C12: [110, 72], R10: [22, 106], R11: [44, 106],
                R15: [22, 130], R16: [44, 130], C29: [66, 130] } },

  { id: 'B6', title: '⑥ 3.3V LDO（MCU + INA181）', x: 322, y: 170, w: 122, h: 62, cols: 0,
    explicit: { U4: [30, 20], C40: [72, 16], C41: [94, 16], C42: [94, 42] } },
  { id: 'B6b', title: '', x: 0, y: 0, w: 0, h: 0, explicit: {} },

  { id: 'B7', title: '⑦ 母线电容 + 保护', x: 452, y: 24, w: 130, h: 138, cols: 2,
    members: ['F1', 'D4', 'C2', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20'] },

  { id: 'B8', title: '⑧ 相电压采集 + 虚拟中性点 ★核心', x: 12, y: 170, w: 300, h: 104, cols: 7,
    members: ['R17', 'R19', 'R21', 'R23', 'R24', 'R25', 'C24',
              'R18', 'R20', 'R22', 'R26', 'R27', 'R28',
              'C21', 'C22', 'C23', 'C25', 'C26', 'C27'] },

  { id: 'B9', title: '⑨ 母线电流采样（INA181A2 → MCU）', x: 452, y: 170, w: 130, h: 104, cols: 2,
    members: ['R32', 'R33', 'R34', 'C31', 'U3', 'C33', 'R49', 'C34'] },

  { id: 'B10', title: '⑩ 母线电压采样', x: 322, y: 240, w: 122, h: 34, cols: 3,
    members: ['R30', 'R31', 'C30', 'R48', 'C32'] },

  { id: 'B11', title: '⑪ 主控 HC32F005C6PA（TSSOP-20）★片上主控', x: 12, y: 282, w: 570, h: 100, cols: 0,
    explicit: { U5: [78, 52], C43: [190, 22], C44: [214, 22], C45: [238, 22], C46: [262, 22], R47: [300, 22],
                /* 调试测试点 TP1–TP19：7 列 × 3 行阵列，铺在主控块右下空白区
                 * 顺序 = 3V3/GND/SWDIO/SWCLK/RESETB/UART_TX | 5 路模拟 | 6 路 PWM | VCC/PGND */
                TP1: [188, 46], TP2: [242, 46], TP3: [296, 46], TP4: [350, 46], TP5: [404, 46], TP6: [458, 46], TP7: [512, 46],
                TP8: [188, 70], TP9: [242, 70], TP10: [296, 70], TP11: [350, 70], TP12: [404, 70], TP13: [458, 70], TP14: [512, 70],
                TP15: [188, 93], TP16: [242, 93], TP17: [296, 93], TP18: [350, 93], TP19: [404, 93],
                '#FLG1': [486, 26], '#FLG2': [524, 26] },
    note: [
      '引脚分配（AF 号取自官方参考手册 Rev2.50 的 Pxx_SEL 位定义，非推断）：',
      '  6路PWM：P23=TIM4_CHA(A高) P34=TIM4_CHB(A低) │ P25=TIM5_CHA(B高) P26=TIM5_CHB(B低) │ P36=TIM6_CHA(C高,AF2) P32=TIM6_CHB(C低)',
      '  5路模拟：P24=AIN0(A相电压) P33=AIN3(B相电压) P02=AIN8(C相电压) P35=AIN5(母线电流) P01=AIN7(母线电压)',
      '  其它：P14=UART0_TXD  P27/P31=SWDIO/SWCLK  P00=RESETB  P03/P15=空闲(no-connect)  VCAP(脚8)=4.7µF',
      '★调试焊盘（TP1–TP19，SMT 测试点 C5846954）——需引出焊盘的引脚全在这里，MCU 已用 IO 一个不漏：',
      '  TP1=3V3  TP2=GND  TP3=SWDIO(P27/脚17)  TP4=SWCLK(P31/脚18)  TP5=RESETB(P00/脚4)  TP6=UART_TX(P14/脚12)',
      '  TP7=A相电压(P24/脚14)  TP8=B相电压(P33/脚20)  TP9=C相电压(P02/脚6)  TP10=母线电流(P35/脚2)  TP11=母线电压(P01/脚5)',
      '  TP12..TP17=六路PWM：AH(P23/脚13) AL(P34/脚1) BH(P25/脚15) BL(P26/脚16) CH(P36/脚3) CL(P32/脚19)  TP18=VCC12V  TP19=PGND',
      '⚠️ ISP 编程口 P35/P36 已被占用 → 必须用 SWD 烧录；⚠️ 无 VC 硬件刹车 → 软件限流 + FD6288T 自带 SCP。',
    ] },

  { id: 'B12', title: '⑫ 对外接口（悬空网络 · 本板无连接器元件）', x: 12, y: 388, w: 570, h: 22, cols: 0,
    explicit: {},
    note: [
      '【电源/三相】VBUS_IN(母线正,经F1)  PGND  PH_A  PH_B  PH_C ｜【调试】SWDIO→TP3  SWCLK→TP4  UART_TX ｜【降压】EN（已由 R15/R16 分压板内自动使能，UVLO ≈12.1V，无需人工短接）',
    ] },
];

/* ★ 所有坐标先吸附到 0.01 mm 网格：
 * 否则自动排布会算出 45.3333… 这类无限小数，emit 时被四舍五入到 3 位小数，
 * 而 build.mjs 用「四舍五入到 0.001」的键反查引脚坐标 → 永远匹配不上（曾导致 287 个引脚全部"未覆盖"）。
 * 注意：必须在整数网格上舍入（不能乘 1000 取整），否则会破坏 KiCad 的 0.01 mm 网格对齐。 */
const snap = (v) => Math.round(v * 100) / 100;

const PLACE = {};
for (const b of BLOCKS) {
  if (b.explicit) {
    for (const [ref, [dx, dy]] of Object.entries(b.explicit)) PLACE[ref] = { x: snap(b.x + dx), y: snap(b.y + dy) };
    continue;
  }
  const n = b.members.length, cols = b.cols, rows = Math.max(1, Math.ceil(n / cols));
  const x0 = b.x + 10, x1 = b.x + b.w - 8;
  const y0 = b.y + 16, y1 = b.y + b.h - 10;
  const px = (x1 - x0) / cols, py = (y1 - y0) / rows;
  b.members.forEach((ref, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    PLACE[ref] = { x: snap(x0 + px * (c + 0.5)), y: snap(y0 + py * (r + 0.5)) };
  });
}

const missing = COMPONENTS.filter(c => !PLACE[c.ref]).map(c => c.ref);
if (missing.length) throw new Error(`以下元件未安排坐标: ${missing.join(', ')}`);
const refsOf = (s) => s.split(/\s+/).filter(t => /^[A-Z]+\d+$/.test(t));
const seen = new Set();
for (const b of BLOCKS) {
  const list = b.members ?? Object.keys(b.explicit ?? {});
  for (const r of list) {
    if (seen.has(r)) throw new Error(`元件 ${r} 被两个功能块占用`);
    seen.add(r);
  }
  for (const txt of (b.note ?? [])) for (const r of refsOf(txt)) if (seen.has(r) && !list.includes(r)) throw new Error(`说明文字里的 ${r} 被误判为元件`);
}
if (seen.size !== COMPONENTS.length) {
  const designRefs = new Set(COMPONENTS.map(c => c.ref));
  const extra = [...seen].filter(r => !designRefs.has(r));
  const unplaced = COMPONENTS.filter(c => !seen.has(c.ref)).map(c => c.ref);
  throw new Error(`功能块覆盖 ${seen.size} 个元件，应为 ${COMPONENTS.length}` +
    (extra.length ? `\n  多余（功能块里写了但设计里没有）: ${extra.join(', ')}` : '') +
    (unplaced.length ? `\n  漏掉（设计里有但未排布）: ${unplaced.join(', ')}` : ''));
}
export { PLACE };
