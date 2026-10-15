#!/usr/bin/env node
/** 用数据源重生成 02 的 §4.2 汇总表（PWM / 模拟 / 离散 I/O / 时钟电源）。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { LQFP64, ADC_CHANNELS, KEY_AF, ANALOG_NEEDS, LOW_SIDE_CHANNEL } from './lib/pins.mjs';

const DOC = '02_系统方案与资源分配.md';
let s = readFileSync(DOC, 'utf8');

const pinOf = (assign) => LQFP64.find((r) => r[3] === assign);
const row = (assign) => {
  const r = pinOf(assign);
  return r ? { num: r[0], name: r[1] } : null;
};
const afOf = (name, key) => (KEY_AF[name] && KEY_AF[name][key] ? `AF${KEY_AF[name][key]}` : '?');
const adcOf = (name) => (ADC_CHANNELS[name] || []).join(' / ') || '—';

// --- P2 脚号映射（来自 01 文档的逐针表）---
const P2 = {
  IOUTA: 8, IOUTB: 6, IOUTC: 4, VBUS: 11, CBUS: 12, NTC: 13,
  FAULT_BKIN: 14, DRV_EN: 23, CAL: 24,
  INHA: 25, INLA: 26, INHB: 27, INLB: 28, INHC: 29, INLC: 30,
};

const L = [];
L.push('### 4.2 本设计真正用到的引脚（汇总，画图用）');
L.push('');
L.push('> 同 §4.1：本表由 `tools/gen-pin-table.mjs` 从 `tools/lib/pins.mjs` 生成，**不要手改**。');
L.push('');
L.push('**三相 PWM（TIM1，三相互补 + 硬件死区）**');
L.push('');
L.push('| 功能 | 引脚 | LQFP64 | 外设 | AF | P2 脚 |');
L.push('|---|---|---:|---|---|---:|');
for (const [fn, key] of [['INHA', 'TIM1_CH1'], ['INLA', LOW_SIDE_CHANNEL.INLA], ['INHB', 'TIM1_CH2'],
  ['INLB', LOW_SIDE_CHANNEL.INLB], ['INHC', 'TIM1_CH3'], ['INLC', LOW_SIDE_CHANNEL.INLC]]) {
  const r = row(fn);
  L.push(`| \`${fn}\` | **${r.name}** | ${r.num} | \`${key}\` | ${afOf(r.name, key)} | ${P2[fn]} |`);
}
const bk = row('FAULT_BKIN');
L.push(`| 硬件刹车 | **${bk.name}** | ${bk.num} | \`TIM1_BKIN\` | ${afOf(bk.name, 'TIM1_BKIN')} | ${P2.FAULT_BKIN}（\`FAULT\`） |`);
L.push('');
L.push('> ✅ **AF 编号已按 DS12589 Table 13 显式列结构重新解析**（审核 R2）：`PA8/PA9/PA10` 与 `PB13/PB14` 是 **AF6**、`PB15` 是 **AF4**、`PA6`/`PB12` 的 `TIM1_BKIN` 是 **AF6**。');
L.push('> ⛔ **`PA0` 不能作刹车**——它是 A 相分压输入。');
L.push('');
L.push('**模拟输入（10 路）**');
L.push('');
L.push('| 功能 | 引脚 | LQFP64 | 模拟通道 | 采样时序 | P2 脚 |');
L.push('|---|---|---:|---|---|---:|');
const ANA = [
  ['相电位 A（分压后）', 'VBEMF_A', 'PWM 触发，低边导通窗口', '—（三相取样线）'],
  ['相电位 B', 'VBEMF_B', '同上', '—'],
  ['相电位 C', 'VBEMF_C', '同上', '—'],
  ['虚拟中性点 VN', 'VN', '同一次触发内紧随浮空相', '—'],
  ['母线电压 VBUS', 'VBUS', '可异步（慢速组）', 11],
  ['母线电流 CBUS', 'CBUS', '可异步（慢速组）', 12],
  ['A 相电流 IOUTA', 'IOUTA', '低边导通窗口', 8],
  ['B 相电流 IOUTB', 'IOUTB', '低边导通窗口', 6],
  ['C 相电流 IOUTC', 'IOUTC', '低边导通窗口', 4],
  ['温度 NTC', 'NTC', '可异步（慢速组）', 13],
];
for (const [label, assign, timing, p2] of ANA) {
  const r = row(assign);
  L.push(`| ${label} | **${r.name}** | ${r.num} | \`${adcOf(r.name)}\` | ${timing} | ${p2} |`);
}
L.push('');
L.push('**离散 I/O**');
L.push('');
L.push('| 功能 | 引脚 | LQFP64 | 方向 | 复位默认 | 安全态 / 说明 | P2 脚 |');
L.push('|---|---|---:|---|---|---|---:|');
const DIO = [
  ['`FAULT` → 刹车 + 软件回读', 'FAULT_BKIN', '输入（`TIM1_BKIN`，同脚可作 GPIO 读回）', '输入-浮空', '刹车极性配为**低有效**；本板 100 kΩ 上拉 + **1 nF** 抗毛刺（`03` §5.3，**不得用 100 nF**）', 14],
  ['`DRV_EN`', 'DRV_EN', '输出', '输入-浮空', '本板 100 kΩ 下拉 + 底板 10 kΩ 下拉 ⇒ **复位/掉电 = 低 = 驱动关断**', 23],
  ['`CAL`', 'CAL', '输出', '输入-浮空', '本板 100 kΩ 下拉 ⇒ **复位/掉电 = 低 = 不校准**', 24],
  ['状态 LED（可选）', 'LED', '输出', '输入-浮空', '串 1 kΩ + 0 Ω 可断', '—'],
  ['调试串口 TX', 'UART_TX', '输出', '输入-浮空', 'USART2_TX（AF7）；⚠️ 见 B-05 UCPD 约定', '—'],
  ['调试串口 RX', 'UART_RX', '输入', '输入-浮空', 'USART2_RX（AF7）；本板 10 kΩ 上拉；⚠️ 同 B-05', '—'],
  ['SWDIO', 'SWDIO', '双向', '**SWD 复用默认**', '⛔ **专用，禁止复用**', '—'],
  ['SWCLK', 'SWCLK', '输入', '**SWD 复用默认**', '⛔ **专用，禁止复用**', '—'],
  ['`NRST`', 'NRST', '双向', '—', '100 nF + 10 kΩ 上拉 + 按键 + SWD 排针', '—'],
  ['`BOOT0`', 'BOOT0', '输入', '输入-浮空', '本板 100 kΩ 下拉 + 2P 跳线', '—'],
];
for (const [fn, assign, dir, dflt, sa, p2] of DIO) {
  const r = row(assign);
  L.push(`| ${fn} | **${r.name}** | ${r.num} | ${dir} | ${dflt} | ${sa} | ${p2} |`);
}
L.push('');
L.push('**时钟与电源**（★ 脚号已按 KiCad 官方库修正）');
L.push('');
L.push('| 项 | 引脚（LQFP64） | 器件 |');
L.push('|---|---|---|');
const g = (a) => { const r = row(a); return `${r.name}(${r.num})`; };
const allOf = (assign) => LQFP64.filter((r) => r[3] === assign).map((r) => r[0]).join(' / ');
const C = '`';
L.push(`| HSE IN / OUT | ${g('HSE_IN')} / ${g('HSE_OUT')} | 24 MHz 无源晶振 + 负载电容（按 ${C}C_L${C} 核算，见 B-04/B-06） |`);
L.push(`| **VDD ×5** | **${allOf('3V3')}** | 各 100 nF + 全板 4.7 µF |`);
L.push(`| **VSS ×4** | **${allOf('GND')}** | 就近接地平面 |`);
L.push(`| VDDA / VSSA | ${g('3V3A')} / ${g('GNDA')} | 磁珠 + 100 nF ∥ 1 µF |`);
L.push(`| VREF+ | ${g('VREF_PLUS')} | 100 nF ∥ 1 µF，与 ${C}VDDA${C} 同电位但**单独去耦** |`);
L.push('| VCAP | **不存在** | ⛔ G431RB 的 LQFP64 **没有 VCAP 引出**（初版凭空造了两只，已删） |');
L.push('');

const i0 = s.indexOf('### 4.2 本设计真正用到的引脚');
const i1 = s.indexOf('### 4.3 为什么低边用');
if (i0 < 0 || i1 < 0) { console.error('锚点未找到'); process.exit(1); }
s = s.slice(0, i0) + L.join('\n') + s.slice(i1);
writeFileSync(DOC, s, 'utf8');
console.log('§4.2 已由数据源重新生成');
