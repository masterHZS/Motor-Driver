#!/usr/bin/env node
/**
 * tools/lib/pins.mjs
 * STM32G431RBT6（LQFP64）引脚定义的**单一数据源**。
 *
 * ★ 脚号权威来源：**KiCad 官方符号库 `MCU_ST_STM32G4.kicad_sym` 的 `STM32G431RBTx`**
 *   （`F:\Kicad\share\kicad\symbols\`，ST 官方手册持续校对）
 *   用 `node tools/ref-pinmap.mjs --compare` 随时复核，**必须 64/64 一致**。
 *
 * ⚠️ 2026-10-15 审核教训（R1）：初版脚号是从 DS12589 文本层按「列序号」猜的，
 *   **36/64 系统性错位**，还凭空多出两只 VCAP 脚（G431RB 的 LQFP64 没有）。
 *   ⇒ 脚号**绝不允许**靠文本层推断；必须与第三方权威逐脚比对。
 *
 * ⚠️ 2026-10-15 审核教训（R2）：AF 编号也不能靠 token 顺序猜。
 *   AF 列号 = DS12589 Table 13 的 AF0..AF15，**必须显式建立列结构**（见 tools/parse-af.mjs）。
 *
 * ★ 2026-10-15 用户拍板（R4）：**VN 从 PB12 移到 PC3（ADC2_IN9）**，
 *   浮空相由 ADC1 采集、VN 由 ADC2 采集，**双 ADC 同步触发** ⇒ 两者真正同刻采样。
 *   连带调整（为腾出 ADC1 资源）：VBUS→PC1、CBUS→PA7、IOUTC→PC5（PB1 让给 PWM）。
 *   详见 `审查/R4_双ADC采样时序.md` 与 `03_关键器件初选与计算书.md` §9。
 */

/** 引脚名「库内短名」→ 数据手册全名（仅用于文档，不参与比对） */
export const DS_FULLNAME = {
  PC14: 'PC14-OSC32_IN',
  PC15: 'PC15-OSC32_OUT',
  PF0: 'PF0-OSC_IN',
  PF1: 'PF1-OSC_OUT',
  PG10: 'PG10-NRST',
  PB8: 'PB8-BOOT0',
};

/**
 * LQFP64 脚号 → [引脚名, 电气类型, 本设计分配]
 * 脚号段已与 KiCad 官方库逐脚核对（64/64）。
 */
export const LQFP64 = [
  [1, 'VBAT', 'power_in', '3V3'],
  [2, 'PC13', 'bidirectional', 'NC'],
  [3, 'PC14', 'bidirectional', 'NC'],
  [4, 'PC15', 'bidirectional', 'NC'],
  [5, 'PF0', 'bidirectional', 'HSE_IN'],
  [6, 'PF1', 'bidirectional', 'HSE_OUT'],
  [7, 'PG10', 'input', 'NRST'],
  [8, 'PC0', 'bidirectional', 'RSV'],
  [9, 'PC1', 'bidirectional', 'VBUS'],        // ★ 从 PB11 挪来（ADC2_IN7）
  [10, 'PC2', 'bidirectional', 'RSV'],
  [11, 'PC3', 'bidirectional', 'VN'],          // ★★ 从 PB12 挪来（ADC2_IN9，双 ADC 通道）
  [12, 'PA0', 'bidirectional', 'VBEMF_A'],
  [13, 'PA1', 'bidirectional', 'VBEMF_B'],
  [14, 'PA2', 'bidirectional', 'VBEMF_C'],
  [15, 'VSS', 'power_in', 'GND'],
  [16, 'VDD', 'power_in', '3V3'],
  [17, 'PA3', 'bidirectional', 'CAL'],
  [18, 'PA4', 'bidirectional', 'NTC'],         // ★ 从 PA5 挪来（ADC2_IN17）
  [19, 'PA5', 'bidirectional', 'DRV_EN'],
  [20, 'PA6', 'bidirectional', 'FAULT_BKIN'],
  [21, 'PA7', 'bidirectional', 'CBUS'],        // ★ 从 PA4 挪来（ADC2_IN4）
  [22, 'PC4', 'bidirectional', 'IOUTA'],
  [23, 'PC5', 'bidirectional', 'IOUTC'],       // ★ 从 PB1 挪来（ADC2_IN11）
  [24, 'PB0', 'bidirectional', 'IOUTB'],
  [25, 'PB1', 'bidirectional', 'INLA'],        // ★ 让给 PWM 低边 A
  [26, 'PB2', 'bidirectional', 'NC'],
  [27, 'VSSA', 'power_in', 'GNDA'],
  [28, 'VREF+', 'power_in', 'VREF_PLUS'],
  [29, 'VDDA', 'power_in', '3V3A'],
  [30, 'PB10', 'bidirectional', 'LED'],
  [31, 'VSS', 'power_in', 'GND'],
  [32, 'VDD', 'power_in', '3V3'],
  [33, 'PB11', 'bidirectional', 'RSV'],        // ★ VBUS 迁走后空出（ADC1_IN14 备用）
  [34, 'PB12', 'bidirectional', 'RSV'],        // ★ VN 迁走后空出（TIM1_BKIN 备用 / ADC1_IN11）
  [35, 'PB13', 'bidirectional', 'INLB'],       // ★ TIM1_CH2N（AF6）
  [36, 'PB14', 'bidirectional', 'INLC'],       // ★ TIM1_CH3N（AF4，注意与前两个不同）
  [37, 'PB15', 'bidirectional', 'RSV'],
  [38, 'PC6', 'bidirectional', 'RSV'],
  [39, 'PC7', 'bidirectional', 'RSV'],
  [40, 'PC8', 'bidirectional', 'RSV'],
  [41, 'PC9', 'bidirectional', 'RSV'],
  [42, 'PA8', 'bidirectional', 'INHA'],
  [43, 'PA9', 'bidirectional', 'INHB'],
  [44, 'PA10', 'bidirectional', 'INHC'],
  [45, 'PA11', 'bidirectional', 'RSV'],
  [46, 'PA12', 'bidirectional', 'RSV'],
  [47, 'VSS', 'power_in', 'GND'],
  [48, 'VDD', 'power_in', '3V3'],
  [49, 'PA13', 'bidirectional', 'SWDIO'],
  [50, 'PA14', 'bidirectional', 'SWCLK'],
  [51, 'PA15', 'bidirectional', 'RSV'],
  [52, 'PC10', 'bidirectional', 'RSV'],
  [53, 'PC11', 'bidirectional', 'RSV'],
  [54, 'PC12', 'bidirectional', 'RSV'],
  [55, 'PD2', 'bidirectional', 'RSV'],
  [56, 'PB3', 'bidirectional', 'UART_TX'],
  [57, 'PB4', 'bidirectional', 'UART_RX'],
  [58, 'PB5', 'bidirectional', 'RSV'],
  [59, 'PB6', 'bidirectional', 'RSV'],
  [60, 'PB7', 'bidirectional', 'RSV'],
  [61, 'PB8', 'input', 'BOOT0'],
  [62, 'PB9', 'bidirectional', 'RSV'],
  [63, 'VSS', 'power_in', 'GND'],
  [64, 'VDD', 'power_in', '3V3'],
];

/** 分配标记 -> 图纸上的引脚分组顺序（也决定符号分块顺序） */
export const GROUP_ORDER = [
  'POWER', 'CLOCK', 'RESET_BOOT', 'DEBUG', 'UART',
  'PWM', 'ANALOG_PHASE', 'ANALOG_CURRENT', 'ANALOG_SLOW', 'RESERVE',
];

/** 分配标记 -> 引脚分组 */
export const ASSIGN_GROUP = {
  '3V3': 'POWER', 'GND': 'POWER', 'GNDA': 'POWER', '3V3A': 'POWER', 'VREF_PLUS': 'POWER',
  'HSE_IN': 'CLOCK', 'HSE_OUT': 'CLOCK',
  'NRST': 'RESET_BOOT', 'BOOT0': 'RESET_BOOT',
  'SWDIO': 'DEBUG', 'SWCLK': 'DEBUG',
  'UART_TX': 'UART', 'UART_RX': 'UART',
  'INHA': 'PWM', 'INLA': 'PWM', 'INHB': 'PWM', 'INLB': 'PWM', 'INHC': 'PWM', 'INLC': 'PWM',
  'VBEMF_A': 'ANALOG_PHASE', 'VBEMF_B': 'ANALOG_PHASE', 'VBEMF_C': 'ANALOG_PHASE', 'VN': 'ANALOG_PHASE',
  'IOUTA': 'ANALOG_CURRENT', 'IOUTB': 'ANALOG_CURRENT', 'IOUTC': 'ANALOG_CURRENT', 'CBUS': 'ANALOG_CURRENT',
  'VBUS': 'ANALOG_SLOW', 'NTC': 'ANALOG_SLOW',
  'DRV_EN': 'RESERVE', 'CAL': 'RESERVE', 'FAULT_BKIN': 'RESERVE', 'LED': 'RESERVE',
  'NC': 'RESERVE', 'RSV': 'RESERVE',
};

/**
 * 每只引脚的模拟通道（DS12589 Table 12「附加功能」列**原文**）。
 *
 * ★ 标 [双] 的表示 ADC1 与 ADC2 上都有通道 —— **只有这类脚能做双 ADC 同步采样**。
 *
 * ⚠️ 2026-10-15 R4 复核教训：初版把 **PA2 误记成双通道**（原文只有 `ADC1_IN3`），
 *    又把 **PF0 漏记了 ADC2 侧**。⇒ 通道记录**必须逐脚查原文**，不许按"同组引脚"类推：
 *    `PA0`/`PA1` 是 `ADC12`，`PA2` 却只有 `ADC1` —— 同组不同命。
 *    复核工具：`node tools/verify-adc-channels.mjs`（读 Table 12 抽取产物并与本文比对，不一致即 exit 1）。
 */
export const ADC_CHANNELS = {
  PA0: ['ADC1_IN1', 'ADC2_IN1'],       // 双
  PA1: ['ADC1_IN2', 'ADC2_IN2'],       // 双
  PA2: ['ADC1_IN3'],                    // ⚠️ **仅 ADC1**（原文 ADC1_IN3，无 ADC2 侧）—— 2026-10-15 独立核实修正
  PA3: ['ADC1_IN4'],
  PA4: ['ADC2_IN17'],
  PA5: ['ADC2_IN13'],
  PA6: ['ADC2_IN3'],
  PA7: ['ADC2_IN4'],
  PB0: ['ADC1_IN15'],
  PB1: ['ADC1_IN12'],
  PB2: ['ADC2_IN12'],
  PB11: ['ADC1_IN14'],
  PB12: ['ADC1_IN11'],
  PB14: ['ADC1_IN5'],
  PC0: ['ADC1_IN6', 'ADC2_IN6'],       // 双
  PC1: ['ADC1_IN7', 'ADC2_IN7'],       // 双
  PC2: ['ADC1_IN8', 'ADC2_IN8'],       // 双
  PC3: ['ADC1_IN9', 'ADC2_IN9'],       // 双 ★ VN 用
  PC4: ['ADC2_IN5'],
  PC5: ['ADC2_IN11'],
  PF0: ['ADC1_IN10', 'ADC2_IN10'],      // 双
  PF1: ['ADC2_IN10'],
};

/** 同时具备 ADC1 与 ADC2 通道的引脚（双 ADC 同步采样的可用集合） */
export const DUAL_ADC_PINS = Object.keys(ADC_CHANNELS)
  .filter((p) => ADC_CHANNELS[p].some((c) => c.startsWith('ADC1'))
    && ADC_CHANNELS[p].some((c) => c.startsWith('ADC2')));

export const ANALOG_CAPABLE_PINS = Object.keys(ADC_CHANNELS);

/** 关键复用功能（AF 列号 = DS12589 Table 13 的 AF 编号，**不是**寄存器位号） */
export const KEY_AF = {
  'PA8': { 'TIM1_CH1': 6 },
  'PA9': { 'TIM1_CH2': 6 },
  'PA10': { 'TIM1_CH3': 6 },
  'PB1': { 'TIM1_CH3N': 6 },    // ★ 低边 A
  'PB13': { 'TIM1_CH1N': 6 },   // ★ 低边 B
  'PB14': { 'TIM1_CH2N': 6 },   // ★ 低边 C
  'PB15': { 'TIM1_CH3N': 4 },   // ⚠️ AF4（与被占用的那三只不同）
  'PA6': { 'TIM1_BKIN': 6 },
  'PB12': { 'TIM1_BKIN': 6 },
  'PB3': { 'USART2_TX': 7 },
  'PB4': { 'USART2_RX': 7 },
  'PA13': { 'SWDIO': 0 },
  'PA14': { 'SWCLK': 0 },
};

/** ★ 必需信号清单：任何一个没被分配就是设计漏项（自检会拦） */
export const REQUIRED_SIGNALS = [
  // 三相 PWM 六路
  'INHA', 'INLA', 'INHB', 'INLB', 'INHC', 'INLC',
  // 模拟输入 10 路
  'VBEMF_A', 'VBEMF_B', 'VBEMF_C', 'VN', 'VBUS', 'CBUS', 'NTC',
  'IOUTA', 'IOUTB', 'IOUTC',
  // 离散控制与状态
  'FAULT_BKIN', 'DRV_EN', 'CAL',
  // 调试与时钟
  'SWDIO', 'SWCLK', 'UART_TX', 'UART_RX', 'NRST', 'BOOT0', 'HSE_IN', 'HSE_OUT',
];

/** ★ 低边 PWM「分配标记 → TIM1 通道名」映射。
 * 注意：INLx 的通道号与引脚序号**无关** —— 本设计 INLA 占的是 TIM1_CH3N。
 * 生成文档表时必须用这张映射，不能拿分配标记去猜（2026-10-15 踩过：表里 AF 显示 "?"）。
 */
export const LOW_SIDE_CHANNEL = {
  INLA: 'TIM1_CH3N',
  INLB: 'TIM1_CH1N',
  INLC: 'TIM1_CH2N',
};

export const PIN_COUNT = LQFP64.length;

/** 自查：脚号连续 1..64；引脚名允许重复的只有电源/地 */
export function selfCheck() {
  const errs = [];
  const nums = LQFP64.map((r) => r[0]).sort((a, b) => a - b);
  if (nums.length !== 64) errs.push(`引脚数 ${nums.length} ≠ 64`);
  for (let i = 0; i < 64; i += 1) if (nums[i] !== i + 1) errs.push(`脚号缺 ${i + 1}`);
  const MAY_REPEAT = /^(VSS|VDD|VSSA|VDDA|VREF\+)$/;
  const seen = new Map();
  for (const [, name] of LQFP64) seen.set(name, (seen.get(name) || 0) + 1);
  for (const [name, n] of seen) {
    if (n > 1 && !MAY_REPEAT.test(name)) errs.push(`引脚名 ${name} 重复 ${n} 次`);
  }
  for (const [num, , , assign] of LQFP64) {
    if (!(assign in ASSIGN_GROUP)) errs.push(`脚 ${num} 的分配标记 ${assign} 未在 ASSIGN_GROUP 中登记`);
  }
  // 用到的模拟输入脚必须有 ADC 通道
  for (const [num, name, , assign] of LQFP64) {
    if (['VBEMF_A', 'VBEMF_B', 'VBEMF_C', 'VN', 'VBUS', 'CBUS', 'NTC',
      'IOUTA', 'IOUTB', 'IOUTC'].includes(assign) && !ADC_CHANNELS[name]) {
      errs.push(`脚 ${num}（${name}）被分配为 ${assign}，但它没有 ADC 通道`);
    }
  }
  // 三相 PWM 低边必须在 TIM1_CHxN 上，且 LOW_SIDE_CHANNEL 的映射要与该脚真实具备的通道一致
  for (const [num, name, , assign] of LQFP64) {
    if (['INLA', 'INLB', 'INLC'].includes(assign)) {
      const afs = KEY_AF[name] || {};
      const want = LOW_SIDE_CHANNEL[assign];
      if (!want) errs.push(`LOW_SIDE_CHANNEL 缺 ${assign} 的映射`);
      else if (!(want in afs)) {
        errs.push(`脚 ${num}（${name}）被分配为 ${assign}，映射要求 ${want}，`
          + `但该脚实际只有 [${Object.keys(afs).join(', ')}]`);
      }
    }
  }
  // ★ 必需信号必须全部已分配（2026-10-15 踩过：重排引脚时把 DRV_EN/CAL 弄丢了，
  //   而旧自检只查"已分配的脚合法"，不查"必需的信号都在"，于是漏过）
  const assigned = new Set(LQFP64.map((r) => r[3]));
  for (const need of REQUIRED_SIGNALS) {
    if (!assigned.has(need)) errs.push(`必需信号 ${need} 没有分配到任何引脚`);
  }
  // 分配标记不得重复占用（电源/地/未用类除外）
  const MAY_SHARE = /^(3V3|GND|GNDA|3V3A|NC|RSV)$/;
  const cnt = new Map();
  for (const [, , , a] of LQFP64) cnt.set(a, (cnt.get(a) || 0) + 1);
  for (const [a, c] of cnt) {
    if (c > 1 && !MAY_SHARE.test(a)) errs.push(`分配标记 ${a} 被 ${c} 个脚重复占用`);
  }
  return errs;
}

/** 本设计实际用到的模拟量（用于资源核对） */
export const ANALOG_NEEDS = [
  ['相电位 A', 'PA0'], ['相电位 B', 'PA1'], ['相电位 C', 'PA2'],
  ['虚拟中性点 VN', 'PC3'], ['母线电压 VBUS', 'PC1'],
  ['母线电流 CBUS', 'PA7'], ['温度 NTC', 'PA4'],
  ['A 相电流 IOUTA', 'PC4'], ['B 相电流 IOUTB', 'PB0'], ['C 相电流 IOUTC', 'PC5'],
];
