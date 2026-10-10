/**
 * 符号库（SYMDEFS）+ 引脚定位 —— kicad.mjs / render.mjs / 布线体检共用。
 * 坐标变换：符号空间 +Y 向上，图纸空间 +Y 向下 → sheet = (X + px, Y − py)
 */
import { COMPONENTS, PIN_NAMES } from './design.mjs';
import { PLACE } from './layout.mjs';

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

export const SYMDEFS = {
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
  /* NMOS：引脚刻意分三侧、彼此拉开距离，使「栅极串阻 + G-S 下拉 +
     源极星点 + 漏极母线」四类正交走线在平面上互不重叠：
       栅极 G(4)      = (-6.35, +12.70) 朝左
       源极 S(1/2/3)  = (-10.16, -2.54/-5.08/-7.62) 朝左
       漏极 D(5..9)   = (+5.08, +2.54/+7.62/+12.70) 朝右
     栅极族走线只在 y>+8；源极族在 y<-1；漏极族在 x>+5 → 三族区域不重叠。 */
  NMOS: {
    pins: [
      { n: '4', x: -6.35, y: 12.70, a: 0, l: 2.54, t: 'input' },
      { n: '1', x: -10.16, y: -2.54, a: 0, l: 2.54, t: 'passive' },
      { n: '2', x: -10.16, y: -5.08, a: 0, l: 2.54, t: 'passive' },
      { n: '3', x: -10.16, y: -7.62, a: 0, l: 2.54, t: 'passive' },
      { n: '5', x: 5.08, y: 2.54, a: 180, l: 2.54, t: 'passive' },
      { n: '6', x: 5.08, y: 7.62, a: 180, l: 2.54, t: 'passive' },
      { n: '7', x: 5.08, y: 12.70, a: 180, l: 2.54, t: 'passive' },
      { n: '8', x: 5.08, y: 12.70, a: 180, l: 2.54, t: 'passive' },
      { n: '9', x: 5.08, y: 12.70, a: 180, l: 2.54, t: 'passive' },
    ],
    gfx: [rect(-1.27, -7.62, 0, 2.54)],
    refAt: [-1.27, 9.398], valAt: [-1.27, 11.303], j: 'left',
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

/* ============================ 引脚定位 ============================ */
const REF = new Map(COMPONENTS.map((c) => [c.ref, c]));
const r2 = (v) => Math.round(v * 100) / 100;

/** 单个引脚绝对坐标（含朝向 a 与符号内 x 偏移 sx） */
export function pinPos(ref, pin) {
  const c = REF.get(ref);
  if (!c) throw new Error(`位号不存在: ${ref}`);
  const pd = SYMDEFS[c.sym].pins.find((p) => p.n === pin);
  if (!pd) throw new Error(`符号 ${c.sym} 没有引脚 ${pin}`);
  const p = PLACE[ref];
  return { x: r2(p.x + pd.x), y: r2(p.y - pd.y), a: pd.a, sx: pd.x };
}

/** 同一坐标的引脚合并成组（MOSFET 的 D/S 堆叠脚） */
export function pinGroupsOf(ref) {
  const c = REF.get(ref);
  const m = new Map();
  for (const pd of SYMDEFS[c.sym].pins) {
    const k = `${pd.x},${pd.y},${pd.a}`;
    if (!m.has(k)) m.set(k, { x: pd.x, y: pd.y, a: pd.a, sx: pd.x, pins: [] });
    m.get(k).pins.push(pd.n);
  }
  return [...m.values()].map((g) => {
    const p = PLACE[ref];
    return { ...g, x: r2(p.x + g.x), y: r2(p.y - g.y) };
  });
}

/** 元件图形本体包围盒（图纸坐标，供走线避让检查用） */
export function bodyBoxes() {
  const boxes = [];
  for (const c of COMPONENTS) {
    const sd = SYMDEFS[c.sym];
    const p = PLACE[c.ref];
    const xs = [], ys = [];
    for (const g of sd.gfx) {
      for (const m of g.matchAll(/\(xy (-?[\d.]+) (-?[\d.]+)\)/g)) { xs.push(+m[1]); ys.push(+m[2]); }
      const r = g.match(/\(rectangle \(start (-?[\d.]+) (-?[\d.]+)\) \(end (-?[\d.]+) (-?[\d.]+)\)/);
      if (r) { xs.push(+r[1], +r[3]); ys.push(+r[2], +r[4]); }
    }
    if (!xs.length) continue;
    boxes.push({
      ref: c.ref,
      x1: r2(p.x + Math.min(...xs)), x2: r2(p.x + Math.max(...xs)),
      y1: r2(p.y - Math.max(...ys)), y2: r2(p.y - Math.min(...ys)),
    });
  }
  return boxes;
}

export const symbolOf = (ref) => REF.get(ref)?.sym;
export const pinNameOf = (sym, n) => PIN_NAMES[sym]?.[n] ?? (sym === 'FD6288T' ? n : '~');
export const refPrefixFor = (name) => {
  const c = COMPONENTS.find((x) => x.sym === name);
  return c ? c.ref.replace(/[0-9]+$/, '') : 'U';
};
