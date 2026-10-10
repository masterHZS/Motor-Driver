"""Debug: what pads block via placement inside the MOSFET drain pads?"""
import re, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber_strict import parse


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


pads = flashes(sys.argv[1])
dx, dy = 330.01, -67.31
dw, dh = 3.80, 4.80
x0, x1 = dx - dw/2, dx + dw/2
y0, y1 = dy - dh/2, dy + dh/2
print(f"drain pad rect: X {x0:.2f}..{x1:.2f}  Y {y0:.2f}..{y1:.2f}")
print("\npads overlapping the drain pad footprint:")
n = 0
for kind, pr, x, y in pads:
    if not pr:
        continue
    if abs(x - dx) < 1e-6 and abs(y - dy) < 1e-6:
        continue
    a, b, c, d = rect_of(kind, pr, x, y)
    if not (c <= x0 or a >= x1 or d <= y0 or b >= y1):
        n += 1
        print(f"   {kind} {pr} at ({x:.2f},{y:.2f})  rect X {a:.2f}..{c:.2f} Y {b:.2f}..{d:.2f}")
print("count =", n)
