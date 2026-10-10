/**
 * V3.0 原理图单一数据源（Single Source of Truth）
 * 三相无刷电机驱动板 —— HC32F005C6PA 片上主控 + 无感六步换向 + 反电动势过零检测
 *
 * ── 与 V2.1 的根本差别 ──────────────────────────────────────────────
 *  1. 主控 HC32F005C6PA（TSSOP-20）**画在本板上**，直接驱动 FD6288T
 *     → V2.1 的 6 路 PWM 对外接口（PWM_*_IN）+ 串阻/下拉全部取消
 *  2. 相电压采集改为**直接进 MCU 的 ADC**（3 路），不再对外引出
 *  3. 母线电流改为**板上 INA181A2 放大 → MCU ADC**（V2.1 是对外差分引出）
 *  4. 新增 3.3V LDO（MCU 供电）、母线电压采样也进 MCU
 *  5. 母线 16.8V 上限 → 分流/保险丝/TVS 全部按新电流（8.8A / 过流 13A）重选
 *
 * ── 引脚分配依据 ────────────────────────────────────────────────────
 *  `03_审核/HC32F005_引脚分配.md`（已与官方数据手册 Rev3.00 逐脚核对）
 *
 * ── 自检约束 ────────────────────────────────────────────────────────
 *  每个元件的每个引脚必须**恰好**出现在一个网络里。
 *  V3.0 的对外接口只有 4 个（VBUS_IN / PGND_MAIN / PH_A / PH_B / PH_C），
 *  用 INTERFACE_NETS 标记为「允许只有 1 个成员」的悬空网络。
 */

/* ============================ 元件 ============================ */
export const COMPONENTS = [
  /* ---------- ① 功率级（三相半桥，6×MOSFET） ---------- */
  { ref: 'Q1', val: 'HYG053N10NS1C2', sym: 'NMOS', fp: 'PDFN-8_L5.8-W5.0-P1.27-LS6.2-BL', desc: 'A相低边' },
  { ref: 'Q2', val: 'HYG053N10NS1C2', sym: 'NMOS', fp: 'PDFN-8_L5.8-W5.0-P1.27-LS6.2-BL', desc: 'A相高边' },
  { ref: 'Q3', val: 'HYG053N10NS1C2', sym: 'NMOS', fp: 'PDFN-8_L5.8-W5.0-P1.27-LS6.2-BL', desc: 'B相高边' },
  { ref: 'Q5', val: 'HYG053N10NS1C2', sym: 'NMOS', fp: 'PDFN-8_L5.8-W5.0-P1.27-LS6.2-BL', desc: 'B相低边' },
  { ref: 'Q6', val: 'HYG053N10NS1C2', sym: 'NMOS', fp: 'PDFN-8_L5.8-W5.0-P1.27-LS6.2-BL', desc: 'C相高边' },
  { ref: 'Q4', val: 'HYG053N10NS1C2', sym: 'NMOS', fp: 'PDFN-8_L5.8-W5.0-P1.27-LS6.2-BL', desc: 'C相低边' },

  /* ---------- ② 栅驱动 FD6288T + 自举 + 栅极电阻/下拉 ---------- */
  { ref: 'U1', val: 'FD6288T', sym: 'FD6288T', fp: 'TSSOP-20_L6.5-W4.4-P0.65-LS6.4-BL', desc: '三相栅极驱动' },
  { ref: 'R1', val: '10Ω', sym: 'R', fp: 'R0603', desc: 'Q1 栅极电阻（A低）' },
  { ref: 'R2', val: '10Ω', sym: 'R', fp: 'R0603', desc: 'Q5 栅极电阻（B低）' },
  { ref: 'R3', val: '10Ω', sym: 'R', fp: 'R0603', desc: 'Q4 栅极电阻（C低）' },
  { ref: 'R4', val: '10Ω', sym: 'R', fp: 'R0603', desc: 'Q6 栅极电阻（C高）' },
  { ref: 'R5', val: '10Ω', sym: 'R', fp: 'R0603', desc: 'Q3 栅极电阻（B高）' },
  { ref: 'R6', val: '10Ω', sym: 'R', fp: 'R0603', desc: 'Q2 栅极电阻（A高）' },
  { ref: 'R7', val: '20kΩ', sym: 'R', fp: 'R0603', desc: '★Q1 G-S 下拉（低边）' },
  { ref: 'R8', val: '20kΩ', sym: 'R', fp: 'R0603', desc: '★Q5 G-S 下拉（低边）' },
  { ref: 'R9', val: '20kΩ', sym: 'R', fp: 'R0603', desc: '★Q4 G-S 下拉（低边）' },
  { ref: 'R12', val: '20kΩ', sym: 'R', fp: 'R0603', desc: 'Q2 G-S 下拉（高边）' },
  { ref: 'R13', val: '20kΩ', sym: 'R', fp: 'R0603', desc: 'Q3 G-S 下拉（高边）' },
  { ref: 'R14', val: '20kΩ', sym: 'R', fp: 'R0603', desc: 'Q6 G-S 下拉（高边）' },
  { ref: 'C1', val: '1µF', sym: 'C', fp: 'C0603', desc: 'U1 VCC 去耦' },
  { ref: 'C13', val: '100nF', sym: 'C', fp: 'C0603', desc: 'U1 VCC 高频去耦' },
  { ref: 'C5', val: '470nF', sym: 'C', fp: 'C0603', desc: '自举电容 A（50V）' },
  { ref: 'C6', val: '470nF', sym: 'C', fp: 'C0603', desc: '自举电容 B（50V）' },
  { ref: 'C7', val: '470nF', sym: 'C', fp: 'C0603', desc: '自举电容 C（50V）' },
  { ref: 'D1', val: 'ES1D', sym: 'D', fp: 'SMA_L4.3-W2.6-LS5.0-RD', desc: '自举二极管 A' },
  { ref: 'D2', val: 'ES1D', sym: 'D', fp: 'SMA_L4.3-W2.6-LS5.0-RD', desc: '自举二极管 B' },
  { ref: 'D3', val: 'ES1D', sym: 'D', fp: 'SMA_L4.3-W2.6-LS5.0-RD', desc: '自举二极管 C' },

  /* ---------- ④ MCU → 栅驱动 串阻（抑制振铃：3.3V 驱动、VIH 2.7V，余量仅 0.6V） ---------- */
  { ref: 'R35', val: '100Ω', sym: 'R', fp: 'R0603', desc: 'HIN1 串阻（P23/TIM4_CHA）' },
  { ref: 'R36', val: '100Ω', sym: 'R', fp: 'R0603', desc: 'LIN1 串阻（P34/TIM4_CHB）' },
  { ref: 'R37', val: '100Ω', sym: 'R', fp: 'R0603', desc: 'HIN2 串阻（P25/TIM5_CHA）' },
  { ref: 'R38', val: '100Ω', sym: 'R', fp: 'R0603', desc: 'LIN2 串阻（P26/TIM5_CHB）' },
  { ref: 'R39', val: '100Ω', sym: 'R', fp: 'R0603', desc: 'HIN3 串阻（P36/TIM6_CHA）' },
  { ref: 'R40', val: '100Ω', sym: 'R', fp: 'R0603', desc: 'LIN3 串阻（P32/TIM6_CHB）' },

  /* ---------- ④ 辅助电源：XL7005A 12V ---------- */
  { ref: 'U2', val: 'XL7005A', sym: 'XL7005A', fp: 'SOIC-8_L4.9-W3.9-P1.27-LS6.0-BL-EP3.1-1', desc: '降压 DC-DC（→12V）' },
  { ref: 'L1', val: '47µH', sym: 'L', fp: 'IND-SMD_L6.0-W6.0_LPS6225', desc: '降压电感' },
  { ref: 'D5', val: 'SS110-LTP', sym: 'DSCH', fp: 'SMA_L4.3-W2.6-LS5.2-RD', desc: '续流二极管' },
  { ref: 'R10', val: '8.66kΩ', sym: 'R', fp: 'R0603', desc: 'FB 上分压' },
  { ref: 'R11', val: '1kΩ', sym: 'R', fp: 'R0603', desc: 'FB 下分压' },
  { ref: 'R15', val: '130kΩ', sym: 'R', fp: 'R0603', desc: 'EN UVLO 上分压' },
  { ref: 'R16', val: '15kΩ', sym: 'R', fp: 'R0603', desc: '★EN/UVLO 下分压（15kΩ → 母线 ≥12.1V 启动）' },
  { ref: 'C29', val: '100nF', sym: 'C', fp: 'C0603', desc: 'EN 滤波' },
  { ref: 'C8', val: '1µF', sym: 'C', fp: 'C0603', desc: 'VCC 就近去耦 A' },
  { ref: 'C9', val: '1µF', sym: 'C', fp: 'C0603', desc: 'VCC 就近去耦 B' },
  { ref: 'C10', val: '1µF', sym: 'C', fp: 'C0603', desc: 'VCC 就近去耦 C' },
  { ref: 'C11', val: '100µF', sym: 'CP', fp: 'CAP-TH_BD8.0-P3.50-D0.5-FD', desc: 'VCC 输出滤波' },
  { ref: 'C12', val: '100nF', sym: 'C', fp: 'C0603', desc: 'VCC 高频' },

  /* ---------- ⑤ 3.3V LDO（MCU 供电） ---------- */
  { ref: 'U4', val: 'AMS1117-3.3', sym: 'LDO', fp: 'SOT-223-3_L6.5-W3.5-P2.30-LS7.0-BR', desc: '3.3V LDO（VCC 12V → 3.3V）' },
  { ref: 'C40', val: '10µF', sym: 'C', fp: 'C0805', desc: 'LDO 输入电容' },
  { ref: 'C41', val: '22µF', sym: 'C', fp: 'C0805', desc: 'LDO 输出电容' },
  { ref: 'C42', val: '100nF', sym: 'C', fp: 'C0603', desc: 'LDO 输出高频' },

  /* ---------- ⑥ 母线电容 + 保护 ---------- */
  { ref: 'F1', val: 'FUSE-15A-T', sym: 'FUSE', fp: 'F1206', desc: '★母线保险丝 慢熔 15A/32V' },
  { ref: 'D4', val: 'SMBJ33A', sym: 'DTVS', fp: 'SMB_L4.3-W3.5-LS5.3-RD', desc: '★母线 TVS（Vwm 33V / Vclamp 53.3V）' },
  { ref: 'C2', val: '100nF', sym: 'C', fp: 'C0805', desc: '母线陶瓷（50V）' },
  { ref: 'C14', val: '100µF', sym: 'CP', fp: 'CAP-SMD_BD6.3-L6.6-W6.6-LS7.3-FD-H7.7', desc: '母线电解' },
  { ref: 'C15', val: '47µF', sym: 'CP', fp: 'CAP-SMD_BD6.3-L6.6-W6.6-LS7.3-FD', desc: '母线电解' },
  { ref: 'C16', val: '47µF', sym: 'CP', fp: 'CAP-SMD_BD6.3-L6.6-W6.6-LS7.3-FD', desc: '母线电解' },
  { ref: 'C17', val: '47µF', sym: 'CP', fp: 'CAP-SMD_BD6.3-L6.6-W6.6-LS7.3-FD', desc: '母线电解' },
  { ref: 'C18', val: '1µF', sym: 'C', fp: 'C1206', desc: '高边 A 就近陶瓷' },
  { ref: 'C19', val: '1µF', sym: 'C', fp: 'C1206', desc: '高边 B 就近陶瓷' },
  { ref: 'C20', val: '1µF', sym: 'C', fp: 'C1206', desc: '高边 C 就近陶瓷' },

  /* ---------- ⑦ 相电压采集 + 虚拟中性点 ---------- */
  { ref: 'R17', val: '150kΩ', sym: 'R', fp: 'R0603', desc: 'A 相分压上' },
  { ref: 'R18', val: '10kΩ', sym: 'R', fp: 'R0603', desc: 'A 相分压下' },
  { ref: 'C21', val: '1nF', sym: 'C', fp: 'C0603', desc: 'A 相一级滤波' },
  { ref: 'R19', val: '150kΩ', sym: 'R', fp: 'R0603', desc: 'B 相分压上' },
  { ref: 'R20', val: '10kΩ', sym: 'R', fp: 'R0603', desc: 'B 相分压下' },
  { ref: 'C22', val: '1nF', sym: 'C', fp: 'C0603', desc: 'B 相一级滤波' },
  { ref: 'R21', val: '150kΩ', sym: 'R', fp: 'R0603', desc: 'C 相分压上' },
  { ref: 'R22', val: '10kΩ', sym: 'R', fp: 'R0603', desc: 'C 相分压下' },
  { ref: 'C23', val: '1nF', sym: 'C', fp: 'C0603', desc: 'C 相一级滤波' },
  { ref: 'R23', val: '100kΩ', sym: 'R', fp: 'R0603', desc: '虚拟中性点星 A' },
  { ref: 'R24', val: '100kΩ', sym: 'R', fp: 'R0603', desc: '虚拟中性点星 B' },
  { ref: 'R25', val: '100kΩ', sym: 'R', fp: 'R0603', desc: '虚拟中性点星 C' },
  { ref: 'C24', val: '270pF', sym: 'C', fp: 'C0603', desc: '★VN 配容（保证与三相时间常数对称）' },
  { ref: 'R26', val: '1kΩ', sym: 'R', fp: 'R0603', desc: 'AIN0 串阻（A 相）' },
  { ref: 'C25', val: '1nF', sym: 'C', fp: 'C0603', desc: 'AIN0 滤波（A 相）' },
  { ref: 'R27', val: '1kΩ', sym: 'R', fp: 'R0603', desc: 'AIN4 串阻（B 相）' },
  { ref: 'C26', val: '1nF', sym: 'C', fp: 'C0603', desc: 'AIN4 滤波（B 相）' },
  { ref: 'R28', val: '1kΩ', sym: 'R', fp: 'R0603', desc: 'AIN7 串阻（C 相）' },
  { ref: 'C27', val: '1nF', sym: 'C', fp: 'C0603', desc: 'AIN7 滤波（C 相）' },

  /* ---------- ⑧ 母线电压采样（进 MCU） ---------- */
  { ref: 'R30', val: '220kΩ', sym: 'R', fp: 'R0603', desc: '母线采样上' },
  { ref: 'R31', val: '10kΩ', sym: 'R', fp: 'R0603', desc: '母线采样下' },
  { ref: 'C30', val: '1nF', sym: 'C', fp: 'C0603', desc: '母线采样滤波' },
  { ref: 'R48', val: '1kΩ', sym: 'R', fp: 'R0603', desc: 'AIN5 串阻（Vbus）' },
  { ref: 'C32', val: '1nF', sym: 'C', fp: 'C0603', desc: 'AIN5 滤波（Vbus）' },

  /* ---------- ⑨ 母线电流采样（INA181A2 → MCU ADC） ---------- */
  { ref: 'R32', val: '3mΩ', sym: 'RSHUNT', fp: 'R2512', desc: '★分流电阻 3mΩ/2W 开尔文' },
  { ref: 'R33', val: '10Ω', sym: 'R', fp: 'R0603', desc: 'ISENSE+ 串阻' },
  { ref: 'R34', val: '10Ω', sym: 'R', fp: 'R0603', desc: 'ISENSE− 串阻' },
  { ref: 'C31', val: '100nF', sym: 'C', fp: 'C0603', desc: 'ISENSE 差分滤波' },
  { ref: 'U3', val: 'INA181A2', sym: 'INA181', fp: 'SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BR', desc: '电流检测放大器 50V/V' },
  { ref: 'C33', val: '100nF', sym: 'C', fp: 'C0603', desc: 'U3 电源去耦' },
  { ref: 'R49', val: '1kΩ', sym: 'R', fp: 'R0603', desc: 'AIN8 串阻（I_sense）' },
  { ref: 'C34', val: '1nF', sym: 'C', fp: 'C0603', desc: 'AIN8 滤波（I_sense）' },

  /* ---------- ⑩ 主控 HC32F005C6PA ---------- */
  { ref: 'U5', val: 'HC32F005C6PA', sym: 'MCU', fp: 'TSSOP-20_L6.5-W4.4-P0.65-LS6.4-BL', desc: '主控 MCU（Cortex-M0+ / 32K Flash / 4K RAM）' },
  { ref: 'C43', val: '4.7µF', sym: 'C', fp: 'C0603', desc: '★VCAP 内核 LDO 电容（不接芯片不工作）' },
  { ref: 'C44', val: '100nF', sym: 'C', fp: 'C0603', desc: 'DVCC 去耦' },
  { ref: 'C45', val: '1µF', sym: 'C', fp: 'C0603', desc: 'DVCC 去耦' },
  { ref: 'C46', val: '100nF', sym: 'C', fp: 'C0603', desc: 'RESETB 防抖电容' },

  /* ---------- ⑬ 调试测试点（用户指定：需要调试的全部引出焊盘，不加排针） ----------
   * 理由：本板 ISP 口（P35/P36）被 C 相高边与电流 ADC 占用 → **只能用 SWD 烧录**，
   *       且无感六步换向的调试必须能看到「相电压 / 电流 / 六路 PWM / 母线」的实时波形。
   * 覆盖面：**MCU 全部 15 个已用 GPIO 一个不漏**（6 PWM + 5 模拟 + UART + SWD×2 + RESET）
   *         + 3 路电源/地（3V3 / GND / 12V / PGND）。
   * 器件：立创在售 SMT 测试端子 Harwin S2761-46R（立创 C5846954），封装
   *       `TESTPOINT-SMD_L1.6-W0.8_RCU-0C`（立创官方接口实测）。
   * 每个 desc 都写明「对应的 MCU 引脚号」，便于 PCB 阶段逐一核对焊盘。 */
  { ref: 'TP1',  val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '焊盘 3V3（调试器参考电平）' },
  { ref: 'TP2',  val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '焊盘 GND（信号地 AGND）' },
  { ref: 'TP3',  val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 SWDIO ← P27（MCU 脚17）' },
  { ref: 'TP4',  val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 SWCLK ← P31（MCU 脚18）' },
  { ref: 'TP5',  val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 RESETB ← P00（MCU 脚4，连接时按住复位）' },
  { ref: 'TP6',  val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '焊盘 UART_TX ← P14（MCU 脚12，固件上报转速/电流/故障）' },
  { ref: 'TP7',  val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 A相电压 ← P24/AIN0（MCU 脚14，看过零）' },
  { ref: 'TP8',  val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 B相电压 ← P33/AIN3（MCU 脚20，看过零）' },
  { ref: 'TP9',  val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 C相电压 ← P02/AIN8（MCU 脚6，看过零）' },
  { ref: 'TP10', val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 母线电流 ← P35/AIN5（MCU 脚2，看限流）' },
  { ref: 'TP11', val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 母线电压 ← P01/AIN7（MCU 脚5）' },
  { ref: 'TP12', val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 PWM_AH ← P23/TIM4_CHA（MCU 脚13）' },
  { ref: 'TP13', val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 PWM_AL ← P34/TIM4_CHB（MCU 脚1）' },
  { ref: 'TP14', val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 PWM_BH ← P25/TIM5_CHA（MCU 脚15）' },
  { ref: 'TP15', val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 PWM_BL ← P26/TIM5_CHB（MCU 脚16）' },
  { ref: 'TP16', val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 PWM_CH ← P36/TIM6_CHA@AF2（MCU 脚3）' },
  { ref: 'TP17', val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '★焊盘 PWM_CL ← P32/TIM6_CHB（MCU 脚19）' },
  { ref: 'TP18', val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '焊盘 VCC 12V（验证降压是否启动）' },
  { ref: 'TP19', val: 'TESTPOINT', sym: 'TP', fp: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C', desc: '焊盘 PGND（功率地，探头地参考）' },

  /* ---------- ⑭ ERC 电源标志（非实物，不进 BOM） ----------
   * 用途：VCC_BUS 由**板外电池**经 F1 供电、PGND 由板外引入，板上没有任何 power_out
   * 去"驱动"它们 → KiCad ERC 报 power_pin_not_driven（U4.VIN / U3.GND）。
   * 挂 PWR_FLAG 声明"该网络由外部供电"，是消除该误报的标准做法。
   * 位号以 # 开头 = KiCad 惯例的虚拟元件，不参与 BOM 与 PCB。 */
  { ref: '#FLG1', val: 'PWR_FLAG', sym: 'PWRFLAG', fp: 'PWR_FLAG', desc: 'ERC 标志：VCC_BUS 由板外电池供电' },
  { ref: '#FLG2', val: 'PWR_FLAG', sym: 'PWRFLAG', fp: 'PWR_FLAG', desc: 'ERC 标志：PGND 由板外引入' },

  /* ---------- ⑪ 地 ---------- */
  { ref: 'R47', val: '0Ω', sym: 'R', fp: 'R0603', desc: '★AGND↔PGND 单点星接' },
];

/* ============================ 网络 ============================ */
export const NETS = {
  /* --- 母线 --- */
  VBUS_IN:   ['F1.1'],
  VCC_BUS:   ['F1.2', 'D4.1', 'C2.1', 'C14.1', 'C15.1', 'C16.1', 'C17.1', 'C18.1', 'C19.1', 'C20.1',
              'U2.1', 'U4.1', 'R15.1', 'R30.1', 'C40.1', '#FLG1.1',
              'Q2.5', 'Q2.6', 'Q2.7', 'Q2.8', 'Q2.9', 'Q3.5', 'Q3.6', 'Q3.7', 'Q3.8', 'Q3.9',
              'Q6.5', 'Q6.6', 'Q6.7', 'Q6.8', 'Q6.9'],

  /* --- 12V 辅助电源（栅驱动 + LDO 输入） --- */
  SW:        ['U2.2', 'L1.1', 'D5.1'],
  VCC:       ['L1.2', 'C11.1', 'C12.1', 'C8.1', 'C9.1', 'C10.1', 'C1.2', 'C13.2',
              'D1.2', 'D2.2', 'D3.2', 'R10.1', 'U1.7', 'TP18.1'],
  FB:        ['R10.2', 'R11.2', 'U2.3'],
  /* EN / UVLO：VCC_BUS —R15(130k)— EN —R16(15k)— PGND 构成欠压分压（门限 1.25×145/15 ≈ 12.1V）
     ★★ 这里曾是一个致命缺陷：V3.0 早期把分压中点单独命名为 EN_H 并留作"对外短接"，
        但板上**没有任何跳线/焊盘**能把它与 EN 连起来 → EN 被 R16 永久拉到 GND
        → XL7005A 永不启动 → 无 12V → 栅驱动无电 → **整板上电即死**。
        由 KiCad ERC 的 isolated_pin_label 抓出（EN_H 只挂了一个电阻脚）。现已合并为同一网络。 */
  EN:        ['R15.2', 'R16.1', 'C29.1', 'U2.4'],

  /* --- 3.3V（MCU + INA181） --- */
  VDD_3V3:   ['U4.2', 'U4.4', 'C41.1', 'C42.1', 'C44.1', 'C45.1', 'C33.1', 'U5.9', 'U3.6', 'TP1.1'],

  /* --- 三相输出 --- */
  PH_A:      ['Q2.1', 'Q2.2', 'Q2.3', 'Q1.5', 'Q1.6', 'Q1.7', 'Q1.8', 'Q1.9', 'C5.1', 'U1.18',
              'R12.2', 'R17.1'],
  PH_B:      ['Q3.1', 'Q3.2', 'Q3.3', 'Q5.5', 'Q5.6', 'Q5.7', 'Q5.8', 'Q5.9', 'C6.2', 'U1.15',
              'R13.2', 'R19.1'],
  PH_C:      ['Q6.1', 'Q6.2', 'Q6.3', 'Q4.5', 'Q4.6', 'Q4.7', 'Q4.8', 'Q4.9', 'C7.2', 'U1.12',
              'R14.2', 'R21.1'],

  /* --- 自举 --- */
  VB1:       ['C5.2', 'D1.1', 'U1.20'],
  VB2:       ['C6.1', 'D2.1', 'U1.17'],
  VB3:       ['C7.1', 'D3.1', 'U1.14'],

  /* --- 栅驱动输出 → 栅极电阻 --- */
  LO1:       ['U1.11', 'R1.1'],
  LO2:       ['U1.10', 'R2.1'],
  LO3:       ['U1.9',  'R3.1'],
  HO1:       ['U1.19', 'R6.1'],
  HO2:       ['U1.16', 'R5.1'],
  HO3:       ['U1.13', 'R4.1'],

  /* --- MOSFET 栅极 --- */
  GL_A:      ['R1.2', 'Q1.4', 'R7.1'],
  GL_B:      ['R2.2', 'Q5.4', 'R8.1'],
  GL_C:      ['R3.2', 'Q4.4', 'R9.1'],
  GH_A:      ['R6.2', 'Q2.4', 'R12.1'],
  GH_B:      ['R5.2', 'Q3.4', 'R13.1'],
  GH_C:      ['R4.2', 'Q6.4', 'R14.1'],

  /* --- MCU → 栅驱动（经串阻）
   * ★ 引脚方案由 `_生成器/solve-pins.mjs` 穷举 534 组合法解后选出（#509）：
   *   A 相：高=P23(P13)/TIM4_CHA@AF3   低=P34(P1) /TIM4_CHB@AF3   ← TIM4 一对
   *   B 相：高=P25(P15)/TIM5_CHA@AF3   低=P26(P16)/TIM5_CHB@AF3   ← TIM5 一对
   *   C 相：高=P36(P3) /TIM6_CHA@AF2   低=P32(P19)/TIM6_CHB@AF3   ← TIM6 一对
   *
   * 该方案的唯一性来自三条硬约束（全部取自官方参考手册 Rev2.50 的 Pxx_SEL 寄存器位定义）：
   *   ① **P33 上没有 TIM5_CHA**（只有 TIM5_CHB@AF3）→ 原「P33=CHA」方案不成立
   *   ② **TIM5_CHA 只在 P25/P27/P34/P36 上**，而 P27 是 SWD、P36 要留给 TIM6
   *   ③ **AIN1 只能从 P26 进** → P26 一旦做 B 相低边，就不能再做模拟输入
   *   ④ 三条交叉后，**唯一**能让「三颗 ADT 各负责一相完整互补对（硬件死区）」+
   *      「5 路模拟量都落在非 ISP/非晶振脚」的解就是本方案。
   *
   * ⚠️ 代价：**P36 与 P34 都被 PWM 占用 → ISP（P35/P36）不可用，必须用 SWD 烧录**。
   * ⚠️ AF 号已与已有实测线索 P23=TIM4_CHA@GpioAf3 交叉验证一致。 */
  PWM_AH:    ['U5.13', 'R35.1', 'TP12.1'],
  PWM_AL:    ['U5.1',  'R36.1', 'TP13.1'],
  PWM_BH:    ['U5.15', 'R37.1', 'TP14.1'],
  PWM_BL:    ['U5.16', 'R38.1', 'TP15.1'],
  PWM_CH:    ['U5.3',  'R39.1', 'TP16.1'],
  PWM_CL:    ['U5.19', 'R40.1', 'TP17.1'],
  DRV_HIN1:  ['R35.2', 'U1.1'],
  DRV_LIN1:  ['R36.2', 'U1.4'],
  DRV_HIN2:  ['R37.2', 'U1.2'],
  DRV_LIN2:  ['R38.2', 'U1.5'],
  DRV_HIN3:  ['R39.2', 'U1.3'],
  DRV_LIN3:  ['R40.2', 'U1.6'],

  /* --- 低边源极星点 → 分流电阻 --- */
  LS_STAR:   ['Q1.1', 'Q1.2', 'Q1.3', 'Q5.1', 'Q5.2', 'Q5.3', 'Q4.1', 'Q4.2', 'Q4.3',
              'R7.2', 'R8.2', 'R9.2', 'R32.1', 'R33.1'],

  /* --- 母线电流采样 --- */
  ISENSE_P:  ['R33.2', 'C31.1', 'U3.1'],
  ISENSE_N:  ['R34.2', 'C31.2', 'U3.2'],
  I_SENSE:   ['U3.5', 'R49.1', 'C34.2'],

  /* --- 相电压采集（可用模拟脚只有 5 个，见下） --- */
  A_DIV:     ['R17.2', 'R18.1', 'C21.1', 'R23.1', 'R26.1'],
  B_DIV:     ['R19.2', 'R20.1', 'C22.1', 'R24.1', 'R27.1'],
  C_DIV:     ['R21.2', 'R22.1', 'C23.1', 'R25.1', 'R28.1'],
  VN:        ['R23.2', 'R24.2', 'R25.2', 'C24.1'],
  AIN_A:     ['R26.2', 'C25.1', 'U5.14', 'TP7.1'],    // P24 = AIN0
  AIN_B:     ['R27.2', 'C26.1', 'U5.20', 'TP8.1'],    // P33 = AIN3
  AIN_C:     ['R28.2', 'C27.1', 'U5.6',  'TP9.1'],    // P02 = AIN8

  /* --- 母线电流采样（经串阻；P35 = AIN5） --- */
  /* 注：C34 是 RC 滤波电容，一端在 AIN_ISENSE、另一端回 AGND */
  AIN_ISENSE: ['R49.2', 'C34.1', 'U5.2', 'TP10.1'],

  /* --- 母线电压采样（P01 = AIN7） --- */
  VBUS_SENSE: ['R30.2', 'R31.1', 'C30.1', 'R48.1'],
  AIN_VBUS:   ['R48.2', 'C32.1', 'U5.5', 'TP11.1'],

  /* --- MCU 其他 --- */
  UART_TX:   ['U5.12', 'TP6.1'],
  SWDIO:     ['U5.17', 'TP3.1'],
  SWCLK:     ['U5.18', 'TP4.1'],
  MCU_NRST:  ['U5.4', 'C46.1', 'TP5.1'],
  MCU_VCAP:  ['U5.8', 'C43.1'],

  /* --- 地 --- */
  PGND:      ['D4.2', 'C2.2', 'C14.2', 'C15.2', 'C16.2', 'C17.2', 'C18.2', 'C19.2', 'C20.2',
              'U2.5', 'U2.6', 'U2.7', 'U2.8', 'U2.9', 'D5.2', 'C8.2', 'C9.2', 'C10.2',
              'C11.2', 'C12.2', 'R11.1', 'R16.2', 'C29.2', 'U1.8', 'C1.1', 'C13.1',
              'R32.2', 'R34.1', 'U3.4', 'U3.3', 'C33.2', 'C40.2', 'U4.3',
              'R47.2', '#FLG2.1', 'TP19.1'],

  AGND:      ['R18.2', 'R20.2', 'R22.2', 'C21.2', 'C22.2', 'C23.2', 'C24.2', 'C25.2', 'C26.2',
              'C27.2', 'R31.2', 'C30.2', 'C32.2', 'C41.2', 'C42.2', 'C43.2', 'C44.2',
              'C45.2', 'C46.2', 'U5.7', 'R47.1', 'TP2.1'],
};

/* ============================ 对外接口（悬空引出） ============================
 * 本表登记「允许只有 1 个成员」的网络 —— 即断口落在板外的接口。
 * ★ 调试信号（SWDIO / SWCLK / UART_TX / RESETB）**都已由测试点 TP1–TP19 在板上收口**，
 *   不再是悬空网络，故不再登记在本表（见 NETS 里各调试网络的 TP 成员）。
 * EN / EN_H 原先也登记在此（靠人工短接），**已合并为板内连接**（见 NETS 里的 EN 注释）。
 */
export const INTERFACE_NETS = {
  VBUS_IN:   '母线电源输入（正）→ 接电池正极（3–4S LiPo，9.0–16.8V）',
  PGND:      '功率地 → 接电池负极 / 电机侧功率地',
  PH_A:      '三相输出 A → 接电机 A 相',
  PH_B:      '三相输出 B → 接电机 B 相',
  PH_C:      '三相输出 C → 接电机 C 相',
};

/* ============================ 符号引脚表 ============================ */
export const SYMBOL_PINS = {
  R: ['1', '2'], RSHUNT: ['1', '2'], C: ['1', '2'], CP: ['1', '2'], L: ['1', '2'], FUSE: ['1', '2'],
  D: ['1', '2'], DSCH: ['1', '2'], DTVS: ['1', '2'],
  NMOS: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  FD6288T: Array.from({ length: 20 }, (_, i) => String(i + 1)),
  XL7005A: Array.from({ length: 9 }, (_, i) => String(i + 1)),
  LDO: ['1', '2', '3', '4'],
  INA181: ['1', '2', '3', '4', '5', '6'],
  TP: ['1'],
  PWRFLAG: ['1'],
  MCU: Array.from({ length: 20 }, (_, i) => String(i + 1)),
};

/* ============================ 引脚名（画图显示） ============================ */
export const PIN_NAMES = {
  FD6288T: {
    1: 'HIN1', 2: 'HIN2', 3: 'HIN3', 4: 'LIN1', 5: 'LIN2', 6: 'LIN3', 7: 'VCC', 8: 'COM',
    9: 'LO3', 10: 'LO2', 11: 'LO1', 12: 'VS3', 13: 'HO3', 14: 'VB3',
    15: 'VS2', 16: 'HO2', 17: 'VB2', 18: 'VS1', 19: 'HO1', 20: 'VB1',
  },
  XL7005A: { 1: 'VIN', 2: 'SW', 3: 'FB', 4: 'EN', 5: 'GND', 6: 'GND', 7: 'GND', 8: 'GND', 9: 'EP' },
  NMOS: { 1: 'S', 2: 'S', 3: 'S', 4: 'G', 5: 'D', 6: 'D', 7: 'D', 8: 'D', 9: 'D' },
  LDO: { 1: 'VIN', 2: 'VOUT', 3: 'GND', 4: 'VOUT' },
  INA181: { 1: 'IN+', 2: 'IN-', 3: 'REF', 4: 'GND', 5: 'OUT', 6: 'VS' },
  TP: { 1: '1' },
  /* 引脚名严格取自官方数据手册 Rev3.00 §4 引脚功能说明 */
  MCU: {
    1: 'P34/AIN4', 2: 'P35', 3: 'P36', 4: 'RESETB', 5: 'P01/AIN7', 6: 'P02/AIN8',
    7: 'DVSS', 8: 'VCAP', 9: 'DVCC', 10: 'P03',
    11: 'P15', 12: 'P14', 13: 'P23', 14: 'P24/AIN0', 15: 'P25',
    16: 'P26/AIN1', 17: 'P27/SWDIO', 18: 'P31/SWCLK', 19: 'P32/AIN2', 20: 'P33/AIN3',
  },
};

/* ============================ 网络分类（画图配色） ============================ */
export const NET_CLASS = {
  VBUS_IN: 'power', VCC_BUS: 'power', VCC: 'power', VDD_3V3: 'power', SW: 'power', LS_STAR: 'power',
  PH_A: 'phase', PH_B: 'phase', PH_C: 'phase',
  PGND: 'gnd', AGND: 'gnd',
  VB1: 'boot', VB2: 'boot', VB3: 'boot',
  LO1: 'gate', LO2: 'gate', LO3: 'gate', HO1: 'gate', HO2: 'gate', HO3: 'gate',
  GL_A: 'gate', GL_B: 'gate', GL_C: 'gate', GH_A: 'gate', GH_B: 'gate', GH_C: 'gate',
  FB: 'analog', EN: 'analog',
  A_DIV: 'analog', B_DIV: 'analog', C_DIV: 'analog', VN: 'analog',
  AIN_A: 'analog', AIN_B: 'analog', AIN_C: 'analog',
  VBUS_SENSE: 'analog', AIN_VBUS: 'analog',
  ISENSE_P: 'analog', ISENSE_N: 'analog', I_SENSE: 'analog', AIN_ISENSE: 'analog',
  MCU_VCAP: 'analog', MCU_NRST: 'analog',
  PWM_AH: 'logic', PWM_AL: 'logic', PWM_BH: 'logic', PWM_BL: 'logic', PWM_CH: 'logic', PWM_CL: 'logic',
  DRV_HIN1: 'logic', DRV_LIN1: 'logic', DRV_HIN2: 'logic', DRV_LIN2: 'logic',
  DRV_HIN3: 'logic', DRV_LIN3: 'logic',
  UART_TX: 'logic', SWDIO: 'logic', SWCLK: 'logic',
};

/* ============================ 未使用引脚（no-connect） ============================
 * HC32F005C6PA 共 17 个端口脚（其中 P00 仅数字输入，本板用作 RESETB）。
 * 本板已连接 15 个。**仅 2 个真正空闲**，标 no-connect 标记以避免 ERC 报"引脚未连接"：
 *   U5.10 = P03   （非 ADC 脚，无模拟能力；也不是 TIM4/5/6 的可用输出脚）
 *   U5.11 = P15   （TIM4_CHB 的备选，但 A 相低边已用 P34）
 * 如需备用 IO 或测试点，从这两个里取。
 */
export const NO_CONNECT = ['U5.10', 'U5.11'];

/* ============================ 封装准入白名单（规范 R0） ============================
 * 规则来源：`01_工程/器件选型规范.md` R0
 *
 *   「所有元器件的封装，必须使用嘉立创（嘉立创EDA / 立创商城）官方库中已经存在的封装。」
 *
 * 本表是**唯一允许出现的封装名集合**。任何元件的 fp 不在本表里 → check-design.mjs 直接失败。
 * 新增封装必须：① 先在立创库中用 LCSC 料号绑出真实封装名 ② 登记到本表 ③ 才能改元件表。
 *
 * ⚠️ 教训：V2.0 的 `SMA_L4.3-W2.6-LS5.0-RD` / `...-LS5.2-RD` 曾被怀疑是"按命名规则类推"编的，
 *    并据此改成 `...-LS5.1-RD` —— 查立创官方数据后证明**两个原值都是真的**（ES1D / SS110 各用一个），
 *    反而是 LS5.1 属于另一个器件。**名字符合语法 ≠ 库里存在；但"看起来像猜的" ≠ 就是猜的。**
 *    **唯一裁决者是立创官方数据**：`lceda.cn/api/products/{货号}/components` → `c_para.package`。
 */
export const JLC_FOOTPRINTS = {
  'R0603': '0603 电阻（立创通用）',
  'C0603': '0603 电容（立创通用）',
  'C0805': '0805 电容（立创通用）',
  'C1206': '1206 电容（立创通用）',
  'R2512': '2512 电阻（分流用）',
  'F1206': '1206 保险丝',
  'TSSOP-20_L6.5-W4.4-P0.65-LS6.4-BL': 'TSSOP-20（FD6288T / HC32F005C6PA）',
  'SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BR': 'SOT-23-6（INA181A2）',
  'SOT-223-3_L6.5-W3.5-P2.30-LS7.0-BR': 'SOT-223（AMS1117-3.3）',
  'SOIC-8_L4.9-W3.9-P1.27-LS6.0-BL-EP3.1-1': 'SOIC-8 带散热焊盘（XL7005A）',
  'PDFN-8_L5.8-W5.0-P1.27-LS6.2-BL': 'PDFN 5×6（功率 MOSFET）',
  'TESTPOINT-SMD_L1.6-W0.8_RCU-0C': 'SMT 测试点（立创 C5846954 Harwin S2761-46R 实测封装名）',
  'PWR_FLAG': 'ERC 电源标志（虚拟元件，无实物、不进 BOM）',
  'SMA_L4.3-W2.6-LS5.0-RD': 'SMA（ES1D 自举二极管，立创 C18199158 实测封装名）',
  'SMA_L4.3-W2.6-LS5.2-RD': 'SMA（SS110-LTP 续流二极管，立创 C85691 实测封装名）',
  'SMB_L4.3-W3.5-LS5.3-RD': 'SMB（SMBJ33A）',
  'IND-SMD_L6.0-W6.0_LPS6225': '贴片电感 6×6（47 µH）',
  'CAP-SMD_BD6.3-L6.6-W6.6-LS7.3-FD': '贴片电解 φ6.3',
  'CAP-SMD_BD6.3-L6.6-W6.6-LS7.3-FD-H7.7': '贴片电解 φ6.3（高 7.7）',
  'CAP-TH_BD8.0-P3.50-D0.5-FD': '插件电解 φ8',
};

/** 立创封装命名**体检**（宽松，仅告警不拦截）。
 *  官方语法 `封装类型_脚数-体宽-脚距-体长-脚跨距-一脚方位-极性方向_系列名`，
 *  但真实库里变体很多（如 `CAP-TH_BD8.0-P3.50-D0.5-FD` 用体径 BD 而无 L/W；
 *  `IND-SMD_L6.0-W6.0_LPS6225` 以 `_系列名` 结尾）。
 *  → **不用死板正则卡语法**（会制造假失败）；只做"不像乱编的"体检，真正的闸门是白名单 + LCSC 绑定。 */
export const JLC_NAME_RE = /^[A-Za-z][A-Za-z0-9._+-]*$/;

/* ============================ LCSC 料号（规范 R0.2 / R3） ============================
 * 「绑定 LCSC 料号」是保证封装一定在立创库中的**唯一可靠机制**：
 * 立创EDA 用货号自动带出官方封装 + 3D 模型，从根上消灭"封装找不到"。
 *
 * 现状：已用**立创官方接口**逐个核实并填入（数据源 `lceda.cn/api/products/{货号}/components`，
 * 取 `dataStr.head.c_para.package` 字段 —— 这是"立创库里真实存在的封装名"的权威来源）。
 * 未列出的位号 = 待绑定（须在立创商城按参数筛选后补）。
 *
 * ⚠️ 教训：**不要凭命名规则类推封装名**。曾据一个不相关器件把 ES1D/D5 的封装
 *    从 `LS5.0`/`LS5.2` 改成 `LS5.1` —— 查立创官方数据后证明**原值才是对的**，
 *    且 `LS5.0` 与 `LS5.2` 是**两个都真实存在的不同库封装**（ES1D=C18199158 用 LS5.0，SS110=C85691 用 LS5.2）。
 */
export const LCSC = {
  /* 功率级 —— 已核实 */
  Q1: 'C2986239', Q2: 'C2986239', Q3: 'C2986239', Q4: 'C2986239', Q5: 'C2986239', Q6: 'C2986239',
  U1: 'C97683',      /* FD6288T → TSSOP-20_L6.5-W4.4-P0.65-LS6.4-BL */
  U2: 'C50848',      /* XL7005A → SOIC-8_L4.9-W3.9-P1.27-LS6.0-BL-EP3.1-1（脚序 1VIN/2SW/3FB/4EN/5-8GND/9EP 已核实一致）*/
  D1: 'C18199158', D2: 'C18199158', D3: 'C18199158',   /* ES1D → SMA_L4.3-W2.6-LS5.0-RD */
  D5: 'C85691',                                        /* SS110-LTP → SMA_L4.3-W2.6-LS5.2-RD */
  L1: 'C55381775',   /* 47µH → IND-SMD_L6.0-W6.0_LPS6225 */
  C11: 'C47344183',  /* 100µF 插件 → CAP-TH_BD8.0-P3.50-D0.5-FD */
  C14: 'C46550415',  /* 100µF 贴片 → CAP-SMD_BD6.3-L6.6-W6.6-LS7.3-FD-H7.7 */
  C15: 'C48971005', C16: 'C48971005', C17: 'C48971005',/* 47µF → CAP-SMD_BD6.3-L6.6-W6.6-LS7.3-FD */
  /* 通用阻容 —— 已核实货号（同值同封装复用） */
  R1: 'C22859', R2: 'C22859', R3: 'C22859', R4: 'C22859', R5: 'C22859', R6: 'C22859',
  R33: 'C22859', R34: 'C22859',                        /* 10Ω 0603 */
  R7: 'C4184', R8: 'C4184', R9: 'C4184', R12: 'C4184', R13: 'C4184', R14: 'C4184',  /* 20kΩ 0603 */
  R10: 'C325705',                                      /* 8.66kΩ 0603 */
  R11: 'C2907002', R26: 'C2907002', R27: 'C2907002', R28: 'C2907002',
  R48: 'C2907002', R49: 'C2907002',                    /* 1kΩ 0603 */
  C1: 'C15849', C8: 'C15849', C9: 'C15849', C10: 'C15849',  /* 1µF/50V 0603 */
  C12: 'C5137636', C13: 'C5137636', C29: 'C5137636',   /* 100nF 0603 */
  TP1: 'C5846954', TP2: 'C5846954', TP3: 'C5846954', TP4: 'C5846954',
  TP5: 'C5846954', TP6: 'C5846954', TP7: 'C5846954', TP8: 'C5846954',
  TP9: 'C5846954', TP10: 'C5846954', TP11: 'C5846954', TP12: 'C5846954',
  TP13: 'C5846954', TP14: 'C5846954', TP15: 'C5846954', TP16: 'C5846954',
  TP17: 'C5846954', TP18: 'C5846954', TP19: 'C5846954',  /* SMT 测试点 ×19 */
  /* 其余位号（特殊耐压/功率/精度，或 V3 新增）须逐个在立创筛选后补 —— 见 器件选型规范.md R0.3 L2 */
};

export const PROJECT = {
  title: '三相无刷电机驱动板 V3.0（HC32F005 片上主控 · 无感六步换向 + 反电动势过零检测）',
  rev: 'V3.0',
  date: '2026-09-13',
  /** 输出文件基名（build.mjs / render.mjs 用它拼文件名，避免版本号写死在多处） */
  fileBase: 'motor-driver-V3',
  company: '',
};
