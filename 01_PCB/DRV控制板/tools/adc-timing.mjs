#!/usr/bin/env node
/**
 * tools/adc-timing.mjs
 * STM32G431 ADC 时序计算器（R4 返工用，可复算）。
 *
 * 背景：初版计算书用了**不存在的 810 周期**采样档。STM32G4 的 ADC_SMPR 只有
 *   2.5 / 6.5 / 12.5 / 24.5 / 47.5 / 92.5 / 247.5 / 640.5 个 ADC 周期这 8 档。
 * 本脚本按真实档位重算「单通道时长」「一轮扫描」「扇区占比」。
 *
 * 用法：node tools/adc-timing.mjs
 */

const SMPR = [2.5, 6.5, 12.5, 24.5, 47.5, 92.5, 247.5, 640.5];
const CONV_12BIT = 12.5;           // 12 位逐次逼近固定 12.5 个 ADC 周期

const ADCCLK_MHZ = 42.5;           // PLLP 分频得到；12 位上限 60 MHz
const F_PWM_KHZ = Number(process.argv[2] || 20);
const F_ELEC_HZ = Number(process.argv[3] || 730);   // p=3 的最坏电频率

const t = (cycles) => cycles / ADCCLK_MHZ;          // µs

console.log(`ADCCLK = ${ADCCLK_MHZ} MHz ；12 位转换 = ${CONV_12BIT} 周期 = ${t(CONV_12BIT).toFixed(2)} µs\n`);
console.log('采样档位   单通道总时长      说明');
console.log('-'.repeat(56));
for (const s of SMPR) {
  const total = s + CONV_12BIT;
  const tag = s === 640.5 ? '  ← 最大档（初版误写成 810，不存在）' : '';
  console.log(`${String(s).padStart(6)} 周期   ${t(total).toFixed(2).padStart(6)} µs${tag}`);
}

const T_PWM = 1000 / F_PWM_KHZ;                        // µs
const T_SECTOR = 1e6 / (6 * F_ELEC_HZ);                // µs（六步：换相频率 = 6 × 电频率）
console.log(`\nPWM 周期 @${F_PWM_KHZ} kHz        = ${T_PWM.toFixed(2)} µs`);
console.log(`换相扇区 @${F_ELEC_HZ} Hz (p=3) = ${T_SECTOR.toFixed(1)} µs`
  + `（= ${(T_SECTOR / T_PWM).toFixed(1)} 个 PWM 周期）`);
console.log(`理想过零位置（扇区中点）      ≈ ${(T_SECTOR / 2).toFixed(1)} µs\n`);

// ---------------------------------------------------------------
// ★ 两个独立过程（审核 R4 明确要求分开算）：
//   过程 A：外部 RC 阶跃恢复 —— 从换相跳变起，节点电压恢复到目标精度所需时间 = 9.03 × τ_ext
//   过程 B：ADC 采样保持建立 —— 采样开关闭合后，采样电容被充到目标精度所需时间
//           τ_adc = (R_src ∥ R_ext等效) × (C_ext + C_sh)
//           这里 C_sh ≈ 5 pF（G4 采样电容量级），R_ext等效 = R_src
// ---------------------------------------------------------------
const C_SH_PF = 5;          // ADC 采样电容（pF）
const R_ADC_SW = 2000;      // 采样开关电阻（Ω），用于内部建立检查

const CASES = [
  // 名称, R_src(Ω), C_ext(F), 采样档(周期)
  ['相分压 10.375k × 150 pF', 10.375e3, 150e-12, 640.5],
  ['相分压 10.375k × 180 pF', 10.375e3, 180e-12, 640.5],
  ['相分压 10.375k × 100 pF', 10.375e3, 100e-12, 640.5],
  ['VN      10.412k × 150 pF', 10.412e3, 150e-12, 640.5],
  ['VN      10.412k × 100 pF', 10.412e3, 100e-12, 640.5],
  ['电流     0.1k   × 1 nF ', 0.1e3, 1e-9, 92.5],
  ['电流     0.1k   × 1 nF ', 0.1e3, 1e-9, 47.5],
  ['VBUS     5.6k   × 1 nF ', 5.6e3, 1e-9, 640.5],
  ['VBUS     5.6k   × 330 pF', 5.6e3, 330e-12, 640.5],
  ['NTC      5k     × 1 nF ', 5e3, 1e-9, 92.5],
];

console.log('★ 过程 A：外部 RC 阶跃恢复（换相后必须等待）');
console.log('支路                        τ_ext(µs)  9.03τ(µs)');
console.log('-'.repeat(58));
const tauA = {};
for (const [name, R, C, smpr] of CASES) {
  const tau = R * C * 1e6;
  tauA[`${name}|${smpr}`] = tau;
  console.log(`${name}  ${tau.toFixed(3).padStart(8)}  ${(9.03 * tau).toFixed(2).padStart(9)}`);
}

console.log('\n★ 过程 B：ADC 采样保持建立（采样窗内必须完成）');
console.log('支路                        档位    采样窗(µs)  τ_adc(µs)  9.03τ_adc(µs)  判定');
console.log('-'.repeat(92));
const VERDICT = {};
for (const [name, R, C, smpr] of CASES) {
  const win = t(smpr);                       // 采样窗 = 采样档本身
  const RsrcEff = R;                         // 分压支路的等效源阻抗已含在 R 里
  const tauAdc = RsrcEff * (C + C_SH_PF * 1e-12) * 1e6;
  const need = 9.03 * tauAdc;
  const ok = win >= need;
  VERDICT[`${name}|${smpr}`] = ok;
  console.log(`${name} ${String(smpr).padStart(6)} ${win.toFixed(2).padStart(10)} `
    + `${tauAdc.toFixed(3).padStart(10)} ${need.toFixed(2).padStart(12)}   ${ok ? '✓' : '✗'}`);
}

console.log('\n★ 两个过程都要过 ⇒ 该支路才成立');
console.log('支路                        过程A(9.03τ_ext ≤ 扇区可用段?)  过程B(建立?)  结论');
console.log('-'.repeat(88));
const BLANK_BUDGET = Math.min(T_SECTOR * 0.15, 3 * T_PWM);   // 消隐预算：扇区 15% 与 3 个 PWM 周期取小
console.log(`（消隐预算 = min(扇区×15%, 3×PWM) = ${BLANK_BUDGET.toFixed(1)} µs）\n`);
for (const [name, R, C, smpr] of CASES) {
  const tau = tauA[`${name}|${smpr}`];
  const aOk = 9.03 * tau <= BLANK_BUDGET;
  const bOk = VERDICT[`${name}|${smpr}`];
  const verdict = aOk && bOk ? '✅ 可用' : (aOk ? '⚠ 采样窗不足' : '❌ 恢复时间超消隐预算');
  console.log(`${name} ${String(smpr).padStart(6)}  `
    + `${(9.03 * tau).toFixed(1).padStart(8)} µs ${aOk ? '✓' : '✗'}`
    + `                      ${bOk ? '✓' : '✗'}      ${verdict}`);
}

console.log('\n★ 一轮扫描预算');
const tHigh = t(640.5 + CONV_12BIT);
const tLow = t(92.5 + CONV_12BIT);
console.log(`  高阻通道(640.5档) ${tHigh.toFixed(2)} µs/路 ；低阻通道(92.5档) ${tLow.toFixed(2)} µs/路`);
const scans = [
  ['相分压 ×3（ADC1 顺序）', 3 * tHigh],
  ['相分压 ×3 + VN（ADC1 顺序）', 4 * tHigh],
  ['三相电流 ×3（低阻）', 3 * tLow],
  ['慢变量 VBUS/CBUS/NTC', tHigh + 2 * tLow],
];
for (const [name, us] of scans) {
  console.log(`  ${name.padEnd(30)} ${us.toFixed(1).padStart(6)} µs   `
    + (us <= T_PWM ? '✓ 放进 1 个 PWM 周期' : `✗ 超 PWM 周期 ${(us / T_PWM).toFixed(1)}×`));
}

console.log('\n★ 消隐窗口约束（按扇区比例看，不用「N 个 PWM 周期」这种绝对数）');
for (const n of [1, 2, 3, 5]) {
  const blank = n * T_PWM;
  const used = (blank / T_SECTOR) * 100;
  console.log(`  消隐 ${n} 个 PWM 周期 = ${blank.toFixed(0)} µs = 扇区的 ${used.toFixed(1)}%`
    + (used > 20 ? '   ← 会吃掉扇区中点的过零' : ''));
}
console.log(`\n  ⇒ 消隐必须 ≤ 扇区的 ~15–20%（当前 20 kHz 配置下预算 ≈ ${BLANK_BUDGET.toFixed(0)} µs）`);

console.log('\n★ 提高 PWM 频率后的资源对比');
console.log('  f_PWM   周期(µs)  相分压×3+VN(µs)  占周期   3 个周期消隐占扇区');
console.log('-'.repeat(74));
for (const f of [20, 25, 30, 40]) {
  const Tp = 1000 / f;
  const scan = 4 * tHigh;
  const b = Math.min((3 * Tp) / T_SECTOR * 100, 999);
  console.log(`  ${String(f).padStart(2)} kHz ${Tp.toFixed(1).padStart(9)} ${scan.toFixed(1).padStart(16)} `
    + `${(scan / Tp * 100).toFixed(0).padStart(6)}% ${b.toFixed(0).padStart(18)}%`);
}

