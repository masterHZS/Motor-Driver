/**
 * 电气设计自检（不依赖符号/版面定义）
 * 校验：位号唯一、每个引脚恰好属于一个网络、网络成员格式合法、接口网络标记正确。
 * 用法：node _生成器\check-design.mjs
 */
import { COMPONENTS, NETS, SYMBOL_PINS, INTERFACE_NETS, PIN_NAMES, NO_CONNECT,
         JLC_FOOTPRINTS, JLC_NAME_RE, LCSC } from './design.mjs';

let bad = 0;
const fail = (m) => { console.log(`  ✗ ${m}`); bad++; };

/* ---- 1) 位号唯一 ---- */
const refs = new Set();
for (const c of COMPONENTS) {
  if (refs.has(c.ref)) fail(`位号重复: ${c.ref}`);
  refs.add(c.ref);
}
console.log(`元件数: ${COMPONENTS.length}，唯一位号: ${refs.size}`);

/* ---- 2) 符号必须有引脚表 ---- */
/* 位号以 # 开头 = KiCad 惯例的虚拟元件（PWR_FLAG 等）：不要求实物封装，也不进 BOM */
const isVirtual = (ref) => ref.startsWith('#');
const byRef = new Map(COMPONENTS.map(c => [c.ref, c]));
for (const c of COMPONENTS) {
  if (!SYMBOL_PINS[c.sym]) fail(`符号 ${c.sym} 没有 SYMBOL_PINS 定义（${c.ref}）`);
  if (!c.fp && !isVirtual(c.ref)) fail(`${c.ref} 缺封装`);
  if (!c.val) fail(`${c.ref} 缺参数值`);
}

/* ---- 3) 网络成员 → 建立 引脚→网络 映射 ---- */
const pinNet = new Map();
let pinTotal = 0;
for (const [net, members] of Object.entries(NETS)) {
  if (!members.length) fail(`网络 ${net} 为空`);
  for (const m of members) {
    const i = m.lastIndexOf('.');
    if (i < 0) { fail(`网络 ${net} 的成员 "${m}" 格式不合法（应为 位号.引脚）`); continue; }
    const ref = m.slice(0, i), pin = m.slice(i + 1);
    const c = byRef.get(ref);
    if (!c) { fail(`网络 ${net} 引用了不存在的位号 ${ref}`); continue; }
    const pins = SYMBOL_PINS[c.sym];
    if (!pins.includes(pin)) { fail(`网络 ${net}: ${ref}(${c.sym}) 没有引脚 ${pin}`); continue; }
    if (pinNet.has(m)) fail(`${m} 同时出现在 ${pinNet.get(m)} 和 ${net}`);
    else pinNet.set(m, net);
  }
}

/* ---- 4) 每个元件的每个引脚必须被覆盖（NO_CONNECT 里的除外） ---- */
const ncSet = new Set(NO_CONNECT);
for (const c of COMPONENTS) {
  for (const pin of SYMBOL_PINS[c.sym]) {
    const k = `${c.ref}.${pin}`;
    if (ncSet.has(k)) continue;
    if (!pinNet.has(k)) fail(`引脚未连: ${k}（${c.desc}）`);
  }
}
pinTotal = [...byRef.values()].reduce((s, c) => s + SYMBOL_PINS[c.sym].length, 0);
console.log(`网络数: ${Object.keys(NETS).length}，引脚总数: ${pinTotal}，已连: ${pinNet.size}，no-connect: ${ncSet.size}`);

/* ---- 4b) NO_CONNECT 的引脚不应出现在任何网络里 ---- */
for (const k of ncSet) {
  if (pinNet.has(k)) fail(`no-connect 引脚 ${k} 却出现在网络 ${pinNet.get(k)}`);
  const i = k.lastIndexOf('.');
  const c = byRef.get(k.slice(0, i));
  if (!c) fail(`NO_CONNECT 引用了不存在的位号 ${k}`);
  else if (!SYMBOL_PINS[c.sym].includes(k.slice(i + 1))) fail(`NO_CONNECT 的 ${k} 不是 ${c.sym} 的引脚`);
}

/* ---- 5) 接口网络：单成员网络必须在 INTERFACE_NETS 里 ---- */
for (const [net, members] of Object.entries(NETS)) {
  if (members.length === 1 && !(net in INTERFACE_NETS)) {
    fail(`网络 ${net} 只有 1 个成员 ${members[0]}，但未登记为对外接口`);
  }
  if (members.length > 1 && net in INTERFACE_NETS) {
    console.log(`  · 提示: 接口网络 ${net} 有 ${members.length} 个成员（非悬空，已连到板上器件）`);
  }
}
for (const net of Object.keys(INTERFACE_NETS)) {
  if (!(net in NETS)) fail(`INTERFACE_NETS 里的 ${net} 不在 NETS 中`);
}

/* ---- 6) 引脚名完整性（画图用） ---- */
for (const [sym, pins] of Object.entries(SYMBOL_PINS)) {
  const names = PIN_NAMES[sym];
  if (!names) { console.log(`  · ${sym} 无引脚名（画图显示 "~"）`); continue; }
  for (const p of pins) if (!(p in names)) fail(`符号 ${sym} 的引脚 ${p} 缺名字`);
}

/* ---- 7) MCU 引脚对照（硬编码核对，防抄错） ---- */
const MCU_EXPECT = {
  1: 'P34/AIN4', 2: 'P35', 3: 'P36', 4: 'RESETB', 5: 'P01/AIN7', 6: 'P02/AIN8',
  7: 'DVSS', 8: 'VCAP', 9: 'DVCC', 10: 'P03',
  11: 'P15/TIM4_CHB', 12: 'P14', 13: 'P23', 14: 'P24/AIN0', 15: 'P25',
  16: 'P26/AIN1', 17: 'P27/SWDIO', 18: 'P31/SWCLK', 19: 'P32/AIN2', 20: 'P33/AIN3',
};
for (const [p, n] of Object.entries(MCU_EXPECT)) {
  if (PIN_NAMES.MCU[p] !== n) fail(`MCU 引脚 ${p} 名字应为 ${n}，实为 ${PIN_NAMES.MCU[p]}`);
}

/* ---- 8) PWM 引脚 ↔ 定时器通道一致性 ----
 * ⚠️ 本表**逐条取自官方参考手册 Rev2.50 的 Pxx_SEL 寄存器位定义**（不是推断、不是对称性猜测）。
 *    ★ 2026-09-14 勘误：旧表把 P34 写成 `{ TIM4_CHB: 3 }` —— **P34 根本没有 TIM4_CHB**：
 *      §6.5.4.4 P34_SEL 只有 011=TIM5_CHA、101=TIM4_CHA（其余为 GPIO/PCA/Reserved/TIM0_EXT/TIM1_TOG）。
 *      正因为这张校验表本身是错的，它才会为「A 相低边用 P34」打印出「三相互补对 ✓」的**假阳性**。
 *    ⇒ 教训：**校验表也必须来自数据手册原文**，不能与设计共用同一个想当然的假设。
 *      交叉核对工具见 `03_审核/_afparse.mjs`（从参考手册文本按列位解析出完整 AF 表）。 */
const AF_TABLE = {
  P23: { TIM4_CHA: 3, TIM4_CHB: 2, TIM6_CHA: 1 },  // §P23_SEL: 001=TIM6_CHA 010=TIM4_CHB 011=TIM4_CHA
  P15: { TIM4_CHB: 3 },                            // §P15_SEL: 011=TIM4_CHB
  P34: { TIM5_CHA: 3, TIM4_CHA: 5 },               // §P34_SEL: 011=TIM5_CHA 101=TIM4_CHA（★无 TIM4_CHB）
  P25: { TIM5_CHA: 3 },                            // §P25_SEL: 011=TIM5_CHA
  P26: { TIM5_CHB: 3, TIM4_CHA: 2 },               // §P26_SEL: 010=TIM4_CHA 011=TIM5_CHB
  P36: { TIM6_CHA: 2, TIM5_CHA: 5 },               // §P36_SEL: 010=TIM6_CHA 101=TIM5_CHA
  P32: { TIM6_CHB: 3 },                            // §P32_SEL: 011=TIM6_CHB
  P14: { UART0_TXD: 6 },                           // §P14_SEL: 110=UART0_TXD
};
/* 模拟通道：走 PxADS 寄存器，不用 SEL 档位 */
const ANALOG_TABLE = {
  P24: { ch: 'AIN0', reg: 'P2ADS bit4' }, P26: { ch: 'AIN1', reg: 'P2ADS bit6' },
  P32: { ch: 'AIN2', reg: 'P3ADS bit2' }, P33: { ch: 'AIN3', reg: 'P3ADS bit3' },
  P34: { ch: 'AIN4', reg: 'P3ADS bit4' }, P35: { ch: 'AIN5', reg: 'P3ADS bit5' },
  P01: { ch: 'AIN7', reg: 'P0ADS bit1' }, P02: { ch: 'AIN8', reg: 'P0ADS bit2' },
};
const PIN_OF_MCU_PIN = { 13: 'P23', 11: 'P15', 15: 'P25', 16: 'P26', 3: 'P36', 19: 'P32', 12: 'P14',
                         14: 'P24', 20: 'P33', 6: 'P02', 2: 'P35', 5: 'P01' };
const PWM_EXPECT = {
  PWM_AH: ['U5.13', 'P23', 'TIM4_CHA'], PWM_AL: ['U5.11', 'P15', 'TIM4_CHB'],
  PWM_BH: ['U5.15', 'P25', 'TIM5_CHA'], PWM_BL: ['U5.16', 'P26', 'TIM5_CHB'],
  PWM_CH: ['U5.3', 'P36', 'TIM6_CHA'], PWM_CL: ['U5.19', 'P32', 'TIM6_CHB'],
};
for (const [net, [pinRef, pin, fn]] of Object.entries(PWM_EXPECT)) {
  if (!(NETS[net] ?? []).includes(pinRef)) fail(`${net} 应包含 ${pinRef}（MCU ${pin}）`);
  const af = AF_TABLE[pin]?.[fn];
  if (af === undefined) fail(`✗ ${pin} 不支持 ${fn}（AF 表里没有）—— 该引脚不能用于 ${net}`);
  else console.log(`  · ${net.padEnd(8)} MCU ${pin} = ${fn} @SEL${af}`);
}
if (!(NETS.UART_TX ?? []).includes('U5.12')) fail('UART_TX 应接 U5.12（P14）');

/* ---- 8b) 反向唯一性：每颗 ADT 的 CHA/CHB 各只能出现一次 ----
 * 防止「同一个通道号被赋给两个引脚」或「某脚被当成它并不具备的通道」这类错误。 */
{
  const seen = new Map();   // "TIM4_CHA" -> 引脚
  for (const [net, [, pin, fn]] of Object.entries(PWM_EXPECT)) {
    if (seen.has(fn)) fail(`${fn} 被 ${seen.get(fn)} 与 ${pin} 同时占用（${net}）`);
    seen.set(fn, pin);
  }
  /* 每个定时器必须恰好一对 CHA+CHB */
  for (const t of ['TIM4', 'TIM5', 'TIM6']) {
    if (!seen.has(`${t}_CHA`) || !seen.has(`${t}_CHB`))
      fail(`${t} 的互补对不完整：CHA=${seen.get(`${t}_CHA`) ?? '缺'} / CHB=${seen.get(`${t}_CHB`) ?? '缺'}`);
  }
}

/* ---- 9) 每相 PWM 必须来自同一颗 ADT（才能用硬件互补 + 硬件死区） ---- */
const TIMER_OF = { PWM_AH: 'TIM4', PWM_AL: 'TIM4', PWM_BH: 'TIM5', PWM_BL: 'TIM5', PWM_CH: 'TIM6', PWM_CL: 'TIM6' };
for (const [n, t] of Object.entries(TIMER_OF)) {
  const comp = n.endsWith('H') ? n.slice(0, -1) + 'L' : n.slice(0, -1) + 'H';
  if (TIMER_OF[comp] !== t) fail(`${n} 与互补通道不在同一颗定时器（${t} vs ${TIMER_OF[comp]}）→ 无法用硬件死区`);
}
console.log('  · 三相互补对：A=TIM4(P23/P15)  B=TIM5(P25/P26)  C=TIM6(P36/P32)  ✓ 各为硬件互补对');

/* ---- 9b) 模拟通道分配核对 + PWM/模拟不得抢同一脚 ---- */
/* ★ 可用模拟脚 5 个（PWM/预留占用其余模拟脚） */
const ANALOG_EXPECT = { AIN_A: 14, AIN_B: 20, AIN_C: 6, AIN_ISENSE: 2, AIN_VBUS: 5 };
const analogUse = new Set();
for (const [net, mcupin] of Object.entries(ANALOG_EXPECT)) {
  const ref = `U5.${mcupin}`, p = PIN_OF_MCU_PIN[mcupin];
  if (!(NETS[net] ?? []).includes(ref)) fail(`${net} 应接 ${ref}（MCU ${p}）`);
  const a = ANALOG_TABLE[p];
  if (!a) fail(`模拟表缺 ${p}`);
  else console.log(`  · ${net.padEnd(10)} MCU ${p} = ${a.ch}（${a.reg}）`);
  if (analogUse.has(p)) fail(`模拟引脚 ${p} 被两个信号共用`);
  analogUse.add(p);
}
for (const [net, [, p]] of Object.entries(PWM_EXPECT)) {
  if (analogUse.has(p)) fail(`引脚 ${p} 同时被 ${net}（PWM）与模拟信号占用`);
}
console.log('  · PWM 引脚与模拟引脚无重叠 ✓');

/* ---- 10) GPIO 使用统计：每个引脚必须「已连接」或「标 no-connect」 ---- */
const mcuNets = new Map();
for (const [net, members] of Object.entries(NETS))
  for (const m of members) if (m.startsWith('U5.')) mcuNets.set(m, net);
const gpioPins = ['1', '2', '3', '4', '5', '6', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
const ncPins = new Set(NO_CONNECT.map(k => k.split('.')[1]));
const unused = gpioPins.filter(p => !mcuNets.has(`U5.${p}`) && !ncPins.has(p));
console.log(`  · MCU 已连网络 ${mcuNets.size} 个引脚；no-connect ${ncPins.size} 个；未处理 ${unused.length} 个`);
if (unused.length) fail(`MCU 引脚既未连接也未标 no-connect: ${unused.map(p => `U5.${p}(${PIN_NAMES.MCU[p]})`).join(', ')}`);

/* ---- 11) 规范 R0：封装必须来自嘉立创官方库 ----
 * 「所有元器件的封装必须使用嘉立创官方库中已存在的封装」——见 01_工程/器件选型规范.md R0
 * 硬拦截 = 白名单（阻住未审封装）；语法只做体检告警（真实库命名变体多，硬卡会假失败）。 */
let fpBad = 0, fpOdd = 0;
for (const c of COMPONENTS) {
  if (isVirtual(c.ref)) continue;          /* PWR_FLAG 等虚拟元件不参与封装准入 */
  if (!(c.fp in JLC_FOOTPRINTS)) {
    fail(`R0: ${c.ref} 的封装 "${c.fp}" 不在立创封装白名单 → 须先在立创库用 LCSC 料号确认真实封装名，再登记白名单`);
    fpBad++;
  } else if (!JLC_NAME_RE.test(c.fp)) {
    console.log(`  ! 体检: ${c.ref} 的封装 "${c.fp}" 含可疑字符`);
    fpOdd++;
  }
}
const unusedFp = Object.keys(JLC_FOOTPRINTS).filter(f => !COMPONENTS.some(c => c.fp === f));
console.log(`  · R0 封装准入: ${COMPONENTS.length} 个元件的封装全部命中白名单（白名单 ${Object.keys(JLC_FOOTPRINTS).length} 种，告警 ${fpOdd} 条）${fpBad ? '' : ' ✓'}`);
if (unusedFp.length) console.log(`  · 提示: 白名单中未被使用: ${unusedFp.join(', ')}`);

/* ---- 12) 规范 R0.2 / R3：LCSC 料号绑定进度 ----
 * ⚠️ 虚拟元件（位号以 # 开头，如 PWR_FLAG）**不需要货号/封装、不进 BOM**，
 *    不能算进绑定进度 —— 早期版本把它们算成"待绑定"，看起来像漏绑了 2 个元件。 */
let lcscOk = 0, lcscBad = 0;
const realComps = COMPONENTS.filter(c => !isVirtual(c.ref));
for (const c of realComps) {
  const n = LCSC[c.ref];
  if (!n) continue;
  if (!/^C\d{4,}$/.test(n)) { fail(`R3: ${c.ref} 的 LCSC 料号 "${n}" 格式不合法（应为 C+数字）`); lcscBad++; }
  else lcscOk++;
}
const lcscMissList = realComps.filter(c => !LCSC[c.ref]).map(c => c.ref);
console.log(`  · R0.2 LCSC 绑定: ${lcscOk}/${realComps.length} 已绑定` +
  (lcscMissList.length ? `，待绑定: ${lcscMissList.join(', ')}` : ' ✓ 全部完成'));
console.log(`  · 虚拟元件（PWR_FLAG）×${COMPONENTS.length - realComps.length}：不需货号/封装、不进 BOM ✓`);


console.log('');
if (bad) { console.log(`✗ 电气自检失败：${bad} 处问题`); process.exit(1); }
console.log('✓ 电气自检通过：位号唯一 / 引脚全覆盖 / 无重复占用 / 接口网络登记正确');

const stat = {};
for (const c of COMPONENTS) stat[c.sym] = (stat[c.sym] ?? 0) + 1;
console.log('');
console.log('按符号统计:', Object.entries(stat).map(([k, v]) => `${k}×${v}`).join('  '));
