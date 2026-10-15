#!/usr/bin/env node
/**
 * 用 tools/lib/pins.mjs + ADC_CHANNELS 重新生成「02_系统方案与资源分配.md」的 §4.1 全脚表。
 * 目的：脚号一律从**单一数据源**派生，杜绝手改再错（R1 的教训）。
 * 用法：node tools/gen-pin-table.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { LQFP64, ADC_CHANNELS, KEY_AF } from './lib/pins.mjs';

const DOC = '02_系统方案与资源分配.md';
let s = readFileSync(DOC, 'utf8');

// 分配标记 -> 中文用途说明
const USE = {
  '3V3': '✅ 接 +3.3 V',
  'GND': '✅ 地',
  'GNDA': '✅ **模拟地**（单点接平面）',
  '3V3A': '✅ +3.3 V（经磁珠 + RC）',
  'VREF_PLUS': '✅ +3.3 V（100 nF ∥ 1 µF，独立去耦）',
  'HSE_IN': '✅ **HSE 晶振 IN**',
  'HSE_OUT': '✅ **HSE 晶振 OUT**',
  'NRST': '✅ **复位**（100 nF + 10 kΩ 上拉 + 按键 + SWD）',
  'BOOT0': '✅ **BOOT0**：100 kΩ 下拉 + 2P 跳线',
  'SWDIO': '✅ **SWDIO**',
  'SWCLK': '✅ **SWCLK**',
  'UART_TX': '✅ **USART2_TX → 调试串口**',
  'UART_RX': '✅ **USART2_RX → 调试串口**',
  'INHA': '✅ **`INHA`**', 'INLA': '✅ **`INLA`**',
  'INHB': '✅ **`INHB`**', 'INLB': '✅ **`INLB`**',
  'INHC': '✅ **`INHC`**', 'INLC': '✅ **`INLC`**',
  'VBEMF_A': '✅ **相电位 A**（分压后）',
  'VBEMF_B': '✅ **相电位 B**（分压后）',
  'VBEMF_C': '✅ **相电位 C**（分压后）',
  'VN': '✅ **VN**（虚拟中性点）',
  'IOUTA': '✅ **IOUTA**（A 相电流）',
  'IOUTB': '✅ **IOUTB**（B 相电流）',
  'IOUTC': '✅ **IOUTC**（C 相电流）',
  'CBUS': '✅ **CBUS**（母线电流）',
  'VBUS': '✅ **VBUS**（母线电压）',
  'NTC': '✅ **NTC**（底板温度）',
  'FAULT_BKIN': '✅ **FAULT → 硬件刹车 + 软件回读**',
  'DRV_EN': '✅ **`DRV_EN`**',
  'CAL': '✅ **`CAL`**',
  'LED': '✅ **状态 LED**（可选，0 Ω 可断）',
  'NC': '⬜ 未用',
  'RSV': '🔷 预留（引到排空针，本版不接）',
};
const NOTE = {
  2: '数据手册注 (2)(3)：开关噪声敏感、驱动受限，**不作输出**',
  7: '⛔ 不复用',
  27: '与 VSS 单点相连',
  28: '与 `VDDA` 同电位但**必须单独去耦**',
  45: '⛔ **专用，禁止复用**',
  46: '⛔ **专用，禁止复用**',
  61: '⛔ 不可作普通 I/O（影响启动模式）',
};

const rows = [];
rows.push('| LQFP64 | 引脚 | 类型 | 本设计分配 | 模拟通道（DS12589 Table 12 附加功能列） | 说明 |');
rows.push('|---:|---|---|---|---|---|');
for (const [num, name, type, assign] of LQFP64) {
  const adc = ADC_CHANNELS[name] ? ADC_CHANNELS[name].join(' / ') : '—';
  const af = KEY_AF[name] ? '；AF：' + Object.entries(KEY_AF[name]).map(([k, v]) => `${k}=AF${v}`).join('、') : '';
  rows.push(`| ${num} | \`${name}\` | ${type} | ${USE[assign] || assign} | ${adc} | ${(NOTE[num] || '') + af} |`);
}

const i0 = s.indexOf('### 4.1 分配表（LQFP64，全部 64 脚）');
const i1 = s.indexOf('### 4.2 本设计真正用到的引脚');
if (i0 < 0 || i1 < 0) { console.error('锚点未找到'); process.exit(1); }

const HEAD = `### 4.1 分配表（LQFP64，全部 64 脚）

> ⚠️ **本表由 \`tools/gen-pin-table.mjs\` 从 \`tools/lib/pins.mjs\` 自动生成，不要手改。**
> 脚号权威来源：**KiCad 官方符号库** \`MCU_ST_STM32G4.kicad_sym\` 的 \`STM32G431RBTx\`。
> 每次交付前必须通过 \`node tools/build.mjs guard\`（与官方库逐脚比对 64/64 一致）与
> \`node tools/_verify-sym.mjs\`（符号内脚号↔引脚名与数据源一致）。
>
> **2026-10-15 审核 R1 教训**：初版脚号是从 DS12589 的 PDF 文本层按列序号推断的，**36/64 错位**，
> 还凭空多出两只根本不存在的 \`VCAP_1\`/\`VCAP_2\`（G431RB 的 LQFP64 没有 VCAP 引出）。
> 现在脚号**只认第三方权威逐脚比对**，不再靠文本层推断。

图例：**✅ 本设计使用** ｜ 🔷 预留 ｜ ⬜ 未用

`;

s = s.slice(0, i0) + HEAD + rows.join('\n') + '\n\n' + s.slice(i1);
writeFileSync(DOC, s, 'utf8');
console.log(`§4.1 已由数据源重新生成（${rows.length - 2} 行）`);
