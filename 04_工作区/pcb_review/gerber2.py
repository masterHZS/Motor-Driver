"""Correct EasyEDA-Pro Gerber parser.

Format in these files:
    %FSLAX45Y45*%          -> 4 integer digits, 5 decimal digits  => /1e5 mm
    %MOMM*%                -> millimetres
    %ADDnnC,d*%            -> circle;  R,wXh -> rect; O,... obround
    G01 X..Y..D01/D02/D03* -> linear draw/move/flash
    G36 ... G37            -> region (filled polygon / copper pour)
    G04 Copper Areas: nn   -> comment stating number of copper areas
"""
import re, os, sys, math
from collections import Counter, deque
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from raster_pdf import Raster


def parse(path):
    with open(path, 'r', errors='replace') as f:
        txt = f.read()
    m = re.search(r'%FSLAX(\d)(\d)Y(\d)(\d)\*%', txt)
    xi, xd = (int(m.group(1)), int(m.group(2))) if m else (4, 5)
    div = 10.0 ** xd
    aps = {}
    for mm in re.finditer(r'%ADD(\d+)([A-Za-z_$.][\w$.]*),?([^*%]*)\*%', txt):
        code = int(mm.group(1))
        kind = mm.group(2)
        params = [float(v) for v in re.findall(r'-?\d*\.?\d+', mm.group(3) or '')]
        aps[code] = (kind, params)
    areas = re.search(r'G04 Copper Areas:\s*(\d+)', txt)
    return txt, div, aps, (int(areas.group(1)) if areas else None)


CMDRE = re.compile(r'([^*%]*)\*')


def rasterize(path, ppm=6.0, only_filled=False, only_traced=False):
    txt, div, aps, nareas = parse(path)
    # bbox
    xs, ys = [], []
    for m in re.finditer(r'X(-?\d+)Y(-?\d+)', txt):
        xs.append(int(m.group(1)) / div)
        ys.append(int(m.group(2)) / div)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    Wm, Hm = x1 - x0, y1 - y0
    ras = Raster(Wm, Hm, ppm)

    cur = None
    pos = (0.0, 0.0)
    inreg = False
    reg = []
    interp = 1

    def T(px, py):
        return (px - x0, py - y0)

    for mm in CMDRE.finditer(txt):
        blk = mm.group(1).strip()
        if not blk or blk.startswith('G04'):
            continue
        if 'G36' in blk:
            inreg = True; reg = []; continue
        if 'G37' in blk:
            inreg = False
            if len(reg) >= 3 and not only_traced:
                ras.fill_poly(reg, val=1)
            reg = []
            continue
        gm = re.search(r'G0?([123])\b', blk)
        if gm:
            interp = int(gm.group(1))
        sm = re.fullmatch(r'(?:G0?[123])?\s*D(\d+)', blk)
        if sm:
            c = int(sm.group(1))
            if c >= 10:
                cur = aps.get(c)
            continue
        cm = re.search(r'X(-?\d+)?Y(-?\d+)?(?:I(-?\d+))?(?:J(-?\d+))?D0?([123])', blk)
        if not cm:
            continue
        nx = int(cm.group(1)) / div if cm.group(1) else pos[0]
        ny = int(cm.group(2)) / div if cm.group(2) else pos[1]
        op = int(cm.group(5))
        if op == 2:
            if inreg and reg:
                if len(reg) >= 3 and not only_traced:
                    ras.fill_poly(reg, val=1)
                reg = []
            if inreg:
                reg = [T(nx, ny)]
            pos = (nx, ny); continue
        if op == 1:
            if inreg:
                if not reg:
                    reg = [T(*pos)]
                a = T(*pos); b = T(nx, ny)
                if interp == 1:
                    reg.append(b)
                else:
                    i = int(cm.group(3) or 0) / div
                    j = int(cm.group(4) or 0) / div
                    cx, cy = T(pos[0] + i, pos[1] + j)
                    r = math.hypot(a[0] - cx, a[1] - cy)
                    t0 = math.atan2(a[1] - cy, a[0] - cx)
                    t1 = math.atan2(b[1] - cy, b[0] - cx)
                    if interp == 2:
                        while t1 <= t0: t1 += 2 * math.pi
                    else:
                        while t1 >= t0: t1 -= 2 * math.pi
                    n = max(2, int(abs(t1 - t0) * r * ppm / 2))
                    for k in range(1, n + 1):
                        t = t0 + (t1 - t0) * k / n
                        reg.append((cx + r * math.cos(t), cy + r * math.sin(t)))
            elif not only_filled:
                w = cur[1][0] if (cur and cur[1]) else 0.15
                a = T(*pos); b = T(nx, ny)
                if interp == 1:
                    ras.stroke_poly([a, b], w)
                else:
                    i = int(cm.group(3) or 0) / div
                    j = int(cm.group(4) or 0) / div
                    cx, cy = T(pos[0] + i, pos[1] + j)
                    r = math.hypot(a[0] - cx, a[1] - cy)
                    t0 = math.atan2(a[1] - cy, a[0] - cx)
                    t1 = math.atan2(b[1] - cy, b[0] - cx)
                    if interp == 2:
                        while t1 <= t0: t1 += 2 * math.pi
                    else:
                        while t1 >= t0: t1 -= 2 * math.pi
                    n = max(2, int(abs(t1 - t0) * r * ppm / 2))
                    pts = []
                    for k in range(n + 1):
                        t = t0 + (t1 - t0) * k / n
                        pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))
                    ras.stroke_poly(pts, w)
            pos = (nx, ny); continue
        if op == 3:
            if cur and not only_traced:
                tgt = T(nx, ny)
                kind, prm = cur
                if kind == 'C' and prm:
                    r = prm[0] / 2
                    pts = [(tgt[0] + r * math.cos(t), tgt[1] + r * math.sin(t))
                           for t in [k * 2 * math.pi / 24 for k in range(24)]]
                    ras.fill_poly(pts, val=1)
                elif prm:
                    w = prm[0]; h = prm[1] if len(prm) > 1 else w
                    pts = [(tgt[0]-w/2, tgt[1]-h/2), (tgt[0]+w/2, tgt[1]-h/2),
                           (tgt[0]+w/2, tgt[1]+h/2), (tgt[0]-w/2, tgt[1]+h/2)]
                    ras.fill_poly(pts, val=1)
            pos = (nx, ny); continue
    return ras, (Wm, Hm), nareas, aps


if __name__ == '__main__':
    for p in sys.argv[1:]:
        ras, dims, nareas, aps = rasterize(p, 6.0)
        W, H = ras.W, ras.H
        tot = W * H
        cop = sum(ras.buf)
        filled = sum(1 for i in range(tot) if ras.kind[i] == 1)
        traced = sum(1 for i in range(tot) if ras.kind[i] == 2)
        print(f"=== {os.path.basename(p)} ===")
        print(f"   board bbox: {dims[0]:.2f} x {dims[1]:.2f} mm")
        print(f"   'Copper Areas' declared in file: {nareas}")
        print(f"   copper coverage: {100.0*cop/tot:.1f}%")
        print(f"     filled (pour/region): {100.0*filled/tot:.1f}%")
        print(f"     traced (tracks):      {100.0*traced/tot:.1f}%")
        print()
