/**
 * 布线校验器：对 router.mjs 产出的走线做**几何体检**（不是电气校验）。
 *
 * 为什么需要它：KiCad 里「线穿过另一网络的引脚线中段」不会短路，但
 * 「线端点落在另一网络的引脚连接点/线上」会。人工排布极易踩这些坑，
 * 所以这里把规则固化下来，每次改版面都跑一遍。
 *
 * 规则（全部为硬失败）：
 *  R1 所有线段必须正交（水平或垂直）
 *  R2 所有坐标必须落在 0.01 mm 网格
 *  R3 同一网络的线段不得**共线重叠**（会画出粗细不均的线）
 *  R4 不同网络的线段不得共线重叠
 *  R5 走线端点不得落在**别的网络**的引脚连接点上
 *  R6 走线端点不得落在**别的网络**的线段上（T 接短路）
 *  R7 走线不得穿过元件符号本体（矩形/折线包围盒）
 */
import { COMPONENTS, NETS, NO_CONNECT } from './design.mjs';
import { PLACE } from './layout.mjs';

const r3 = (v) => Math.round(v * 1000) / 1000;
const key = (x, y) => `${r3(x)},${r3(y)}`;
const near = (a, b) => Math.abs(a - b) < 0.005;

const NET_OF_PIN = new Map();
for (const [net, ms] of Object.entries(NETS)) for (const m of ms) NET_OF_PIN.set(m, net);

export function checkRouting({ wires, labels, junctions, pinAt, bodies }) {
  const errs = [];
  const E = (m) => errs.push(m);
  const netOf = (w) => w.net ?? '?';

  /* R1 正交 + R2 网格 */
  for (const w of wires) {
    if (!(near(w.x1, w.x2) || near(w.y1, w.y2))) E(`R1 非正交段 [${netOf(w)}] (${w.x1},${w.y1})-(${w.x2},${w.y2})`);
    for (const v of [w.x1, w.y1, w.x2, w.y2]) if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) E(`R2 不在 0.01 网格 [${netOf(w)}] ${v}`);
  }

  /* 线段归一化：水平 h(y, x1<x2) / 垂直 v(x, y1<y2) */
  const norm = wires.map((w, i) => near(w.y1, w.y2)
    ? { i, t: 'h', y: r3(w.y1), a: r3(Math.min(w.x1, w.x2)), b: r3(Math.max(w.x1, w.x2)), net: netOf(w) }
    : { i, t: 'v', x: r3(w.x1), a: r3(Math.min(w.y1, w.y2)), b: r3(Math.max(w.y1, w.y2)), net: netOf(w) });

  /* R3/R4 共线重叠 */
  for (let i = 0; i < norm.length; i++) for (let j = i + 1; j < norm.length; j++) {
    const A = norm[i], B = norm[j];
    if (A.t !== B.t) continue;
    const same = A.t === 'h' ? near(A.y, B.y) : near(A.x, B.x);
    if (!same) continue;
    const lo = Math.max(A.a, B.a), hi = Math.min(A.b, B.b);
    if (hi - lo > 0.005) {
      if (A.net === B.net) E(`R3 同网共线重叠 [${A.net}] ${A.t} ${lo}..${hi}`);
      else E(`R4 跨网共线重叠 [${A.net}]×[${B.net}] ${A.t} ${lo}..${hi}`);
    }
  }

  /* 端点集合（含引脚连接点） */
  const pinEnds = new Map();     // key → Set(pinName)
  for (const [k, list] of pinAt) pinEnds.set(k, new Set(list));

  const segHit = (S, x, y, strict = true) => {
    if (S.t === 'h') {
      if (!near(y, S.y)) return false;
      return strict ? x > S.a + 0.005 && x < S.b - 0.005 : x >= S.a - 0.005 && x <= S.b + 0.005;
    }
    if (!near(x, S.x)) return false;
    return strict ? y > S.a + 0.005 && y < S.b - 0.005 : y >= S.a - 0.005 && y <= S.b + 0.005;
  };

  for (const w of wires) {
    for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
      const k = key(x, y);
      /* R5 端点落在别的网络的引脚上 */
      const pins = pinEnds.get(k);
      if (pins) {
        for (const p of pins) {
          const pref = p.slice(0, p.lastIndexOf('.'));
          const pnet = NET_OF_PIN.get(p);
          if (pnet && pnet !== netOf(w)) E(`R5 走线端点 (${r3(x)},${r3(y)}) [${netOf(w)}] 落在引脚 ${p}[${pnet}] 上`);
        }
      }
      /* R6 端点落在别的网络的线段中段 */
      for (const S of norm) {
        if (S.net === netOf(w)) continue;
        if (segHit(S, x, y)) E(`R6 走线端点 (${r3(x)},${r3(y)}) [${netOf(w)}] 落在 [${S.net}] 线段中段`);
      }
    }
  }

  /* R7 走线穿过符号本体 */
  for (const w of wires) {
    for (const bd of bodies) {
      if (netOf(w) === bd.net) continue;
      const hit = near(w.y1, w.y2)
        ? (w.y1 > bd.y1 + 0.005 && w.y1 < bd.y2 - 0.005 && Math.min(w.x1, w.x2) < bd.x2 - 0.005 && Math.max(w.x1, w.x2) > bd.x1 + 0.005)
        : (w.x1 > bd.x1 + 0.005 && w.x1 < bd.x2 - 0.005 && Math.min(w.y1, w.y2) < bd.y2 - 0.005 && Math.max(w.y1, w.y2) > bd.y1 + 0.005);
      if (hit) E(`R7 走线 [${netOf(w)}] 穿过符号 ${bd.ref} 本体`);
    }
  }

  return errs;
}
