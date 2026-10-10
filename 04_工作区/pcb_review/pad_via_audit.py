"""Find large component pads (MOSFET / shunt / LDO) and check via coverage under them."""
import re, os, sys, math
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber_strict import parse, scan

BOARD = (249.047, 358.140, -100.965, -49.911)
BX0, BX1, BY0, BY1 = BOARD


def flashes_with_pos(path):
    raw, div, aps = parse(path)
    out = []
    cur = None
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith(('G04', '%', 'G36', 'G37')):
            continue
        m = re.match(r'^(?:G0?[123])?(?:X(-?\d+))?(?:Y(-?\d+))?(?:I(-?\d+))?(?:J(-?\d+))?D0?([123])', line, re.I)
        if not m or m.group(4) is None:
            s = re.fullmatch(r'(?:G5?4)?D(\d+)\*?', line, re.I)
            if s and int(s.group(1)) >= 10:
                cur = int(s.group(1))
            continue
        if int(m.group(4)) == 3 and m.group(1) and m.group(2) and cur is not None:
            kind, prm = aps.get(cur, ('?', []))
            out.append((cur, kind, prm, int(m.group(1)) / div, int(m.group(2)) / div))
        tail = line[m.end():].replace('*', '').strip()
        if tail.isdigit():
            cur = int(tail)
    return out


def main(gtl, gbl, drl):
    # gather vias (small round pads present on BOTH layers)
    def small_round(p):
        return {(round(x, 2), round(y, 2)): d
                for code, kind, prm, x, y in flashes_with_pos(p)
                if kind == 'C' and prm and prm[0] <= 1.05}
    tv, bv = small_round(gtl), small_round(gbl)
    vias = sorted(set(tv) & set(bv))
    print(f"vias (small round pads on BOTH layers): {len(vias)}")

    # large pads = big rectangles/circles
    print()
    print("LARGE PADS (any dimension >= 1.5 mm):")
    pads = []
    for code, kind, prm, x, y in flashes_with_pos(gtl):
        if not prm:
            continue
        big = max(prm[:2]) if len(prm) >= 2 else prm[0]
        if big >= 1.5:
            pads.append((x, y, kind, prm))
    for x, y, kind, prm in sorted(pads, key=lambda p: -max(p[3][:2])):
        w = prm[0]; h = prm[1] if len(prm) > 1 else prm[0]
        # count vias inside this pad footprint
        cnt = sum(1 for (vx, vy), d in tv.items()
                  if abs(vx - x) <= w / 2 + 0.4 and abs(vy - y) <= h / 2 + 0.4)
        da = sum(1 for (vx, vy) in vias
                 if abs(vx - x) <= w / 2 + 0.4 and abs(vy - y) <= h / 2 + 0.4)
        flag = ''
        if w * h >= 4.0 and da < 4:
            flag = '   <<< NO THERMAL VIA ARRAY'
        print(f"   X{x:8.2f} Y{y:9.2f}  {kind} {w:6.2f}x{h:5.2f} mm  "
              f"vias(top)={cnt:2d} vias(both)={da:2d}{flag}")
    print()

    # map vias vs large pads
    print("PAD/VIA MAP  (P = large pad >= 4 mm^2, o = via, * = both)")
    cols, rows = 108, 26
    grid = [[' '] * cols for _ in range(rows)]
    def put(x, y, ch):
        if not (BX0 <= x <= BX1 and BY0 <= y <= BY1):
            return
        c = int((x - BX0) / (BX1 - BX0) * (cols - 1))
        r = int((BY1 - y) / (BY1 - BY0) * (rows - 1))
        old = grid[r][c]
        grid[r][c] = '*' if (old != ' ' and old != ch) else ch
    for x, y, kind, prm in pads:
        w = prm[0]; h = prm[1] if len(prm) > 1 else prm[0]
        if w * h >= 4.0:
            put(x, y, 'P')
    for vx, vy in vias:
        put(vx, vy, 'o')
    for r in grid:
        print('   |' + ''.join(r) + '|')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
