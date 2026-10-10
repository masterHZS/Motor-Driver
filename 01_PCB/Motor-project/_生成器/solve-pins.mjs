/**
 * PWM 引脚分配求解器
 * 约束（全部来自官方参考手册 Rev2.50 的 Pxx_SEL 寄存器位定义 + 数据手册 Rev3.00 引脚表）：
 *  1. 6 路 PWM 必须来自 3 颗 ADT 的 6 个通道，且**同一颗 ADT 不能给同一相的高/低边**
 *     （否则无法产生带死区的互补对），因此必须 **每颗 ADT 负责一相**（高=CHA、低=CHB）
 *  2. 模拟通道只能从 {AIN0=P24, AIN1=P26, AIN2=P32, AIN3=P33, AIN4=P34, AIN5=P35, AIN7=P01, AIN8=P02} 取
 *  3. 需要 4 路模拟：3 相电压 + 母线电流
 *  4. 必须保留：SWD = P27/P31、UART0_TXD = P14、复位 = P00
 *  用法：node _生成器\solve-pins.mjs
 */

/* 定时器通道 → 可选引脚（取自参考手册 Pxx_SEL 寄存器定义） */
const CH = {
  'TIM4_CHA': ['P23', 'P26', 'P34'],
  'TIM4_CHB': ['P15', 'P23', 'P24', 'P35'],
  'TIM5_CHA': ['P25', 'P27', 'P34', 'P36'],
  'TIM5_CHB': ['P01', 'P24', 'P26', 'P33', 'P35'],
  'TIM6_CHA': ['P02', 'P23', 'P27', 'P36'],
  'TIM6_CHB': ['P03', 'P32', 'P35'],
};

/* 模拟输入引脚（数据手册 §4：AIN 号 ↔ 引脚） */
const ANALOG = { P24: 'AIN0', P26: 'AIN1', P32: 'AIN2', P33: 'AIN3', P34: 'AIN4', P35: 'AIN5', P01: 'AIN7', P02: 'AIN8' };

const RESERVED = ['P27', 'P31', 'P14', 'P00'];   // SWD + UART + 复位，不可动
const phases = [
  { name: 'A', hi: 'TIM4_CHA', lo: 'TIM4_CHB' },
  { name: 'B', hi: 'TIM5_CHA', lo: 'TIM5_CHB' },
  { name: 'C', hi: 'TIM6_CHA', lo: 'TIM6_CHB' },
];

const solutions = [];
function rec(i, used, assign) {
  if (i === phases.length) {
    /* 🔴 关键约束（上一版漏了）：模拟引脚与 PWM 引脚**不能重叠**
     *  → 可用模拟脚 = 全部模拟脚 减去 已占用的 PWM 脚 */
    const analogFree = Object.keys(ANALOG).filter(p => !used.has(p));
    if (analogFree.length < 5) return;   // 需要 3 相电压 + 母线电流 + 母线电压
    solutions.push({ assign: { ...assign }, analogFree });
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

console.log(`找到 ${solutions.length} 组合法分配\n`);

/* 打分：优先让 4 路模拟落在「非 ISP/非晶振」脚上；其次优先 P24/P26/P34（高精度常用） */
const score = (s) => {
  const a = s.analogFree;
  let sc = 0;
  if (!a.includes('P35')) sc += 100;          // P35 是 ISP 脚，尽量不用
  if (!a.includes('P01')) sc += 20;           // P01 是 XTHI，留作晶振
  if (!a.includes('P02')) sc += 20;           // P02 是 XTHO
  sc += a.length * 2;
  return sc;
};
solutions.sort((x, y) => score(y) - score(x));

for (const [k, s] of solutions.entries()) {
  const a = s.analogFree;
  console.log(`#${k + 1} 得分 ${score(s)}`);
  for (const p of phases) console.log(`   ${p.name}相: 高=${s.assign[p.name].hi.padEnd(6)} 低=${s.assign[p.name].lo}`);
  console.log(`   可用模拟脚(${a.length}): ${a.map(p => `${p}(${ANALOG[p]})`).join('  ')}`);
  console.log('');
}
