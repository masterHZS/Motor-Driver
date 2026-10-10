/**
 * KiCad 8 原理图生成器
 *
 * 策略：所有符号旋转 0°；每个引脚向外拉一小段**水平**短线并挂「全局标签」。
 *       KiCad 按标签名合并网络 —— 连接由标签保证，不依赖长走线，
 *       因此不会出现"线没连上"的隐性错误，且版面紧凑可读。
 * 坐标变换：符号空间 +Y 向上，图纸空间 +Y 向下 → sheet = (X + px, Y − py)
 */
import { COMPONENTS, NETS, PIN_NAMES, PROJECT, NO_CONNECT } from './design.mjs';
import { PLACE, BLOCKS } from './layout.mjs';

let uuidSeq = 0;
const uuid = () => `a0000000-0000-4000-8000-${(++uuidSeq).toString(16).padStart(12, '0')}`;
const ROOT_UUID = 'a0000000-0000-4000-8000-000000000001';

/* ============================ 符号库 ============================ */
const G = (w = 0.254) => `(stroke (width ${w}) (type default)) (fill (type none))`;
const GF = (w = 0.254) => `(stroke (width ${w}) (type default)) (fill (type background))`;
const rect = (x1, y1, x2, y2, filled = false) =>
  `(rectangle (start ${x1} ${y1}) (end ${x2} ${y2}) ${filled ? GF() : G()})`;
const poly = (pts, w = 0.254) =>
  `(polyline (pts ${pts.map(([x, y]) => `(xy ${x} ${y})`).join(' ')}) ${G(w)})`;

const P2 = [
  { n: '1', x: 0, y: 3.81, a: 270, l: 1.27, t: 'passive' },
  { n: '2', x: 0, y: -3.81, a: 90, l: 1.27, t: 'passive' },
];
const P2S = { refAt: [-3.048, 1.016], valAt: [-3.048, -1.016], j: 'right' };

const SYMDEFS = {
  R: { pins: P2, gfx: [rect(-1.016, -2.54, 1.016, 2.54)], ...P2S },
  RSHUNT: { pins: P2, gfx: [rect(-1.27, -2.54, 1.27, 2.54)], refAt: [-3.302, 1.016], valAt: [-3.302, -1.016], j: 'right' },
  FUSE: { pins: P2, gfx: [rect(-1.016, -2.54, 1.016, 2.54), poly([[0, -2.54], [0, 2.54]], 0.508)], ...P2S },
  C: { pins: P2, gfx: [poly([[-1.524, 0.508], [1.524, 0.508]], 0.4064), poly([[-1.524, -0.508], [1.524, -0.508]], 0.4064)], ...P2S },
  CP: {
    pins: P2,
    gfx: [poly([[-1.524, 0.508], [1.524, 0.508]], 0.4064), poly([[-1.524, -0.508], [1.524, -0.508]], 0.4064),
          poly([[-1.778, 1.524], [-1.016, 1.524]]), poly([[-1.397, 1.143], [-1.397, 1.905]])],
    ...P2S,
  },
  L: { pins: P2, gfx: [poly([[0, 2.54], [0, -2.54]]), poly([[-1.27, 2.54], [1.27, 2.54]]), poly([[-1.27, -2.54], [1.27, -2.54]])], ...P2S },
  /* 二极管：1 脚 = 阴极(K，在上)，2 脚 = 阳极(A，在下)
     三角形尖端朝上指向阴极横杠 —— 与引脚编号一致，避免 PCB 贴反 */
  D: {
    pins: P2,
    gfx: [poly([[-1.27, -1.27], [1.27, -1.27], [0, 1.27], [-1.27, -1.27]]),
          poly([[-1.27, 1.27], [1.27, 1.27]]),
          poly([[0, 2.54], [0, 1.27]]), poly([[0, -2.54], [0, -1.27]])],
    ...P2S,
  },
  DSCH: {
    pins: P2,
    gfx: [poly([[-1.27, -1.27], [1.27, -1.27], [0, 1.27], [-1.27, -1.27]]),
          poly([[-1.27, 1.27], [1.27, 1.27]]),
          poly([[-1.27, 1.27], [-1.27, 0.635]]), poly([[-1.27, 0.635], [-0.762, 0.635]]),
          poly([[1.27, 1.27], [1.27, 1.905]]), poly([[1.27, 1.905], [0.762, 1.905]]),
          poly([[0, 2.54], [0, 1.27]]), poly([[0, -2.54], [0, -1.27]])],
    ...P2S,
  },
  DTVS: {
    pins: P2,
    gfx: [poly([[-1.27, -1.27], [1.27, -1.27], [0, 1.27], [-1.27, -1.27]]),
          poly([[-1.27, 1.27], [1.27, 1.27]]),
          poly([[-1.651, 0.635], [-1.27, 1.27]]), poly([[1.27, 1.27], [1.651, 1.905]]),
          poly([[0, 2.54], [0, 1.27]]), poly([[0, -2.54], [0, -1.27]])],
    ...P2S,
  },
  NMOS: {
    pins: [
      { n: '4', x: -6.35, y: 0, a: 0, l: 2.54, t: 'input' },
      ...[['1', 90], ['2', 90], ['3', 90], ['5', 270], ['6', 270], ['7', 270], ['8', 270], ['9', 270]]
        .map(([n, a]) => ({ n, x: 5.08, y: a === 90 ? -5.08 : 5.08, a, l: 2.54, t: 'passive' })),
    ],
    gfx: [rect(-3.81, -7.62, 2.54, 7.62)],
    refAt: [-3.81, 9.398], valAt: [-3.81, 11.303], j: 'left',
  },
  FD6288T: {
    pins: [
      ...['1', '2', '3', '4', '5', '6', '7', '8'].map((n, i) => ({ n, x: -12.7, y: 8.89 - i * 2.54, a: 0, l: 2.54, t: 'input' })),
      ...['9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'].map((n, i) => ({ n, x: 12.7, y: 13.97 - i * 2.54, a: 180, l: 2.54, t: 'output' })),
    ],
    gfx: [rect(-10.16, -16.51, 10.16, 16.51)],
    refAt: [-10.16, 18.288], valAt: [-10.16, 20.193], j: 'left',
  },
  XL7005A: {
    pins: [
      ...['1', '2', '3', '4'].map((n, i) => ({ n, x: -10.16, y: 3.81 - i * 2.54, a: 0, l: 2.54, t: 'passive' })),
      ...['5', '6', '7', '8', '9'].map((n, i) => ({ n, x: 10.16, y: 5.08 - i * 2.54, a: 180, l: 2.54, t: 'passive' })),
    ],
    gfx: [rect(-7.62, -7.62, 7.62, 7.62)],
    refAt: [-7.62, 9.398], valAt: [-7.62, 11.303], j: 'left',
  },
  /* LDO：1=VIN 2=VOUT 3=GND 4=VOUT（SOT-223 的 tab 也是 VOUT） */
  LDO: {
    pins: [
      { n: '1', x: -7.62, y: 2.54, a: 0, l: 2.54, t: 'power_in' },
      { n: '3', x: -7.62, y: -2.54, a: 0, l: 2.54, t: 'power_in' },
      { n: '2', x: 7.62, y: 2.54, a: 180, l: 2.54, t: 'power_out' },
      /* 4 脚 = SOT-223 的散热 tab，与 2 脚同一网络。若也标 power_out →
         ERC 报 pin_to_pin「两个 Power output 相连」，故标 passive */
      { n: '4', x: 7.62, y: -2.54, a: 180, l: 2.54, t: 'passive' },
    ],
    gfx: [rect(-5.08, -5.08, 5.08, 5.08)],
    refAt: [-5.08, 6.858], valAt: [-5.08, 8.763], j: 'left',
  },
  /* 电流检测放大器 INA181（SOT-23-6） */
  INA181: {
    pins: [
      { n: '1', x: -8.89, y: 2.54, a: 0, l: 2.54, t: 'input' },      // IN+
      { n: '2', x: -8.89, y: -2.54, a: 0, l: 2.54, t: 'input' },     // IN-
      { n: '3', x: 0, y: -8.89, a: 90, l: 2.54, t: 'input' },        // REF
      { n: '4', x: 0, y: 8.89, a: 270, l: 2.54, t: 'power_in' },     // GND
      { n: '5', x: 8.89, y: 0, a: 180, l: 2.54, t: 'output' },       // OUT
      { n: '6', x: -3.81, y: 8.89, a: 270, l: 2.54, t: 'power_in' }, // VS
    ],
    gfx: [rect(-6.35, -6.35, 6.35, 6.35)],
    refAt: [-6.35, 8.128], valAt: [-6.35, 10.033], j: 'left',
  },
  /* SWD 测试点：单引脚，无极性 */
  TP: {
    pins: [{ n: '1', x: 0, y: 2.54, a: 270, l: 2.54, t: 'passive' }],
    gfx: [rect(-0.762, -1.016, 0.762, 1.016)],
    refAt: [-2.032, 2.286], valAt: [-2.032, -2.286], j: 'left',
  },
  /* ERC 电源标志 PWR_FLAG：单脚 power_out，用来声明"该网络由板外供电"。
     位号以 # 开头（虚拟元件），无实物封装、不进 BOM。 */
  PWRFLAG: {
    pins: [{ n: '1', x: 0, y: 0, a: 90, l: 1.27, t: 'power_out' }],
    gfx: [poly([[0, 1.27], [0, 2.286]]),
          poly([[-1.016, 4.318], [1.016, 4.318], [0, 2.286], [-1.016, 4.318]])],
    refAt: [-1.524, -1.27], valAt: [-1.524, 5.588], j: 'left',
  },
  /* 主控 HC32F005C6PA（TSSOP-20，引脚号严格对应官方数据手册 §3 引脚配置） */
  MCU: {
    pins: [
      /* 左侧 1–10（自上而下） */
      ...Array.from({ length: 10 }, (_, i) => ({ n: String(i + 1), x: -15.24, y: 11.43 - i * 2.54, a: 0, l: 2.54, t: 'bidirectional' })),
      /* 右侧 11–20（自下而上，与官方引脚图一致） */
      ...Array.from({ length: 10 }, (_, i) => ({ n: String(i + 11), x: 15.24, y: -11.43 + i * 2.54, a: 180, l: 2.54, t: 'bidirectional' })),
    ],
    gfx: [rect(-12.7, -13.97, 12.7, 13.97)],
    refAt: [-12.7, 15.748], valAt: [-12.7, 17.653], j: 'left',
  },
};

/* ============================ 发射 ============================ */
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const r3 = (v) => Math.round(v * 1000) / 1000;
const out = [];
const w = (s = '') => out.push(s);

function pinPos(ref, pin) {
  const c = COMPONENTS.find(x => x.ref === ref);
  const pd = SYMDEFS[c.sym].pins.find(p => p.n === pin);
  if (!pd) throw new Error(`符号 ${c.sym} 没有引脚 ${pin}`);
  const p = PLACE[ref];
  return { x: p.x + pd.x, y: p.y - pd.y, a: pd.a, sx: pd.x };
}

w(`(kicad_sch`);
w(`  (version 20231120)`);
w(`  (generator "mdrive-gen")`);
w(`  (generator_version "8.0")`);
w(`  (uuid "${ROOT_UUID}")`);
w(`  (paper "A2")`);
w(`  (title_block`);
w(`    (title "${esc(PROJECT.title)}")`);
w(`    (date "${PROJECT.date}")`);
w(`    (rev "${PROJECT.rev}")`);
w(`    (comment 1 "母线 9.0-16.8V(3-4S LiPo) / 无感六步换向 / 反电动势过零检测由片上 HC32F005 的 ADC 完成")`);
w(`    (comment 2 "★HC32F005C6PA 片上主控：TIM4/5/6 各一对硬件互补 PWM+硬件死区，直接驱动 FD6288T")`);
w(`    (comment 3 "PGND 与 AGND 经 R47(0R) 单点星接；ISP(P35/P36) 已占用，必须用 SWD 烧录")`);
w(`    (comment 4 "过流保护：软件限流(ADC 每 PWM 周期) + FD6288T 自带 SCP；无 VC 硬件刹车（引脚不足）")`);
w(`  )`);

const refPrefixFor = (name) => {
  const c = COMPONENTS.find(x => x.sym === name);
  return c ? c.ref.replace(/[0-9]+$/, '') : 'U';
};
w(`  (lib_symbols`);
for (const [name, sd] of Object.entries(SYMDEFS)) {
  w(`    (symbol "mdrive:${name}"`);
  w(`      (pin_names (offset 0.762))`);
  w(`      (exclude_from_sim no) (in_bom yes) (on_board yes)`);
  w(`      (property "Reference" "${refPrefixFor(name)}" (at ${sd.refAt[0]} ${sd.refAt[1]} 0) (effects (font (size 1.27 1.27)) (justify ${sd.j})))`);
  w(`      (property "Value" "${name}" (at ${sd.valAt[0]} ${sd.valAt[1]} 0) (effects (font (size 1.27 1.27)) (justify ${sd.j})))`);
  w(`      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))`);
  w(`      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))`);
  w(`      (symbol "${name}_0_1"`);
  for (const g of sd.gfx) w(`        ${g}`);
  w(`      )`);
  w(`      (symbol "${name}_1_1"`);
  for (const p of sd.pins) {
    const nm = PIN_NAMES[name]?.[p.n] ?? (name === 'FD6288T' ? p.n : '~');
    w(`        (pin ${p.t} line (at ${p.x} ${p.y} ${p.a}) (length ${p.l})`);
    w(`          (name "${esc(nm)}" (effects (font (size 1.016 1.016))))`);
    w(`          (number "${p.n}" (effects (font (size 1.016 1.016)))))`);
  }
  w(`      )`);
  w(`    )`);
}
w(`  )`);

/* 功能块边框 + 标题 + 说明文字（先画，处于底层） */
for (const b of BLOCKS) {
  const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]];
  w(`  (polyline (pts ${pts.map(([x, y]) => `(xy ${x} ${y})`).join(' ')}) (stroke (width 0.3) (type dash)) (uuid "${uuid()}"))`);
  w(`  (text "${esc(b.title)}" (at ${b.x} ${b.y - 1.6} 0) (effects (font (size 2.2 2.2) bold) (justify left bottom)) (uuid "${uuid()}"))`);
  (b.note ?? []).forEach((line, i) => {
    if (line === '') return;
    w(`  (text "${esc(line)}" (at ${b.x + 4} ${b.y + 9 + i * 4.4} 0) (effects (font (size 1.6 1.6)) (justify left)) (uuid "${uuid()}"))`);
  });
}

/* 元件实例 */
const PROJ = 'motor-driver';
for (const c of COMPONENTS) {
  const p = PLACE[c.ref];
  const sd = SYMDEFS[c.sym];
  w(`  (symbol (lib_id "mdrive:${c.sym}") (at ${p.x} ${p.y} 0) (unit 1)`);
  w(`    (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)`);
  w(`    (uuid "${uuid()}")`);
  w(`    (property "Reference" "${c.ref}" (at ${r3(p.x + sd.refAt[0])} ${r3(p.y - sd.refAt[1])} 0) (effects (font (size 1.27 1.27)) (justify ${sd.j})))`);
  w(`    (property "Value" "${esc(c.val)}" (at ${r3(p.x + sd.valAt[0])} ${r3(p.y - sd.valAt[1])} 0) (effects (font (size 1.27 1.27)) (justify ${sd.j})))`);
  w(`    (property "Footprint" "${esc(c.fp)}" (at ${p.x} ${p.y} 0) (effects (font (size 1.27 1.27)) hide))`);
  w(`    (property "Datasheet" "" (at ${p.x} ${p.y} 0) (effects (font (size 1.27 1.27)) hide))`);
  const seen = new Set();
  for (const pd of sd.pins) { if (seen.has(pd.n)) continue; seen.add(pd.n); w(`    (pin "${pd.n}" (uuid "${uuid()}"))`); }
  w(`    (instances (project "${PROJ}" (path "/${ROOT_UUID}" (reference "${c.ref}") (unit 1))))`);
  w(`  )`);
}

/* 引脚 → 水平短线 + 全局标签 */
const pinNet = new Map();
for (const [net, members] of Object.entries(NETS)) for (const m of members) pinNet.set(m, net);

const STUB = 5.08;
let wireCount = 0, labelCount = 0;
const ncSetWire = new Set(NO_CONNECT);

for (const c of COMPONENTS) {
  const sd = SYMDEFS[c.sym];
  const groups = new Map();
  for (const pd of sd.pins) {
    const k = `${pd.x},${pd.y},${pd.a}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(pd);
  }
  for (const [, grp] of groups) {
    /* 未使用引脚（no-connect）不拉线、不挂标签 */
    if (grp.every(pd => ncSetWire.has(`${c.ref}.${pd.n}`))) continue;
    const nets = new Set(grp.map(pd => pinNet.get(`${c.ref}.${pd.n}`)));
    if (nets.size !== 1) throw new Error(`${c.ref} 同坐标引脚却属不同网络: ${[...nets].join(',')}`);
    const net = [...nets][0];
    const pp = pinPos(c.ref, grp[0].n);

    let dx, labelAngle;
    if (pp.a === 0) { dx = -STUB; labelAngle = 180; }
    else if (pp.a === 180) { dx = STUB; labelAngle = 0; }
    else if (pp.sx >= 0) { dx = STUB; labelAngle = 0; }
    else { dx = -STUB; labelAngle = 180; }

    const x1 = r3(pp.x), y1 = r3(pp.y);
    const x2 = r3(pp.x + dx), y2 = y1;
    w(`  (wire (pts (xy ${x1} ${y1}) (xy ${x2} ${y2})) (stroke (width 0) (type default)) (uuid "${uuid()}"))`);
    wireCount++;
    w(`  (global_label "${esc(net)}" (shape passive) (at ${x2} ${y2} ${labelAngle}) (fields_autoplaced yes)`);
    w(`    (effects (font (size 1.27 1.27)) (justify ${labelAngle === 180 ? 'right' : 'left'})) (uuid "${uuid()}"))`);
    labelCount++;
  }
}

/* 未使用引脚：no-connect 标记（必须在 kicad_sch 闭合之前发出） */
let ncCount = 0;
for (const k of NO_CONNECT) {
  const i = k.lastIndexOf('.');
  const c = COMPONENTS.find(x => x.ref === k.slice(0, i));
  if (!c) throw new Error(`NO_CONNECT 位号不存在: ${k}`);
  const pp = pinPos(c.ref, k.slice(i + 1));
  w(`  (no_connect (at ${r3(pp.x)} ${r3(pp.y)}) (uuid "${uuid()}"))`);
  ncCount++;
}

w(`  (sheet_instances (path "/" (page "1")))`);
w(`)`);

const designNets = new Set(Object.keys(NETS));
const ncSetEmit = new Set(NO_CONNECT);
for (const c of COMPONENTS)
  for (const pd of SYMDEFS[c.sym].pins) {
    const k = `${c.ref}.${pd.n}`;
    if (ncSetEmit.has(k)) continue;              // 未使用引脚：靠 no_connect 标记
    if (!designNets.has(pinNet.get(k)))
      throw new Error(`网络名不在设计中: ${k}`);
  }

export const kicadText = out.join('\n') + '\n';
export const stats = { components: COMPONENTS.length, wires: wireCount, labels: labelCount, nets: designNets.size, blocks: BLOCKS.length, noConnect: ncCount };
