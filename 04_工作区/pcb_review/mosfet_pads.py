"""Extract the full pad layout of the MOSFET footprints so we can place vias."""
import re, os, sys, math
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber_strict import parse

BOARD = (249.047, 358.140, -100.965, -49.911)
BX0, BX1, BY0, BY1 = BOARD


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


gtl = sys.argv[1]
pads = flashes(gtl)

# The six MOSFET drain pads found earlier
DRAINS = [(330.01, -67.31), (330.01, -60.45), (342.38, -67.27),
          (330.14, -81.66), (342.38, -74.76), (330.07, -74.74)]

print("=" * 78)
print("ALL PADS WITHIN 6 mm OF EACH MOSFET DRAIN PAD")
for i, (dx, dy) in enumerate(DRAINS, 1):
    print(f"\n--- MOSFET #{i}  drain pad at X{dx:.2f} Y{dy:.2f} ---")
    near = [(k, p, x, y) for k, p, x, y in pads
            if abs(x - dx) <= 6.0 and abs(y - dy) <= 6.0]
    for k, p, x, y in sorted(near, key=lambda r: (-r[3], r[2])):
        w = p[0] if p else 0
        h = p[1] if len(p) > 1 else w
        print(f"    X{x:8.2f} Y{y:9.2f}  {k}  {w:5.3f} x {h:5.3f} mm")
