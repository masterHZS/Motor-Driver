/**
 * 布线器（kicad.mjs 与 render.mjs 共用）
 *
 * ── 画法规则 ────────────────────────────────────────────────────────
 *  1. 电源/地/母线网络（NET_CLASS = power | gnd）→ global_label。
 *  2. 其余网络：全部引脚落在同一功能块 → **真实正交走线直连**；
 *     跨块的信号网络 → global_label（模块之间不直连，需求 3）。
 *  3. 显式例外（EXPLICIT_NETS）：一个网络虽然全在块内，但由若干个
 *     互不相邻的「子模块」组成（如 PH_A = 3 个半桥模块各自的源极），
 *     自动布线会拉出横穿整块的长线 → 改用「每个子模块单独走线 + 同名标签」。
 *
 * ── 正交布线算法 ───────────────────────────────────────────────────
 *  · 全部点同一 y → 一根水平线；同一 x → 一根竖线
 *  · 否则按 Manhattan 距离建最小生成森林，每条边先试「横-竖」再试
 *    「竖-横」L 形；选不与本网络已有线段冲突的那一种。
 */

export const STUB = 5.08;               // 标签引线长度

/** 标签引线方向（沿用改造前规则：引脚向外 → 短线 → 标签） */
export function labelDir(pp) {
  if (pp.a === 0) return { dx: -STUB, labelAngle: 180 };
  if (pp.a === 180) return { dx: STUB, labelAngle: 0 };
  if (pp.sx >= 0) return { dx: STUB, labelAngle: 0 };
  return { dx: -STUB, labelAngle: 180 };
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const near = (a, b) => Math.abs(a - b) < 0.005;

/* ---------------------------------------------------------------- */
/* 一、网络分类                                                      */
/* ---------------------------------------------------------------- */

/** 强制用标签的网络。
 *  MCU 的引脚节距只有 2.54 mm，串联小元件（本体 5.08 mm 高）无法与之同行
 *  摆放而不重叠；硬要在引脚带里拉长走线又必然与相邻脚网络交叉。
 *  这类网络统一用 global_label（这也是工程上最常见的做法）。 */
export const FORCE_LABEL_NETS = new Set([
  'PWM_AH', 'PWM_AL', 'PWM_BH', 'PWM_BL', 'PWM_CH', 'PWM_CL',
  'UART_TX', 'SWDIO', 'SWCLK',
  'AIN_A', 'AIN_B', 'AIN_C', 'AIN_ISENSE', 'AIN_VBUS',
  'MCU_NRST', 'MCU_VCAP', 'DRV_HIN1', 'DRV_LIN1', 'DRV_HIN2', 'DRV_LIN2', 'DRV_HIN3', 'DRV_LIN3',
]);

export function planNets({ NETS, NET_CLASS, blockOf }) {
  const mode = new Map(), reason = new Map();
  for (const [net, members] of Object.entries(NETS)) {
    const cls = NET_CLASS[net] ?? 'other';
    if (FORCE_LABEL_NETS.has(net)) { mode.set(net, 'label'); reason.set(net, '指定为标签'); continue; }
    if (cls === 'power' || cls === 'gnd') {
      mode.set(net, 'label'); reason.set(net, `${cls === 'power' ? '电源/母线' : '地'}网络`);
      continue;
    }
    const blocks = new Set(members.map((m) => blockOf(m.slice(0, m.lastIndexOf('.')))));
    if (blocks.size > 1) {
      mode.set(net, 'label'); reason.set(net, `跨 ${blocks.size} 个功能块`);
      continue;
    }
    mode.set(net, 'wire'); reason.set(net, '块内网络');
  }
  return { mode, reason };
}

/* ---------------------------------------------------------------- */
/* 二、正交布线                                                      */
/* ---------------------------------------------------------------- */

const norm = (w) => (near(w.y1, w.y2)
  ? { t: 'h', y: w.y1, a: Math.min(w.x1, w.x2), b: Math.max(w.x1, w.x2) }
  : { t: 'v', x: w.x1, a: Math.min(w.y1, w.y2), b: Math.max(w.y1, w.y2) });

/** 点是否落在某线段的中段（不含端点） */
function midHit(seg, x, y) {
  if (seg.t === 'h') return near(y, seg.y) && x > seg.a + 0.005 && x < seg.b - 0.005;
  return near(x, seg.x) && y > seg.a + 0.005 && y < seg.b - 0.005;
}
/** 点是否落在线段上（含端点） */
function onSeg(seg, x, y) {
  if (seg.t === 'h') return near(y, seg.y) && x >= seg.a - 0.005 && x <= seg.b + 0.005;
  return near(x, seg.x) && y >= seg.a - 0.005 && y <= seg.b + 0.005;
}

/** 把若干点用正交线段连起来（Manhattan 最小生成森林 + L 形避让） */
export function routeNet(points, keepOut = []) {
  const pts = [];
  for (const p of points) if (!pts.some((q) => near(q.x, p.x) && near(q.y, p.y))) pts.push({ x: r3(p.x), y: r3(p.y) });
  if (pts.length < 2) return [];

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  if (ys.every((y) => near(y, ys[0])))
    return [{ x1: Math.min(...xs), y1: ys[0], x2: Math.max(...xs), y2: ys[0] }];
  if (xs.every((x) => near(x, xs[0])))
    return [{ x1: xs[0], y1: Math.min(...ys), x2: xs[0], y2: Math.max(...ys) }];

  /* 候选边：全部点对，按 Manhattan 距离升序 */
  const edges = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = Math.abs(pts[i].x - pts[j].x) + Math.abs(pts[i].y - pts[j].y);
    edges.push({ i, j, d });
  }
  edges.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);

  const uf = pts.map((_, i) => i);
  const find = (a) => { while (uf[a] !== a) { uf[a] = uf[uf[a]]; a = uf[a]; } return a; };

  const placed = [];
  const conflict = (segs) => {
    /* 与已放线段共线重叠 → 冲突；端点落在已有线段中段 → 冲突 */
    for (const s of segs) {
      const n = norm(s);
      for (const q of placed) {
        if (n.t === q.t) {
          const same = n.t === 'h' ? near(n.y, q.y) : near(n.x, q.x);
          if (same && Math.min(n.b, q.b) - Math.max(n.a, q.a) > 0.005) return true;
        }
      }
      for (const c of keepOut) if (midHit(n, c.x, c.y)) return true;
    }
    return false;
  };

  for (const e of edges) {
    const ra = find(e.i), rb = find(e.j);
    if (ra === rb) continue;
    const a = pts[e.i], b = pts[e.j];
    /* 两种 L 形：先横后竖 / 先竖后横 */
    const cands = [
      [{ x1: a.x, y1: a.y, x2: b.x, y2: a.y }, { x1: b.x, y1: a.y, x2: b.x, y2: b.y }],
      [{ x1: a.x, y1: a.y, x2: a.x, y2: b.y }, { x1: a.x, y1: b.y, x2: b.x, y2: b.y }],
    ].map((segs) => segs.filter((s) => !(near(s.x1, s.x2) && near(s.y1, s.y2))));
    let chosen = null;
    for (const segs of cands) if (!conflict(segs)) { chosen = segs; break; }
    if (!chosen) chosen = cands[0];
    for (const s of chosen) { placed.push(s); }
    uf[find(e.i)] = find(e.j);
  }
  return placed.map((s) => ({ x1: r3(s.x1), y1: r3(s.y1), x2: r3(s.x2), y2: r3(s.y2) }));
}

/* ---------------------------------------------------------------- */
/* 三、汇总                                                          */
/* ---------------------------------------------------------------- */

/**
 * @param {object} o
 *  o.NETS, o.NET_CLASS, o.NO_CONNECT, o.blockOf
 *  o.place, o.pinGroups
 *  o.explicitWires  显式走线 [{x1,y1,x2,y2,net}]（这些网络的引脚不再自动布线）
 *  o.extraLabels    显式标签 [{net,x,y,a}]
 */
export function buildRouting({ NETS, NET_CLASS, NO_CONNECT, place, pinGroups, blockOf, explicitWires = [], extraLabels = [] }) {
  const pinNet = new Map();
  for (const [net, members] of Object.entries(NETS)) for (const m of members) pinNet.set(m, net);

  const { mode, reason } = planNets({ NETS, NET_CLASS, blockOf });
  const ncSet = new Set(NO_CONNECT);
  /* 显式走线覆盖的网络：不再自动布线，标签按显式表 + 基础 stub 规则给 */
  const explicitNets = new Set(explicitWires.map((w) => w.net));
  for (const l of extraLabels) explicitNets.add(l.net);

  const wires = [], labels = [], junctions = [];
  const stats = { wireNets: 0, labelNets: 0, stubs: 0 };

  /* 每个引脚坐标点（去重，记录其网络集合） */
  const pointOf = new Map();          // "x,y" → {x,y,nets:Set}
  for (const [net, members] of Object.entries(NETS)) {
    for (const m of members) {
      const ref = m.slice(0, m.lastIndexOf('.'));
      for (const g of pinGroups[ref]) {
        if (!g.pins.some((pn) => `${ref}.${pn}` === m)) continue;
        if (g.pins.every((pn) => ncSet.has(`${ref}.${pn}`))) continue;
        const k = `${r3(g.x)},${r3(g.y)}`;
        if (!pointOf.has(k)) pointOf.set(k, { x: r3(g.x), y: r3(g.y), a: g.a, sx: g.sx, nets: new Set() });
        pointOf.get(k).nets.add(net);
      }
    }
  }
  /* 同一坐标点若属多个网络 → 必然短路，提前报错 */
  for (const [k, p] of pointOf)
    if (p.nets.size > 1) throw new Error(`坐标 ${k} 的引脚分属多个网络: ${[...p.nets].join(',')}`);

  /* ---- 显式走线 ---- */
  for (const w of explicitWires) wires.push({ ...w, net: w.net });
  for (const l of extraLabels) labels.push({ ...l });

  /* ---- 标签网络的 stub ---- */
  for (const [net, members] of Object.entries(NETS)) {
    if (mode.get(net) !== 'label') continue;
    stats.labelNets++;
    const done = new Set();
    for (const m of members) {
      const ref = m.slice(0, m.lastIndexOf('.'));
      for (const g of pinGroups[ref]) {
        if (!g.pins.some((pn) => `${ref}.${pn}` === m)) continue;
        if (g.pins.every((pn) => ncSet.has(`${ref}.${pn}`))) continue;
        const k = `${ref}|${r3(g.x)},${r3(g.y)}`;
        if (done.has(k)) continue;
        done.add(k);
        const { dx, labelAngle } = labelDir({ a: g.a, sx: g.sx });
        const x2 = r3(g.x + dx), y2 = r3(g.y);
        wires.push({ x1: r3(g.x), y1: r3(g.y), x2, y2, net });
        labels.push({ net, x: x2, y: y2, a: labelAngle });
        stats.stubs++;
      }
    }
  }

  /* ---- 走线网络 ---- */
  const netPoints = new Map();
  for (const [net, members] of Object.entries(NETS)) {
    if (mode.get(net) !== 'wire') continue;
    stats.wireNets++;
    const pts = [];
    const seen = new Set();
    for (const m of members) {
      const ref = m.slice(0, m.lastIndexOf('.'));
      for (const g of pinGroups[ref]) {
        if (!g.pins.some((pn) => `${ref}.${pn}` === m)) continue;
        if (g.pins.every((pn) => ncSet.has(`${ref}.${pn}`))) continue;
        const k = `${r3(g.x)},${r3(g.y)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        pts.push({ x: r3(g.x), y: r3(g.y) });
      }
    }
    netPoints.set(net, pts);
    if (explicitNets.has(net)) continue;      // 该网络已由显式走线覆盖
    const segs = routeNet(pts);
    for (const s of segs) wires.push({ ...s, net });

    /* T 型连接点 */
    const ends = new Map(), passes = new Map();
    const bump = (map, k) => map.set(k, (map.get(k) ?? 0) + 1);
    for (const s of segs) {
      bump(ends, `${s.x1},${s.y1}`);
      bump(ends, `${s.x2},${s.y2}`);
      const n = norm(s);
      for (const p of pts) if (midHit(n, p.x, p.y)) bump(passes, `${p.x},${p.y}`);
    }
    for (const k of new Set([...ends.keys(), ...passes.keys()])) {
      const deg = (ends.get(k) ?? 0) + (passes.get(k) ?? 0);
      if (deg >= 3) { const [x, y] = k.split(',').map(Number); junctions.push({ x, y, net }); }
    }
  }

  /* 连接点表（供体检用） */
  const connectPoints = new Map();
  for (const w of wires) {
    for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
      const k = `${x},${y}`;
      if (!connectPoints.has(k)) connectPoints.set(k, new Set());
      connectPoints.get(k).add(w.net);
    }
  }

  return { mode, reason, wires, labels, junctions, netPoints, connectPoints, stats, pinNet, explicitNets };
}
