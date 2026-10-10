"""Locate vias/TH pads, map their spatial distribution, find thermal clusters."""
import re, os, sys, math
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber_strict import parse, scan

BOARD = (249.047, 358.140, -100.965, -49.911)
BX0, BX1, BY0, BY1 = BOARD


def drill_file(path):
    tools = {}
    hits = defaultdict(list)
    cur = None
    for line in open(path, 'r', errors='replace'):
        line = line.strip()
        m = re.match(r'^T(\d+)C([\d.]+)$', line)
        if m:
            tools[m.group(1)] = float(m.group(2)); continue
        m = re.match(r'^T(\d+)$', line)
        if m:
            cur = m.group(1); continue
        m = re.match(r'^X(-?[\d.]+)Y(-?[\d.]+)$', line)
        if m and cur:
            hits[cur].append((float(m.group(1)), float(m.group(2))))
    return tools, hits


def main(drl, gtl, gbl):
    print("=" * 74)
    print("DRILL FILE")
    tools, hits = drill_file(drl)
    for t in sorted(tools, key=lambda k: int(k)):
        n = len(hits.get(t, []))
        print(f"   T{t}  dia={tools[t]:.4f} mm   x{n}")
    print()

    print("=" * 74)
    print("VIAS / FLASHED PADS  (from copper layers)")
    allv = []
    for name, p in (("TOP", gtl), ("BOT", gbl)):
        aps, draws, flashes, vias = scan(p)
        sz = Counter()
        for code, x, y in vias:
            kind, prm = aps.get(code, ('?', []))
            if kind == 'C' and prm:
                sz[round(prm[0], 3)] += 1
                allv.append((x, y, round(prm[0], 3), name))
        print(f"   {name}: {len(vias)} flashed features")
        for d in sorted(sz):
            print(f"      pad dia {d:6.3f} mm  x{sz[d]}")
    print()

    # in-board only
    inb = [v for v in allv if BX0 <= v[0] <= BX1 and BY0 <= v[1] <= BY1]
    print(f"   total flashed features on board: {len(inb)}")
    print()

    # spatial map of small flashed features (candidate vias, dia <= 1.0 mm)
    small = [v for v in inb if v[2] <= 1.05]
    print("=" * 74)
    print(f"CANDIDATE VIAS (pad <= 1.05 mm): {len(small)}")
    cols, rows = 110, 30
    grid = [[' '] * cols for _ in range(rows)]
    for x, y, d, side in small:
        c = int((x - BX0) / (BX1 - BX0) * (cols - 1))
        r = int((BY1 - y) / (BY1 - BY0) * (rows - 1))
        grid[r][c] = 'o' if grid[r][c] == ' ' else '*'
    for r in grid:
        print('   |' + ''.join(r) + '|')
    print()

    # cluster detection: count vias within 6 mm of each other
    print("=" * 74)
    print("VIA CLUSTERS (>= 4 vias within a 6 mm box) -- thermal/power arrays")
    pts = [(x, y) for x, y, d, s in small]
    used = [False] * len(pts)
    clusters = []
    for i, (x, y) in enumerate(pts):
        if used[i]:
            continue
        grp = [j for j, (a, b) in enumerate(pts)
               if abs(a - x) <= 6 and abs(b - y) <= 6]
        if len(grp) >= 4:
            for j in grp:
                used[j] = True
            gx = [pts[j][0] for j in grp]; gy = [pts[j][1] for j in grp]
            clusters.append((len(grp), min(gx), max(gx), min(gy), max(gy)))
    for n, x0, x1, y0, y1 in sorted(clusters, key=lambda c: -c[0]):
        print(f"   {n:3d} vias   X {x0:7.2f}..{x1:7.2f}  Y {y0:7.2f}..{y1:7.2f}"
              f"   area {x1-x0:5.1f} x {y1-y0:5.1f} mm")
    print()


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
