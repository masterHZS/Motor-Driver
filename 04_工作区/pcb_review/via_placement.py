"""Compute legal via positions inside each MOSFET drain pad (collision-checked)."""
import re, os, sys, math
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber_strict import parse

BOARD = (249.047, 358.140, -100.965, -49.911)
BX0, BX1, BY0, BY1 = BOARD

VIA_D = 0.60          # via pad diameter (mm)
VIA_HOLE = 0.30       # finished hole (mm)
CLEAR = 0.25          # clearance to neighbouring pads (mm)


def flashes(path):
    raw, div, aps = parse(path)
    out, cur = [], None
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith(('G04', '%', 'G36', 'G37')):
            continue
        m = re.match(r'^(?:G0?([123]))?(?:X(-?\d+))?(?:Y(-?\d+))?(?:I(-?\d+))?(?:J(-?\d+))?D0?([123])', line, re.I)
        if not m or m.group(6) is None:
            s = re.fullmatch(r'(?:G5?4)?D(\d+)\*?', line, re.I)
            if s and int(s.group(1)) >= 10:
                cur = int(s.group(1))
            continue
        if int(m.group(6)) == 3 and m.group(2) and m.group(3) and cur is not None:
            kind, prm = aps.get(cur, ('?', []))
            out.append((kind, [round(v, 3) for v in prm],
                        int(m.group(2)) / div, int(m.group(3)) / div))
        tail = line[m.end():].replace('*', '').strip()
        if tail.isdigit():
            cur = int(tail)
    return out


def rect_of(kind, p, x, y):
    if kind == 'C':
        r = p[0] / 2
        return (x - r, y - r, x + r, y + r)
    w = p[0]; h = p[1] if len(p) > 1 else p[0]
    return (x - w/2, y - h/2, x + w/2, y + h/2)


DRAINS = [
    ("Q? #1  X330.01 Y-67.31", 330.01, -67.31),
    ("Q? #2  X330.01 Y-60.45", 330.01, -60.45),
    ("Q? #3  X342.38 Y-67.27", 342.38, -67.27),
    ("Q? #4  X330.14 Y-81.66", 330.14, -81.66),
    ("Q? #5  X342.38 Y-74.76", 342.38, -74.76),
    ("Q? #6  X330.07 Y-74.74", 330.07, -74.74),
]

pads = flashes(sys.argv[1])

for label, dx, dy in DRAINS:
    dw, dh = 3.80, 4.80
    x0, x1 = dx - dw/2, dx + dw/2          # 1.90 mm half width
    y0, y1 = dy - dh/2, dy + dh/2          # 2.40 mm half height
    # pads that could collide (exclude the drain pad itself and vias)
    others = []
    for kind, p, x, y in pads:
        if not p:
            continue
        if abs(x - dx) < 1e-6 and abs(y - dy) < 1e-6:
            continue
        if kind == 'C' and p[0] <= 1.05:
            continue                       # existing via
        if abs(x - dx) > 7 or abs(y - dy) > 7:
            continue
        others.append(rect_of(kind, p, x, y))

    legal = []
    step = 0.30
    ny = int((dh - VIA_D - 2*0.30) / step)
    nx = int((dw - VIA_D - 2*0.30) / step)
    for iy in range(ny + 1):
        cy = y0 + 0.30 + VIA_D/2 + iy * step
        for ix in range(nx + 1):
            cx = x0 + 0.30 + VIA_D/2 + ix * step
            r = VIA_D / 2
            box = (cx - r, cy - r, cx + r, cy + r)
            ok = True
            for (a, b, c, d) in others:
                if not (box[2] + CLEAR <= a or box[0] - CLEAR >= c or
                        box[3] + CLEAR <= b or box[1] - CLEAR >= d):
                    ok = False
                    break
            if ok:
                legal.append((cx, cy))

    # pick 9 spread-most points (3x3) from legal set
    print(f"=== {label} ===")
    print(f"    drain pad {dw}x{dh} mm, half-width X +-{dw/2:.2f}, half-height Y +-{dh/2:.2f}")
    print(f"    legal via centre positions (0.30 mm hole / 0.60 mm pad): {len(legal)}")
    if legal:
        xs = sorted({round(p[0], 2) for p in legal})
        ys = sorted({round(p[1], 2) for p in legal})
        print(f"    usable X offsets from pad centre: "
              f"{min(v-dx for v in xs):+.2f} .. {max(v-dx for v in xs):+.2f} mm")
        print(f"    usable Y offsets from pad centre: "
              f"{min(v-dy for v in ys):+.2f} .. {max(v-dy for v in ys):+.2f} mm")
        # a practical 3x3 suggestion
        pick = []
        for ty in (-1.0, 0.0, 1.0):
            for tx in (-1.0, 0.0, 1.0):
                px, py = dx + tx, dy + ty
                if any(abs(px-a) < 0.05 and abs(py-b) < 0.05 for a, b in legal):
                    pick.append((px, py, 'ok'))
                else:
                    pick.append((px, py, 'COLLIDES'))
        nok = sum(1 for p in pick if p[2] == 'ok')
        print(f"    3x3 grid at +-1.0 mm -> {nok}/9 legal")
        for px, py, st in pick:
            if st != 'ok':
                print(f"        ({px:8.2f},{py:9.2f}) {st}")
    print()
