"""Show ONLY the G36 filled regions (copper pour) of each layer, with board outline."""
import re, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from raster_pdf import Raster
from gerber2 import parse, CMDRE


def collect_regions(path):
    txt, div, aps, nareas = parse(path)
    regions = []
    inreg = False
    reg = []
    pos = (0.0, 0.0)
    interp = 1
    for mm in CMDRE.finditer(txt):
        blk = mm.group(1).strip()
        if not blk or blk.startswith('G04'):
            continue
        if 'G36' in blk:
            inreg = True; reg = []; continue
        if 'G37' in blk:
            inreg = False
            if len(reg) >= 3:
                regions.append(list(reg))
            reg = []; continue
        gm = re.search(r'G0?([23])\b', blk)
        if gm:
            interp = int(gm.group(1))
        cm = re.search(r'X(-?\d+)?Y(-?\d+)?(?:I(-?\d+))?(?:J(-?\d+))?D0?([123])', blk)
        if not cm:
            continue
        nx = int(cm.group(1)) / div if cm.group(1) else pos[0]
        ny = int(cm.group(2)) / div if cm.group(2) else pos[1]
        op = int(cm.group(5))
        if not inreg:
            pos = (nx, ny); continue
        if op == 2:
            if reg:
                regions.append(list(reg))
            reg = [(nx, ny)]
        elif op == 1:
            if interp == 1:
                reg.append((nx, ny))
            else:
                i = int(cm.group(3) or 0) / div
                j = int(cm.group(4) or 0) / div
                cx, cy = pos[0] + i, pos[1] + j
                a0 = math.atan2(reg[-1][1] - cy, reg[-1][0] - cx)
                a1 = math.atan2(ny - cy, nx - cx)
                r = math.hypot(reg[-1][0] - cx, reg[-1][1] - cy)
                if interp == 2:
                    while a1 <= a0: a1 += 2 * math.pi
                else:
                    while a1 >= a0: a1 -= 2 * math.pi
                n = max(2, int(abs(a1 - a0) * r * 4))
                for k in range(1, n + 1):
                    t = a0 + (a1 - a0) * k / n
                    reg.append((cx + r * math.cos(t), cy + r * math.sin(t)))
        pos = (nx, ny)
    if reg and len(reg) >= 3:
        regions.append(reg)
    # board bbox from all coords
    xs = [int(m.group(1)) / div for m in re.finditer(r'X(-?\d+)Y', txt)]
    ys = [int(m.group(1)) / div for m in re.finditer(r'X-?\d+Y(-?\d+)', txt)]
    return regions, (min(xs), max(xs), min(ys), max(ys))


def show(path, cols=100, ppm=6.0):
    regions, (x0, x1, y0, y1) = collect_regions(path)
    Wm, Hm = x1 - x0, y1 - y0
    ras = Raster(Wm, Hm, ppm)
    areas = []
    for reg in regions:
        pts = [(px - x0, py - y0) for px, py in reg]
        ras.fill_poly(pts, val=1)
        rx = [p[0] for p in pts]; ry = [p[1] for p in pts]
        areas.append((len(reg), min(rx), max(rx), min(ry), max(ry)))
    print(f"=== {os.path.basename(path)} ===")
    print(f"   board {Wm:.1f} x {Hm:.1f} mm   |   G36 regions: {len(regions)}")
    tot = ras.W * ras.H
    print(f"   poured copper = {100.0*sum(ras.buf)/tot:.1f}% of board area")
    print("   region list (mm, board-local):")
    for n, a, b, c, d in sorted(areas, key=lambda r: -(r[2]-r[1])*(r[4]-r[3]))[:10]:
        print(f"      verts={n:5d}  X {a:7.2f}..{b:7.2f}  Y {c:7.2f}..{d:7.2f}"
              f"   {b-a:7.2f} x {d-c:6.2f} mm")
    print("   map ('#' = poured copper):")
    W, H = ras.W, ras.H
    rows = int(cols * H / W / 2.1)
    for r in range(rows):
        ya = int(r*H/rows); yb = max(ya+1, int((r+1)*H/rows))
        line = []
        for c in range(cols):
            xa = int(c*W/cols); xb = max(xa+1, int((c+1)*W/cols))
            hit = 0
            for y in range(ya, yb, 2):
                base = y*W
                for x in range(xa, xb, 2):
                    if ras.buf[base+x]:
                        hit += 1
            line.append('#' if hit >= 2 else ('+' if hit else '.'))
        print('   |' + ''.join(line) + '|')
    print()


if __name__ == '__main__':
    for p in sys.argv[1:]:
        show(p, 100, 6.0)
