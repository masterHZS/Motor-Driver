/**
 * 显式走线表（wires.mjs）
 *
 * 为什么需要它：router.mjs 的自动布线是「把同一网络的全部引脚连起来」。
 * 但 MOSFET 模块里的 PH_A / LS_STAR / VCC_BUS 这些网络**同时跨多个模块**，
 * 自动布线会在整块里拉横穿长线。这里手工给出每个 MOSFET 模块内部的
 * 走线 + 引出标签（相对模块锚点的局部坐标，+y 向上），
 * 由 router.mjs 合并进最终走线表。
 *
 * 模块锚点 = 该模块 NMOS 的中心（图纸坐标）。
 * NMOS 引脚（symdefs.mjs）：
 *   栅极 脚4     = (-6.35, +16.51) 朝左
 *   源极 脚1/2/3 = (+7.62, +2.54/+7.62/+12.70) 朝右
 *   漏极 脚5..9  = (+20.32, +2.54/+7.62/+12.70) 朝右
 * R_G  中心 (-33.02, +11.43)：pin1(-33.02,+15.24) pin2(-33.02,+7.62)
 * R_GS 中心 (-22.86, +22.86)：pin1(-22.86,+26.67) pin2(-22.86,+19.05)
 */
import { PLACE } from './layout.mjs';

/* 每个 MOSFET 模块（高边/低边各一份）的局部走线 */
export const NMOS_TEMPLATE = {
  wires: [
    [[-6.35, 16.51], [-19.05, 16.51]],       // U.4 → 栅极排（到 R_GS 竖直引线处）
    [[-19.05, 16.51], [-19.05, 26.67]],      // 上引到 R_GS.pin1 排
    [[-19.05, 26.67], [-22.86, 26.67]],      // → R_GS.pin1
    [[-24.13, 16.51], [-33.02, 16.51]],      // R_G.pin2 横拉（与上一段不共线重叠）
    [[-33.02, 7.62], [-33.02, 16.51]],       // R_G.pin2 → 上引
    [[-22.86, 19.05], [-22.86, 2.54]],       // R_GS.pin2 下引
    [[-22.86, 2.54], [7.62, 2.54]],          // → 源极干线
    [[7.62, 2.54], [7.62, 12.70]],           // 源极干线
    [[20.32, 2.54], [20.32, 12.70]],         // 漏极干线
  ],
  /* 引出标签：{ net 槽位, 起点(局部), 标签点(局部), 角度 } */
  stubs: [
    { slot: 'G', from: [-33.02, 16.51], at: [-38.10, 16.51], a: 180 },
    { slot: 'S', from: [7.62, 12.70], at: [50.80, 12.70], a: 0 },
    { slot: 'D', from: [20.32, 2.54], at: [50.80, 2.54], a: 0 },
  ],
};

/**
 * 生成显式走线 + 标签（**图纸绝对坐标**）。
 * @param {object} mods  { phase: { hi:{anchor:'Q2',G:'G_H_A',D:'VCC_BUS',S:'PH_A'},
 *                                 lo:{anchor:'Q1',G:'G_L_A',D:'D_LO_A',S:'LS_STAR_A'} } }
 */
export function buildExplicit(mods) {
  const wires = [], labels = [];
  const A = (ref) => PLACE[ref];
  const toSheet = (O, p) => ({ x: Math.round((O.x + p[0]) * 100) / 100, y: Math.round((O.y - p[1]) * 100) / 100 });
  /* 每个模块的标签引线方向各不相同：同一相对坐标会落到同一图纸坐标，
     因此用 (ph,side) 给引线一个**独立的水平偏移**，保证坐标唯一。 */
  const SLOT_DX = { G: [-38.10, -45.72], S: [50.80, 58.42], D: [50.80, 58.42] };

  let seq = 0;
  for (const ph of Object.keys(mods)) {
    for (const side of ['hi', 'lo']) {
      const m = mods[ph][side];
      if (!m) continue;
      const O = A(m.anchor);
      for (const w of NMOS_TEMPLATE.wires) {
        const a = toSheet(O, w[0]), b = toSheet(O, w[1]);
        wires.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
      for (const s of NMOS_TEMPLATE.stubs) {
        const net = m[s.slot];
        if (!net) continue;
        const dx = SLOT_DX[s.slot][side === 'hi' ? 0 : 1];
        const a = toSheet(O, s.from);
        const b = toSheet(O, [dx, s.from[1]]);
        if (a.x !== b.x || a.y !== b.y) wires.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        labels.push({ net, x: b.x, y: b.y, a: s.a });
      }
      seq++;
    }
  }
  return { wires, labels };
}

/** 每个 MOSFET 模块的网络分配（net 名必须与 design.mjs 一致） */
export const MOSFET_MODS = {
  A: {
    hi: { anchor: 'Q2', G: 'GH_A', S: 'PH_A', D: 'VCC_BUS' },
    lo: { anchor: 'Q1', G: 'GL_A', S: 'LS_STAR', D: 'VCC_BUS' },
  },
  B: {
    hi: { anchor: 'Q3', G: 'GH_B', S: 'PH_B', D: 'VCC_BUS' },
    lo: { anchor: 'Q5', G: 'GL_B', S: 'LS_STAR', D: 'VCC_BUS' },
  },
  C: {
    hi: { anchor: 'Q6', G: 'GH_C', S: 'PH_C', D: 'VCC_BUS' },
    lo: { anchor: 'Q4', G: 'GL_C', S: 'LS_STAR', D: 'VCC_BUS' },
  },
};

/** 显式走线覆盖的网络（这些网络不做全局自动布线） */
export const EXPLICIT_NETS = new Set(['PH_A', 'PH_B', 'PH_C', 'GH_A', 'GH_B', 'GH_C',
  'GL_A', 'GL_B', 'GL_C', 'VCC_BUS', 'LS_STAR']);
