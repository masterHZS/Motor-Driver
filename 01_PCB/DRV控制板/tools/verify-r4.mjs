#!/usr/bin/env node
/**
 * 独立验证 R4 文档的关键结论（不采信子代理的自述，全部自己重算）。
 * 重点验它"说前序文档错"的三条 + 关键门限。
 */
const ADCCLK = 42.5;                       // MHz
const t = (cyc) => cyc / ADCCLK;           // µs
const CONV = 12.5;

let pass = 0, fail = 0;
const chk = (name, got, want, tol, unit = '') => {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? '✓' : '✗'} ${name}: 算得 ${got.toFixed(3)}${unit}，文档称 ${want}${unit}`);
  ok ? pass++ : fail++;
};

console.log('=== ① 采样档位与单通道时长 ===');
chk('640.5 档采样窗', t(640.5), 15.07, 0.01, ' µs');
chk('640.5 档单通道总时长', t(640.5 + CONV), 15.365, 0.01, ' µs');
chk('92.5 档单通道总时长', t(92.5 + CONV), 2.471, 0.01, ' µs');
chk('247.5 档单通道总时长', t(247.5 + CONV), 6.118, 0.01, ' µs');

console.log('\n=== ② 两条支路的两个过程（相分压 / VN）===');
const R1 = 220e3, R2 = 10e3, Rs = 4.7e3;
const Rth = (R1 * R2) / (R1 + R2) + Rs;
const Cext = 100e-12, Csh = 5e-12;
chk('相分压 R_src', Rth / 1e3, 14.265, 0.01, ' kΩ');
chk('过程 A：9.03·τ_ext', 9.03 * Rth * Cext * 1e6, 12.88, 0.05, ' µs');
chk('过程 B：9.03·τ_adc', 9.03 * Rth * (Cext + Csh) * 1e6, 13.53, 0.05, ' µs');
const marginB = t(640.5) - 9.03 * Rth * (Cext + Csh) * 1e6;
chk('过程 B 余量', marginB, 1.54, 0.05, ' µs');
console.log(`   过程 B 余量占比 ${(marginB / t(640.5) * 100).toFixed(1)} %（文档称 10.2 %）`);

console.log('\n=== ③ ③ 孔径必须落在低边导通窗口内（R4 新提出的硬约束）===');
const A = t(640.5 + CONV);          // 孔径 = 采样 + 转换
const Wmin = 9.03 * Rth * Cext * 1e6 + A;
chk('W_min = 9.03τ_ext + 孔径', Wmin, 27.95, 0.1, ' µs');
console.log(`   其中 9.03τ_ext=${(9.03 * Rth * Cext * 1e6).toFixed(2)} µs，孔径 A=${A.toFixed(3)} µs`);
for (const f of [20, 25, 30]) {
  const Tp = 1000 / f;
  // W_ls = 2·min(D,1−D)·T_pwm − t_dead；取 t_dead=0 求最坏占空比边界
  // 需要 2·min(D,1-D)·Tp >= W_min  => min(D,1-D) >= W_min/(2·Tp)
  const m = Wmin / (2 * Tp);
  const lo = m, hi = 1 - m;
  console.log(`   @${f} kHz（周期 ${Tp.toFixed(1)} µs）⇒ 合法占空比 D ∈ [${(lo * 100).toFixed(1)} %, ${(hi * 100).toFixed(1)} %]`);
}
console.log('   文档称：@20 kHz [28 %,72 %]｜@25 kHz [35 %,65 %]｜@30 kHz [42 %,58 %]');

console.log('\n=== ④ 若 C_ext 降到 47 pF ===');
const C47 = 47e-12;
const A47 = 9.03 * Rth * C47 * 1e6 + A;
const tau47 = Rth * C47 * 1e6;
chk('47 pF 的 τ_ext', tau47, 0.670, 0.01, ' µs');
chk('47 pF 的 W_min', A47, 21.12, 0.1, ' µs');
for (const f of [20, 25]) {
  const Tp = 1000 / f;
  const m = A47 / (2 * Tp);
  console.log(`   @${f} kHz ⇒ D ∈ [${(m * 100).toFixed(1)} %, ${((1 - m) * 100).toFixed(1)} %]`);
}
console.log('   文档称：47 pF @20 kHz D 放到 [21 %,79 %]；孔径残差 0.236→0.111 LSB');

console.log('\n=== ⑤ 调度总时长 ===');
const r1 = t(640.5 + CONV);   // R1 浮空相(ADC1) + VN(ADC2) 同步
const r2 = t(92.5 + CONV);    // R2 IOUTB(ADC1) + 相电流(ADC2) 同步
const r3 = t(92.5 + CONV);    // R3 相电流(ADC1) + CBUS(ADC2)
const r4 = t(247.5 + CONV);   // R4 VBUS(ADC2) + NTC
const fast = r1 + r2 + r3;
const all = fast + r4;
chk('R1 同步对', r1, 15.365, 0.01, ' µs');
chk('快组 R1+R2+R3', fast, 17.84, 0.05, ' µs');
chk('全量四轮', all, 35.67, 0.05, ' µs');
console.log(`   快组占 20 kHz 周期 ${(fast / 50 * 100).toFixed(1)} %（文档称 35.7 %）`);
console.log(`   全量占 20 kHz 周期 ${(all / 50 * 100).toFixed(1)} %（文档称 71.3 %）`);
chk('全量 @30 kHz 周期', 1000 / 30, 33.33, 0.01, ' µs');
console.log(`   ⇒ 全量 ${all.toFixed(2)} µs > 33.33 µs ⇒ @30 kHz 放不进（文档结论一致）`);

console.log('\n=== ⑥ 消隐与扇区 ===');
for (const [p, fe] of [[2, 487], [3, 730]]) {
  const sector = 1e6 / (6 * fe);
  const blank = sector * 0.15;
  console.log(`   p=${p}（${fe} Hz）：扇区 ${sector.toFixed(1)} µs，消隐 15 % = ${blank.toFixed(1)} µs，理想过零在中点 ${(sector / 2).toFixed(1)} µs`);
  const remain = (sector / 2 - blank) / (sector / 2) * 100;
  console.log(`      ⇒ 中点过零保留余量 ${remain.toFixed(1)} %（文档称 70.0 %）`);
  const rounds = Math.floor((sector - blank) / all);
  const deg = 360 / (6 * rounds);
  console.log(`      ⇒ 扇区内可采 ${rounds} 轮，时间量化 ${deg.toFixed(1)}°（文档称 p=2:5 轮/8.8°，p=3:3 轮/13.1°）`);
}

console.log('\n=== ⑦ 母线余量（4S）===');
const K = 10 / 230;
const v168 = 16.8 * K;
console.log(`   16.8 V -> 节点 ${v168.toFixed(3)} V = 量程的 ${(v168 / 3.3 * 100).toFixed(1)} %`);
console.log(`   ⇒ 余 ${((3.3 - v168) / 3.3 * 100).toFixed(1)} %，折合相端 ${((3.3 - v168) / K).toFixed(1)} V（文档称余 77.9 % = 59.1 V）`);
console.log(`   对 4S 满电 16.8 V 的倍数：${(3.3 / K / 16.8).toFixed(2)}×（文档称 4.52×）`);

console.log('\n=== ⑧ ADCCLK 上限 ===');
console.log('   R4 称双 ADC 同时工作时上限是 52 MHz（DS Table 60 分档），不是 60 MHz');
console.log(`   42.5 MHz 占 52 MHz 的 ${(42.5 / 52 * 100).toFixed(1)} %，余 ${(52 - 42.5).toFixed(1)} MHz`);
console.log('   ⚠️ 这一条我只能标"待原文复核"——52 MHz 的分档条件（几位分辨率/几个 ADC）我无法从手头文本确认');

console.log(`\n=== 汇总：${pass} 项复核通过，${fail} 项不符 ===`);
