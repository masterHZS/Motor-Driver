"""High-resolution look at ONE MOSFET footprint: pad, pour, thermal spokes, vias."""
import re, os, sys, math
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber_strict import parse
from raster_pdf import Raster

BOARD = (249.047, 358.140, -100.965, -49.911)


def render_crop(path, x0, y0, x1, y1, ppm):
    raw, div, aps = parse(path)
    Wm, Hm = x1 - x0, y1 - y0
    ras = Raster(Wm, Hm, ppm)
    cur = None; pos = (0.0, 0.0); inreg = False; reg = []; interp = 1

    def T(px, py):
        return (px - x0, py - y0)

    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith(('G04', '%')):
            continue
        if line.startswith('G36'):
            inreg = True; reg = []; continue
        if line.startswith('G37'):
            inreg = False
            if len(reg) >= 3:
                ras.fill_poly(reg, val=1)
            reg = []; continue
        m = re.match(r'^(?:G0?([123]))?(?:X(-?\d+))?(?:Y(-?\d+))?(?:I(-?\d+))?(?:J(-?\d+))?D0?([123])', line, re.I)
        if not m or m.group(6) is None:
            s = re.fullmatch(r'(?:G5?4)?D(\d+)\*?', line, re.I)
            if s and int(s.group(1)) >= 10:
                cur = int(s.group(1))
            continue
        if m.group(1):
            interp = int(m.group(1))
        nx = int(m.group(2)) / div if m.group(2) else pos[0]
        ny = int(m.group(3)) / div if m.group(3) else pos[1]
        op = int(m.group(6))
        if op == 2:
            if inreg and reg:
                if len(reg) >= 3:
                    ras.fill_poly(reg, val=1)
                reg = []
            if inreg:
                reg = [T(nx, ny)]
            pos = (nx, ny)
        elif op == 1:
            a, b = T(*pos), T(nx, ny)
            if inreg:
                if not reg:
                    reg = [a]
                reg.append(b)
            else:
                kind, prm = aps.get(cur, ('C', [0.2]))
                w = prm[0] if prm else 0.2
                ras.stroke_poly([a, b], w)
            pos = (nx, ny)
        elif op == 3:
            kind, prm = aps.get(cur, ('?', []))
            t = T(nx, ny)
            if kind == 'C' and prm:
                r = prm[0] / 2
                ras.fill_poly([(t[0] + r*math.cos(k*math.pi/12), t[1] + r*math.sin(k*math.pi/12))
                               for k in range(24)], val=1)
            elif prm:
                w = prm[0]; h = prm[1] if len(prm) > 1 else w
                ras.fill_poly([(t[0]-w/2, t[1]-h/2), (t[0]+w/2, t[1]-h/2),
                               (t[0]+w/2, t[1]+h/2), (t[0]-w/2, t[1]+h/2)], val=1)
            pos = (nx, ny)
        tail = line[m.end():].replace('*', '').strip()
        if tail.isdigit():
            cur = int(tail)
    return ras


def show(path, label, cx, cy, hw, hh, cols=110, rows=34, ppm=40.0):
    ras = render_crop(path, cx - hw, cy - hh, cx + hw, cy + hh, ppm)
    print(f"--- {label}  X {cx-hw:.2f}..{cx+hw:.2f}  Y {cy-hh:.2f}..{cy+hh:.2f} mm ---")
    print(f"    scale: 1 char = {2*hw/cols:.3f} mm wide, {2*hh/rows:.3f} mm tall")
    print("    '#'=poured copper  '+'=track/flash  '.'=bare")
    for r in range(rows):
        y0 = int(r * ras.H / rows); y1 = max(y0 + 1, int((r + 1) * ras.H / rows))
        line = []
        for c in range(cols):
            x0 = int(c * ras.W / cols); x1 = max(x0 + 1, int((c + 1) * ras.W / cols))
            fill = trace = 0
            for y in range(y0, y1):
                b = y * ras.W
                for x in range(x0, x1):
                    k = ras.kind[b + x]
                    if k == 1: fill += 1
                    elif k == 2: trace += 1
            tot = max(1, (y1-y0) * (x1-x0))
            line.append('#' if fill/tot > 0.5 else ('+' if (fill+trace)/tot > 0.2 else
                        ('.' if (fill+trace) else ' ')))
        print('    |' + ''.join(line) + '|')
    print()


if __name__ == '__main__':
    p = sys.argv[1]
    show(p, "MOSFET #1 drain pad + surroundings", 330.01, -67.31, 4.0, 4.0)
