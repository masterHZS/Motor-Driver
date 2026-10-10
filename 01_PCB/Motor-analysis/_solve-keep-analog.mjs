/**
 * 在 solve-pins.mjs 的 294 组合法解基础上，筛选「保持现有 5 路模拟脚不变」的解。
 *
 * 现有模拟脚（= design.mjs 已布线，改动代价最大）：
 *   P24=AIN0(A相电压)  P33=AIN3(B相电压)  P02=AIN8(C相电压)
 *   P35=AIN5(母线电流)  P01=AIN7(母线电压)
 *
 * 目标：找出所有「A/B/C 三对都是同一颗 ADT 的互补对（高=CHA、低=CHB）」且
 *       模拟脚恰好 = 上述 5 个的解。这样只需把 A 相低边从 P34 挪到合法脚，其余不动。
 */
const CH = {
  'TIM4_CHA': ['P23', 'P26', 'P34'],
  'TIM4_CHB': ['P15', 'P23', 'P24', 'P35'],
  'TIM5_CHA': ['P25', 'P27', 'P34', 'P36'],
  'TIM5_CHB': ['P01', 'P24', 'P26', 'P33', 'P35'],
  'TIM6_CHA': ['P02', 'P23', 'P27', 'P36'],
  'TIM6_CHB': ['P03', 'P32', 'P35'],
};
const ANALOG = { P24: 'AIN0', P26: 'AIN1', P32: 'AIN2', P33: 'AIN3', P34: 'AIN4', P35: 'AIN5', P01: 'AIN7', P02: 'AIN8' };
const RESERVED = ['P27', 'P31', 'P14', 'P00'];
const phases = [
  { name: 'A', hi: 'TIM4_CHA', lo: 'TIM4_CHB' },
  { name: 'B', hi: 'TIM5_CHA', lo: 'TIM5_CHB' },
  { name: 'C', hi: 'TIM6_CHA', lo: 'TIM6_CHB' },
];

const WANT_ANALOG = ['P24', 'P33', 'P02', 'P35', 'P01'];   // 现有分配

const sols = [];
function rec(i, used, assign) {
  if (i === phases.length) {
    const analogFree = Object.keys(ANALOG).filter(p => !used.has(p));
    if (analogFree.length < 5) return;
    /* 只要模拟脚覆盖现有这 5 个就算（允许多余的闲置） */
    if (!WANT_ANALOG.every(p => analogFree.includes(p))) return;
    sols.push({ assign: { ...assign }, analogFree });
    return;
  }
  const ph = phases[i];
  for (const hi of CH[ph.hi]) {
    if (used.has(hi) || RESERVED.includes(hi)) continue;
    for (const lo of CH[ph.lo]) {
      if (lo === hi || used.has(lo) || RESERVED.includes(lo)) continue;
      used.add(hi); used.add(lo);
      assign[ph.name] = { hi, lo };
      rec(i + 1, used, assign);
      delete assign[ph.name];
      used.delete(hi); used.delete(lo);
    }
  }
}
rec(0, new Set(), []);

console.log(`保持现有 5 路模拟脚不变的合法解: ${sols.length} 组\n`);
/* 排序：优先低边不用 P35（ISP 脚）、不用 P24（已是模拟）等 */
const score = (s) => {
  let sc = 0;
  for (const p of ['A', 'B', 'C']) if (s.assign[p].lo === 'P35') sc -= 50;
  if (s.analogFree.length === 5) sc += 10;    // 恰好用完，不留闲置
  return sc;
};
sols.sort((a, b) => score(b) - score(a));
sols.slice(0, 12).forEach((s, k) => {
  console.log(`#${k + 1} 得分 ${score(s)}`);
  for (const p of phases) {
    const v = s.assign[p.name];
    console.log(`   ${p.name}相: 高=${v.hi.padEnd(6)} 低=${v.lo}`);
  }
  console.log(`   模拟脚(${s.analogFree.length}): ${s.analogFree.map(p => `${p}(${ANALOG[p]})`).join('  ')}`);
  console.log('');
});

/* 关键：现有方案（A低=P34）在解集里吗？ */
const hasP34 = sols.some(s => Object.values(s.assign).some(v => v.hi === 'P34' || v.lo === 'P34'));
console.log(`现有方案中 A 相低边用 P34 —— 在合法解集中出现? ${hasP34 ? '是' : '否（确认非法）'}`);
