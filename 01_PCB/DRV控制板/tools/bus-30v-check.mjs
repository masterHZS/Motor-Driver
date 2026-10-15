#!/usr/bin/env node
/**
 * 30 V 母线支持 —— 影响核算 + 文档更新。
 * 关键判断：1/23 分压比**不需要改**（它是按 60 V 尖峰留的余量，30 V 落在里面）；
 *           真正要换的是 TVS（SMBJ33A 的 V_RWM=33 V，在 30 V 母线上没余量）。
 */
const V_BUS_MAX = 30;
const K = 10 / 230;                 // 1/23
const VDD = 3.3;
const R1 = 220e3, R2 = 10e3, Rs = 4.7e3;
const Rth = (R1 * R2) / (R1 + R2) + Rs;

console.log('=== 30 V 母线下的相通道 ===');
console.log(`分压比 1/23；R_src = ${(Rth / 1e3).toFixed(3)} kΩ`);
for (const v of [12, 16.8, V_BUS_MAX, 40]) {
  const node = v * K;
  const adc = node * R2 / (R2 + Rs);
  console.log(`  V_ph=${String(v).padStart(5)} V -> 节点 ${node.toFixed(3)} V (码 ${Math.round(node / VDD * 4096)})，ADC 端 ${adc.toFixed(3)} V`);
}
const lsb = VDD / 4096 / K;
console.log(`  LSB = ${(lsb * 1000).toFixed(2)} mV（相端）`);

console.log('\n=== 过压边界（TT_a 工作界 3.6 V / 绝对最大 4.0 V / ADC 满量程 3.3 V）===');
for (const [name, lim] of [['ADC 满量程', VDD], ['TT_a 工作上限', 3.6], ['绝对最大', 4.0]]) {
  console.log(`  节点到 ${lim} V  <=>  相端 ${(lim / K).toFixed(1)} V`);
}

console.log('\n=== TVS 选型对比（30 V 母线）===');
const TVS = [
  ['SMBJ33A', 33, 40.6, 53.3, 'C224019', 'SMB_L4.6-W3.6-LS5.3-RD'],
  ['SMBJ36A', 36, 44.2, 58.1, 'C224020', 'SMB_L4.4-W3.6-LS5.4-RD'],
  ['SMBJ40A', 40, 49.1, 64.5, 'C10221',  'SMB_L4.6-W3.6-LS5.3-RD'],
];
console.log('型号       V_RWM  V_BR(max)  V_CL   V_RWM-30V余量  V_CL折节点  30V下是否导通  货号');
for (const [nm, vrwm, vbr, vcl, lcsc, fp] of TVS) {
  const margin = vrwm - V_BUS_MAX;
  const nodeCl = vcl * K;
  const ok = vrwm > V_BUS_MAX ? (vbr > V_BUS_MAX ? '否（安全）' : '可能') : '**会导通**';
  console.log(`${nm.padEnd(9)} ${String(vrwm).padStart(5)} ${String(vbr).padStart(9)} ${String(vcl).padStart(6)} ${String(margin).padStart(12)} V ${nodeCl.toFixed(2).padStart(10)} V  ${ok.padEnd(12)} ${lcsc}  ${fp}`);
}
console.log('\n结论：30 V 母线必须用 SMBJ40A（V_RWM 40 V > 30 V 有 10 V 余量；V_BR(min) 44.4 V > 30 V 不误触发）');
console.log('      SMBJ40A 与 SMBJ33A **封装名完全相同** => 换料不动 PCB');

console.log('\n=== 尖峰设计点（R3 文档 U-1 待实测项）===');
console.log(`  母线 30 V + 10% 开关过冲 = ${(V_BUS_MAX * 1.1).toFixed(0)} V`);
console.log('  ⚠️ 原设计的 "60 V 尖峰不死" 是自定值；30 V 母线是否改变尖峰要求，需用户确认');
console.log('  ✅ 但 1/23 分压比在两种口径下都成立：60 V -> 2.609 V，30 V -> 1.304 V，均 < 3.3 V');
console.log(`  R1 在 30 V 常态功耗 = 30^2/220k = ${(900 / 220e3 * 1000).toFixed(1)} mW（对 125 mW 余量 ${(125 / (900 / 220e3 * 1000)).toFixed(0)}x）`);
