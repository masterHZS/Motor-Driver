/**
 * 版面：显式功能块（带边框与标题）+ 块内自动排布。
 *
 * ★ 图幅 **A1 (841 × 594 mm)** —— 2026-09-14 由 A2 升幅。
 *   原因：补入 FD6288T 六路逻辑输入的 6 只 10 kΩ 下拉（`R41–R46`）后，
 *   A2 已无任何 138×104 mm 以上的空位可用（B1/B3/B5/B7 占满上带、
 *   B8/B10/B6/B9 占满中带、B11 横跨整幅），实测 M 形排列下必然重叠。
 *   升 A1 比把 12 只小电阻硬塞进缝隙更可靠，也顺带把原来就偏紧的间距放宽。
 *
 * 布局：4 列 × 3 行网格 + 底部整宽接口条
 *   x: 10 | 205 | 400 | 595   （列宽 185 / 185 / 185 / 235）
 *   y: 24 | 202.7 | 381.4     （行高 178.7 / 178.7 / 190.6）
 *
 * 每个元件必须**恰好**属于一个功能块（脚本会校验），否则抛错。
 */
import { COMPONENTS } from './design.mjs';

export const PAPER = { w: 841, h: 594 };

/* 列 / 行基准（便于统一调整） */
const CX = [10, 205, 400, 595];
const CY = [24, 202.7, 381.4];

export const BLOCKS = [
  /* ---------------- 上带：左=功率级，中=栅驱动，右=辅助电源 / 母线 ---------------- */
  { id: 'B1', title: '① 功率级：三相半桥 6×MOSFET（每管自带栅极串阻 + 栅源下拉，模块内走线直连）',
    x: CX[0], y: CY[0], w: 185, h: 178.7, cols: 0,
    /* 每个 MOSFET 模块 = [栅极串阻 | 栅源下拉 | MOSFET] 排成一行，
     * 三者的"栅极侧引脚"与 MOSFET 栅极引脚**同一 y（栅极行 gy）**
     * → 该网络全部引脚共线 → kicad.mjs 自动改用走线直连。
     * 反算：R串阻 Y=gy−3.81（其**下**脚接栅极）、R下拉 Y=gy+3.81（其**上**脚接栅极）、MOSFET Y=gy。
     * 栅极行 gy（绝对）= 78.62 / 122.62 / 166.62；模块列 bx = 24 / 96。 */
    explicit: {
      R6: [30, 50.81], R12: [46, 58.43], Q2: [72, 54.62],      /* A 相高边 */
      R1: [30, 94.81], R7:  [46, 102.43], Q1: [72, 98.62],     /* A 相低边 */
      R5: [102, 50.81], R13: [118, 58.43], Q3: [144, 54.62],   /* B 相高边 */
      R2: [102, 94.81], R8:  [118, 102.43], Q5: [144, 98.62],  /* B 相低边 */
      R4: [30, 138.81], R14: [46, 146.43], Q6: [72, 142.62],   /* C 相高边 */
      R3: [102, 138.81], R9:  [118, 146.43], Q4: [144, 142.62],/* C 相低边 */
    } },

  { id: 'B3', title: '③ 栅驱动 FD6288T + 自举', x: CX[1], y: CY[0], w: 195, h: 178.7, cols: 0,
    explicit: { U1: [65, 90], D1: [118, 46], C5: [144, 46], D2: [118, 78], C6: [144, 78],
                D3: [118, 110], C7: [144, 110], C1: [152, 140], C13: [178, 140] } },

  { id: 'B5', title: '⑤ 辅助电源 XL7005A → 12V', x: CX[2], y: CY[0], w: 185, h: 178.7, cols: 0,
    explicit: { U2: [30, 40], C47: [58, 40], L1: [92, 30], D5: [118, 30], C8: [22, 86], C9: [48, 86], C10: [74, 86],
                C11: [106, 86], C12: [160, 86], R10: [22, 130], R11: [48, 130],
                R16: [22, 158], C29: [48, 158] } },

  { id: 'B7', title: '⑦ 母线电容 + 保护', x: CX[3], y: CY[0], w: 235, h: 178.7, cols: 2,
    members: ['F1', 'D4', 'C2', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20'] },

  /* ---------------- 中带：左=相电压采集，中=串阻+下拉，右=电流/电压采样 / LDO ---------------- */
  { id: 'B8', title: '⑧ 相电压采集 + 虚拟中性点 ★核心', x: CX[0], y: CY[1], w: 185, h: 178.7, cols: 7,
    members: ['R17', 'R19', 'R21', 'R23', 'R24', 'R25', 'C24',
              'R18', 'R20', 'R22', 'R26', 'R27', 'R28',
              'C21', 'C22', 'C23', 'C25', 'C26', 'C27'] },

  { id: 'B4', title: '④ MCU → 栅驱动 串阻 + ★驱动器输入下拉（10kΩ，紧贴 U1 引脚）',
    x: CX[1], y: CY[1], w: 185, h: 178.7,
    cols: 6, members: ['R35', 'R36', 'R37', 'R38', 'R39', 'R40',
                       'R41', 'R42', 'R43', 'R44', 'R45', 'R46'] },

  /* ★ 显式摆放：INA181(U3) 的符号体比 R/C 大得多，自动网格会让它压住相邻的小元件，
     故改为手工定位（U3 居中，R/C 分列两侧，全部在 185×48.7 内且互不重叠）。 */
  { id: 'B9', title: '⑨ 母线电流采样（INA181A2 → MCU）', x: CX[2], y: CY[1], w: 185, h: 48.7, cols: 0,
    explicit: { R32: [20, 24], R33: [42, 24], C31: [76, 24], R34: [42, 40],
                U3: [95, 24], C33: [130, 24], R49: [145, 24], C34: [162, 24] } },

  { id: 'B10', title: '⑩ 母线电压采样', x: CX[2], y: 271.4, w: 185, h: 48.7, cols: 3,
    members: ['R30', 'R31', 'C30', 'R48', 'C32'] },

  { id: 'B6', title: '⑥ 3.3V LDO（MCU + INA181）', x: CX[3], y: CY[1], w: 235, h: 48.7, cols: 0,
    explicit: { U4: [30, 24], C40: [86, 20], R53: [58, 20], R52: [86, 40], C41: [128, 20], C42: [128, 40] } },

  /* ---------------- 下带：主控（横跨整幅） + 接口条 ---------------- */
  { id: 'B11', title: '⑪ 主控 HC32F005C6PA（TSSOP-20）★片上主控', x: CX[0], y: CY[2], w: 820, h: 170, cols: 0,
    explicit: { U5: [74, 52],
                /* ★ 走线直连簇：把「芯片旁的小元件 / 测试点」**对齐到 MCU 引脚所在行**，
                 *   使这些网络的全部引脚共线 → kicad.mjs 自动改用一根正交直走线（不再靠标号）。
                 * 坐标由 U5 原点绝对位置 (84, 433.4) 反算：左侧脚 x=68.76、右侧脚 x=99.24；
                 *   引脚行 y：U5.4(RESETB)=429.59  U5.8(VCAP)=439.75  U5.17(SWDIO)=429.59
                 *             U5.18(SWCLK)=427.05  U5.12(UART_TX)=442.29
                 * 元件原点 = 目标引脚 y + 引脚偏移（C/R 上脚偏 3.81，TP 单脚偏 2.54） */
                C46: [40, 52.0], C43: [28, 62.16], C44: [206, 22], C45: [230, 22], R47: [292, 22], R50: [560, 30],
                TP5: [18, 50.73], TP3: [114, 50.73], TP4: [129, 48.19], TP6: [114, 63.43],
                /* 其余测试点仍用阵列摆放（其网络未对齐，会自动退回标签画法） */
                TP1: [182, 46], TP2: [236, 46], TP7: [506, 46],
                TP8: [182, 70], TP9: [236, 70], TP10: [290, 70], TP11: [344, 70], TP12: [398, 70], TP13: [452, 70], TP14: [506, 70],
                TP15: [182, 93], TP16: [236, 93], TP17: [290, 93], TP18: [344, 93], TP19: [398, 93],
                '#FLG1': [480, 26], '#FLG2': [520, 26], '#FLG3': [650, 26], '#FLG4': [690, 26] },
    note: [
      '引脚分配（AF 号取自官方参考手册 Rev2.50 的 Pxx_SEL 位定义，非推断）：',
      '  6路PWM：P23=TIM4_CHA(A高) P15=TIM4_CHB(A低) │ P25=TIM5_CHA(B高) P26=TIM5_CHB(B低) │ P36=TIM6_CHA(C高,SEL2) P32=TIM6_CHB(C低)',
      '  5路模拟：P24=AIN0(A相电压) P33=AIN3(B相电压) P02=AIN8(C相电压) P35=AIN5(母线电流) P01=AIN7(母线电压)',
      '  其它：P14=UART0_TXD  P27/P31=SWDIO/SWCLK  P00=RESETB  P03/P34=空闲(no-connect)  VCAP(脚8)=4.7µF',
      '★调试焊盘（TP1–TP19，SMT 测试点 C5846954）——需引出焊盘的引脚全在这里，MCU 已用 IO 一个不漏：',
      '  TP1=3V3  TP2=GND  TP3=SWDIO(P27/脚17)  TP4=SWCLK(P31/脚18)  TP5=RESETB(P00/脚4)  TP6=UART_TX(P14/脚12)',
      '  TP7=A相电压(P24/脚14)  TP8=B相电压(P33/脚20)  TP9=C相电压(P02/脚6)  TP10=母线电流(P35/脚2)  TP11=母线电压(P01/脚5)',
      '  TP12..TP17=六路PWM：AH(P23/脚13) AL(P15/脚11) BH(P25/脚15) BL(P26/脚16) CH(P36/脚3) CL(P32/脚19)  TP18=VCC12V  TP19=PGND',
      '  R50=复位上拉  R53=12V→LDO_VIN桥接  R52=LDO→VDD_3V3桥接',
      '⚠️ P27/P31 支持 SWD 或 UART ISP；P35/P36 部分被 ADC/PWM 占用，优先使用 P27/P31。⚠️ 无 VC 硬件刹车 → 软件限流 + FD6288T 自带 SCP。',
    ] },

  { id: 'B12', title: '⑫ 对外接口（悬空网络 · 本板无连接器元件）', x: CX[0], y: 556, w: 820, h: 22, cols: 0,
    explicit: {},
    note: [
      '【电源/三相】VBUS_IN(母线正,经F1)  PGND  PH_A  PH_B  PH_C ｜【调试】SWDIO→TP3  SWCLK→TP4  UART_TX ｜【降压】EN 经下拉电阻接 PGND（EN 低有效 → 恒 0V = 永远使能）',
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
