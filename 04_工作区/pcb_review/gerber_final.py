"""Final analysis: copper coverage relative to the REAL board outline + track widths."""
import re, os, sys, math
from collections import Counter, deque
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from raster_pdf import Raster
from gerber2 import parse, CMDRE

BOARD = (249.047, 358.140, -100.965, -49.911)   # from Gerber_BoardOutlineLayer.GKO


def analyze(path, ppm=12.0):
    txt, div, aps, nareas = parse(path)
    bx0, bx1, by0, by1 = BOARD
    Wm, Hm = bx1 - bx0, by1 - by0
    ras = Raster(Wm, Hm, ppm)
    # clip: anything outside board is ignored
    def T(px, py):
        return (px - bx0, py - by0)

    cur = None; pos = (0.0, 0.0); inreg = False; reg = []; interp = 1
    widths = Counter()
    for mm in CMDRE.finditer(txt):
        blk = mm.group(1).strip()
        if not blk or blk.startswith('G04'):
            continue
        if 'G36' in blk:
            inreg = True; reg = []; continue
        if 'G37' in blk:
            inreg = False
            if len(reg) >= 3:
                ras.fill_poly(reg, val=1)
            reg = []; continue
        gm = re.search(r'G0?([23])\b', blk)
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
                if len(reg) >= 3:
                    ras.fill_poly(reg, val=1)
                reg = []
            if inreg:
                reg = [T(nx, ny)]
            pos = (nx, ny); continue
        if op == 1:
            if inreg:
                if not reg:
                    reg = [T(*pos)]
                if interp == 1:
                    reg.append(T(nx, ny))
                else:
                    i = int(cm.group(3) or 0) / div
                    j = int(cm.group(4) or 0) / div
                    cx, cy = T(pos[0] + i, pos[1] + j)
                    a = T(*pos); b = T(nx, ny)
                    r = math.hypot(a[0]-cx, a[1]-cy)
                    t0 = math.atan2(a[1]-cy, a[0]-cx); t1 = math.atan2(b[1]-cy, b[0]-cx)
                    if interp == 2:
                        while t1 <= t0: t1 += 2*math.pi
                    else:
                        while t1 >= t0: t1 -= 2*math.pi
                    n = max(2, int(abs(t1-t0)*r*ppm/2))
                    for k in range(1, n+1):
                        t = t0 + (t1-t0)*k/n
                        reg.append((cx + r*math.cos(t), cy + r*math.sin(t)))
            else:
                w = cur[1][0] if (cur and cur[1]) else 0.15
                widths[round(w, 4)] += 1
                a = T(*pos); b = T(nx, ny)
                if interp == 1:
                    ras.stroke_poly([a, b], w)
                else:
                    i = int(cm.group(3) or 0) / div
                    j = int(cm.group(4) or 0) / div
                    cx, cy = T(pos[0]+i, pos[1]+j)
                    r = math.hypot(a[0]-cx, a[1]-cy)
                    t0 = math.atan2(a[1]-cy, a[0]-cx); t1 = math.atan2(b[1]-cy, b[0]-cx)
                    if interp == 2:
                        while t1 <= t0: t1 += 2*math.pi
                    else:
                        while t1 >= t0: t1 -= 2*math.pi
                    n = max(2, int(abs(t1-t0)*r*ppm/2))
                    pts = []
                    for k in range(n+1):
                        t = t0 + (t1-t0)*k/n
                        pts.append((cx + r*math.cos(t), cy + r*math.sin(t)))
                    ras.stroke_poly(pts, w)
            pos = (nx, ny); continue
        if op == 3:
            if cur:
                tgt = T(nx, ny)
                kind, prm = cur
                if kind == 'C' and prm:
                    r = prm[0]/2
                    ras.fill_poly([(tgt[0]+r*math.cos(t), tgt[1]+r*math.sin(t))
                                   for t in [k*2*math.pi/24 for k in range(24)]], val=1)
                elif prm:
                    w0 = prm[0]; h0 = prm[1] if len(prm) > 1 else w0
                    ras.fill_poly([(tgt[0]-w0/2, tgt[1]-h0/2), (tgt[0]+w0/2, tgt[1]-h0/2),
                                   (tgt[0]+w0/2, tgt[1]+h0/2), (tgt[0]-w0/2, tgt[1]+h0/2)], val=1)
            pos = (nx, ny); continue

    W, H = ras.W, ras.H
    tot = W*H
    cop = sum(ras.buf)
    filled = sum(1 for i in range(tot) if ras.kind[i] == 1)
    traced = sum(1 for i in range(tot) if ras.kind[i] == 2)
    print(f"=== {os.path.basename(path)} ===")
    print(f"   BOARD  {Wm:.2f} x {Hm:.2f} mm = {Wm*Hm:.0f} mm^2")
    print(f"   copper coverage on board : {100.0*cop/tot:.1f}%")
    print(f"      poured (G36 regions)  : {100.0*filled/tot:.1f}%")
    print(f"      tracks (strokes)      : {100.0*traced/tot:.1f}%")
    print(f"   distinct track widths used: {len(widths)}")
    for w in sorted(widths, reverse=True)[:14]:
        print(f"      {w:7.3f} mm   x{widths[w]}")
    print()
    return ras


if __name__ == '__main__':
    for p in sys.argv[1:]:
        analyze(p, 12.0)
