#!/usr/bin/env node
/**
 * tools/design.config.mjs
 * 控制板元件表（单一数据源）。
 *
 * 规则（见 01_PCB/Motor-project/器件选型规范.md）：
 *   - 每个元件必须有 值 + 嘉立创官方封装名 + LCSC 货号
 *   - 封装必须来自嘉立创官方库；LCSC 货号用官方接口核实（tools/check-lcsc.mjs）
 *   - 未绑定货号的项必须写 lcsc: null 并在 todo 里说明，不得编造
 *
 * ⚠️ 本文件在**阶段③ 原理图**才被真正消费；阶段② 只用于自检「器件表能不能落地」。
 *    当前状态：骨架 + 关键器件占位，货号绑定进度见 04_物料清单_BOM草案.md §3。
 */

export const PROJECT = {
  name: 'drvctrl',
  title: 'DRV8323HR 控制板',
  version: '0.1.0-stage2',
  libName: 'drvctrl',
  paper: 'A3',
};

/** 引脚模板 */
const pin = (number, name, type = 'passive') => ({ number, name, type });

export const COMPONENTS = [
  // ---------------- MCU ----------------
  {
    libId: 'MCU:STM32G431RBT6',
    kind: 'lqfp64',
    refPrefix: 'U',
    value: 'STM32G431RBT6',
    footprint: 'LQFP-64_L10.0-W10.0-P0.50-LS12.0-BL',   // ★ 立创官方名（2026-10-15 实测）
    lcsc: 'C431633',                                    // ★ 实测确认；备选 STM32G431RBT6TR = C3019121（同封装）
    datasheet: 'https://www.st.com/resource/en/datasheet/stm32g431rb.pdf',
    desc: 'ARM Cortex-M4 170MHz 128KB Flash 32KB RAM LQFP64',
  },

  // ---------------- 电源 ----------------
  {
    libId: 'Regulator_Linear:LDO_3V3',
    refPrefix: 'U',
    value: 'AMS1117-3.3',
    footprint: 'SOT-223-3_L6.5-W3.4-P2.30-LS7.0-BR',
    lcsc: 'C6186',                    // 已核实封装名（V3.1 + 本项目 API 双向确认）
    desc: '5V->3.3V LDO 1A, SOT-223',
    pins: [pin(1, 'GND', 'power_in'), pin(2, 'VOUT', 'power_out'), pin(3, 'VIN', 'power_in')],
  },
  {
    libId: 'Device:C',
    refPrefix: 'C',
    value: '100nF',
    footprint: 'C0603',
    lcsc: 'C149620',
    desc: '去耦电容 100nF/50V X7R 0603（车规 AC 系列）',
    pins: [pin(1, '1'), pin(2, '2')],
  },
  {
    libId: 'Device:C_Small',
    refPrefix: 'C',
    value: '180pF',
    footprint: 'C0603',
    lcsc: null,                       // ⚠️ 待绑定（必须 C0G/NP0）
    desc: '相分压/VN RC 滤波 180pF C0G 0603（4 只同批，见 03_计算书 §2.5/§3.3）',
    pins: [pin(1, '1'), pin(2, '2')],
  },
  {
    libId: 'Device:R',
    refPrefix: 'R',
    value: '10k',
    footprint: 'R0603',
    lcsc: 'C2906982',
    desc: '电阻 10k 1% 0603（相分压下臂 / VN 下臂 / 上拉）',
    pins: [pin(1, '1'), pin(2, '2')],
  },
  {
    libId: 'Device:R_HV',
    refPrefix: 'R',
    value: '150k',
    footprint: 'R0805',
    lcsc: 'C2907228',
    desc: '相分压上臂 / VN 上臂 150k 1% 0805（承压 37.5V，必须 0805，见 03_计算书 §2.3）',
    pins: [pin(1, '1'), pin(2, '2')],
  },
  {
    libId: 'Device:R_VN',
    refPrefix: 'R',
    value: '30k',
    footprint: 'R0805',
    lcsc: null,                       // ⚠️ 待绑定
    desc: 'VN 星形求和电阻 30k 1% 0805（三只等值，见 03_计算书 §3.2）',
    pins: [pin(1, '1'), pin(2, '2')],
  },

  // ---------------- 时钟 ----------------
  {
    libId: 'Device:Crystal',
    refPrefix: 'Y',
    value: '24MHz',
    footprint: 'CRYSTAL-SMD_4P-L3.2-W2.5-BL',
    lcsc: 'C70590',
    desc: '无源晶振 24MHz ±10ppm CL=12pF 3225（负载电容 20pF，见 05_缺项清单.md B-04）',
    pins: [pin(1, '1'), pin(2, '2'), pin(3, 'GND'), pin(4, 'GND')],
  },

  // ---------------- 连接器 ----------------
  {
    libId: 'Connector:Conn_02x16',
    refPrefix: 'J',
    value: 'P2 排母 2x16',
    footprint: 'HDR-TH_32P-P2.54-V-F-R2-C16-S2.54',
    lcsc: 'C2897417',                 // 备选 C22373921 / C7500800（同封装名）
    desc: '2x16P 2.54mm 母座 H8.5，配对底板 P2（层距靠 M3 柱，见 05_缺项清单.md B-09）',
    pins: Array.from({ length: 32 }, (_, i) => pin(i + 1, String(i + 1))),
  },
  {
    libId: 'Connector:Conn_01x04',
    refPrefix: 'J',
    value: '4P 相电位取样',
    footprint: 'CONN-TH_LAIL-PHC2.54-4P-01-XH-L',
    lcsc: 'C54905972',
    desc: 'GND/SHA/SHB/SHC 三相取样连接器（XH 2.54 带扣）',
    pins: [pin(1, 'GND'), pin(2, 'SHA'), pin(3, 'SHB'), pin(4, 'SHC')],
  },
  {
    libId: 'Connector:Conn_02x05',
    refPrefix: 'J',
    value: 'SWD 2x5',
    footprint: 'HDR-TH_10P-P2.54-V-M-R2-C5-S2.54',
    lcsc: 'C492422',
    desc: 'SWD 调试口（3V3/GND/SWDIO/SWCLK/NRST/SWO）',
    pins: Array.from({ length: 10 }, (_, i) => pin(i + 1, `S${i + 1}`)),
  },

  // ---------------- 指示与测试 ----------------
  {
    libId: 'Device:LED',
    refPrefix: 'D',
    value: 'LED',
    footprint: 'LED-SMD_L1.6-W0.8-R-RD',
    lcsc: 'C2286',
    desc: '状态指示 LED 0603 红',
    pins: [pin(1, 'K', 'passive'), pin(2, 'A', 'passive')],
  },
  {
    libId: 'Mechanical:TestPoint',
    refPrefix: 'TP',
    value: 'TESTPOINT',
    footprint: 'TESTPOINT-SMD_L1.6-W0.8_RCU-0C',
    lcsc: 'C5846954',                 // Harwin S2761-46R，V3.1 已核实
    desc: '测试点（沿用 V3.1 封装）',
    pins: [pin(1, '1')],
  },
  {
    libId: 'Mechanical:MountingHole',
    refPrefix: 'H',
    value: 'MountingHole_3.2mm',
    footprint: 'M3',
    lcsc: null,
    desc: '安装孔（虚拟件，无料号）',
    pins: [],
  },
];

/** 自检：R3 四要素（val/fp/lcsc/desc）是否齐全 */
export function selfCheck() {
  const errs = [];
  const warn = [];
  for (const c of COMPONENTS) {
    if (!c.value) errs.push(`${c.libId}: 缺 value`);
    if (!c.footprint) errs.push(`${c.libId}: 缺 footprint`);
    if (!c.desc) errs.push(`${c.libId}: 缺 desc`);
    if (c.lcsc === null) warn.push(`${c.libId}: LCSC 货号未绑定（${c.todo || '待绑定'}）`);
  }
  const ids = COMPONENTS.map((c) => c.libId);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) errs.push(`libId 重复: ${dup.join(', ')}`);
  return { errs, warn };
}
