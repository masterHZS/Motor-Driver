"""Produce the final audit summary with IPC-2221 current capacity and via map."""
import re, os, sys, math
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber_strict import parse, scan

BOARD = (249.047, 358.140, -100.965, -49.911)
BX0, BX1, BY0, BY1 = BOARD
BW, BH = BX1 - BX0, BY1 - BY0
AREA = BW * BH


def ipc2221(w_mm, oz=1.0, dT=10.0, internal=False):
    """IPC-2221 conductor width -> current (A). External layer by default."""
    k = 0.024 if internal else 0.048
    b, c = 0.44, 0.725
    t_mil = 1.378 * oz
    w_mil = w_mm / 0.0254
    A_mil2 = w_mil * t_mil
    # I = k * dT^b * A^c
    return k * (dT ** b) * (A_mil2 ** c)


def flashes_pos(path):
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
            out.append((kind, prm, int(m.group(2)) / div, int(m.group(3)) / div))
        tail = line[m.end():].replace('*', '').strip()
        if tail.isdigit():
            cur = int(tail)
    return out


def trace_widths(path):
    raw, div, aps = parse(path)
    cur, w = None, Counter()
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
        if int(m.group(6)) == 1 and cur is not None:
            kind, prm = aps.get(cur, ('?', []))
            if kind == 'C' and prm:
                w[round(prm[0], 4)] += 1
        tail = line[m.end():].replace('*', '').strip()
        if tail.isdigit():
            cur = int(tail)
    return w


gtl, gbl = sys.argv[1], sys.argv[2]

print("SECTION 1 - TRACE WIDTHS AND CURRENT CAPACITY")
for nm, p in (("TOP", gtl), ("BOT", gbl)):
    print(f"  {nm}")
    for d in sorted(trace_widths(p)):
        print(f"    {d:6.4f} mm  x{trace_widths(p)[d]:5d}   "
              f"IPC-2221 1oz/10C ext = {ipc2221(d,1.0,10.0):5.2f} A   "
              f"2oz = {ipc2221(d,2.0,10.0):5.2f} A")

tl, bl = flashes_pos(gtl), flashes_pos(gbl)


def inb(x, y):
    return BX0 - 1 <= x <= BX1 + 1 and BY0 - 1 <= y <= BY1 + 1


tv = {(round(x, 2), round(y, 2)) for k, p, x, y in tl if k == 'C' and p and p[0] <= 1.05 and inb(x, y)}
bv = {(round(x, 2), round(y, 2)) for k, p, x, y in bl if k == 'C' and p and p[0] <= 1.05 and inb(x, y)}
vias = sorted(tv | bv)
print(f"\nSECTION 2 - VIAS")
print(f"  small round pads (<=1.05mm) on board: TOP {len(tv)}, BOT {len(bv)}, union {len(vias)}")
print(f"  vias present on BOTH layers (real through vias): {len(tv & bv)}")

print(f"\nSECTION 3 - LARGE PADS AND VIA COVERAGE")
big = []
for k, p, x, y in tl:
    if not inb(x, y) or not p:
        continue
    w = p[0]; h = p[1] if len(p) > 1 else p[0]
    if w * h >= 3.0:
        big.append((x, y, w, h))
seen = set()
for x, y, w, h in sorted(big, key=lambda r: -r[2] * r[3]):
    key = (round(x, 1), round(y, 1))
    if key in seen:
        continue
    seen.add(key)
    n = sum(1 for vx, vy in vias if abs(vx - x) <= w/2 + 0.5 and abs(vy - y) <= h/2 + 0.5)
    mark = ''
    if w * h >= 8.0 and n < 4:
        mark = '  <== NO THERMAL VIAS'
    print(f"  X{x:8.2f} Y{y:9.2f}  {w:5.2f}x{h:5.2f} mm = {w*h:5.1f} mm2   vias under: {n:2d}{mark}")

print(f"\nSECTION 4 - VIA SPATIAL MAP")
cols, rows = 108, 24
grid = [[' '] * cols for _ in range(rows)]
for x, y, w, h in big:
    if w * h >= 8.0:
        c = int((x - BX0) / BW * (cols - 1)); r = int((BY1 - y) / BH * (rows - 1))
        if 0 <= c < cols and 0 <= r < rows:
            grid[r][c] = 'P'
for vx, vy in vias:
    c = int((vx - BX0) / BW * (cols - 1)); r = int((BY1 - vy) / BH * (rows - 1))
    if 0 <= c < cols and 0 <= r < rows:
        grid[r][c] = '*' if grid[r][c] == 'P' else 'o'
print("  'P' = big power pad (>=8mm2), 'o' = via, '*' = via inside a big pad")
for r in grid:
    print('   |' + ''.join(r) + '|')
