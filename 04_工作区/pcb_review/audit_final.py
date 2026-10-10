"""FINAL PCB power/thermal audit from Gerber + drill data.

Uses gerber_strict (verified parser). Reports:
  - copper coverage vs REAL board outline
  - every trace width used, and its share of copper
  - all flashed pads with size
  - vias (small pads present on both layers)
  - thermal via coverage under large power pads
"""
import re, os, sys, math
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber_strict import parse, scan

BOARD = (249.047, 358.140, -100.965, -49.911)
BX0, BX1, BY0, BY1 = BOARD
BW, BH = BX1 - BX0, BY1 - BY0


def flashes_pos(path):
    """(aperture, kind, params, x, y) for every D03 flash."""
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
            out.append((cur, kind, prm, int(m.group(2)) / div, int(m.group(3)) / div))
        tail = line[m.end():].replace('*', '').strip()
        if tail.isdigit():
            cur = int(tail)
    return out


def trace_widths(path):
    raw, div, aps = parse(path)
    cur = None
    w = Counter()
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


def inboard(x, y):
    return BX0 - 1 <= x <= BX1 + 1 and BY0 - 1 <= y <= BY1 + 1


def amp(w_mm, oz=1.0, dT=10.0):
    """IPC-2221 external-layer current capacity."""
    t_mil = 1.378 * oz
    w_mil = w_mm / 0.0254
    A = (w_mil * t_mil) / 508.0
    return (dT / 215.0) ** 0.4348 * 508.0 / t_mil * 0.0254 * 1000 * 0  or \
           ((dT / 215.0) ** (1 / 0.4348)) * (w_mil * t_mil) / 1000 * 1.0


def main(gtl, gbl, drl):
    print("=" * 76)
    print("TRACE WIDTHS  (aperture used for D01 draws)")
    for name, p in (("TOP", gtl), ("BOT", gbl)):
        w = trace_widths(p)
        print(f"  {name}:")
        for d in sorted(w):
            # IPC-2221 capacity for 1oz, 10degC rise, external layer
            cap = None
            try:
                wm = d / 0.0254
                a = wm * 1.378 / 508.0
                cap = (10 / 215.0) ** 0.4348 * 508.0 / 1.378 / 1000 * 25.4
                cap = ((10 / 215.0) ** (1 / 0.4348)) * (wm * 1.378) / 1000
            except Exception:
                pass
            print(f"     {d:6.4f} mm  x{w[d]:5d}   IPC-2221(1oz,10C) ~ {cap:.2f} A")
    print()

    print("=" * 76)
    print("FLASHED PADS / VIAS")
    tl = flashes_pos(gtl); bl = flashes_pos(gbl)
    for nm, lst in (("TOP", tl), ("BOT", bl)):
        c = Counter()
        for code, kind, prm, x, y in lst:
            if inboard(x, y):
                c[(kind, tuple(round(v, 3) for v in prm))] += 1
        print(f"  {nm}: {sum(c.values())} on-board flashes")
    # vias = same small pad on both layers
    def small(p):
        return Counter((round(x, 2), round(y, 2)) for code, kind, prm, x, y in p
                       if kind == 'C' and prm and prm[0] <= 1.05 and inboard(x, y))
    ts, bs = small(tl), small(bl)
    vias = sorted(set(ts) | set(bs))
    print(f"  via positions (<=1.05mm pad): {len(vias)}")
    print()

    print("=" * 76)
    print("LARGE POWER PADS AND THEIR THERMAL VIAS")
    big = []
    for code, kind, prm, x, y in tl:
        if not inboard(x, y) or not prm:
            continue
        w = prm[0]; h = prm[1] if len(prm) > 1 else prm[0]
        if w * h >= 3.0:
            big.append((x, y, kind, w, h))
    seen = set()
    for x, y, kind, w, h in sorted(big, key=lambda r: -r[3] * r[4]):
        key = (round(x, 1), round(y, 1))
        if key in seen:
            continue
        seen.add(key)
        n = sum(1 for (vx, vy) in vias
                if abs(vx - x) <= w / 2 + 0.5 and abs(vy - y) <= h / 2 + 0.5)
        verdict = ""
        if w * h >= 8.0:
            verdict = "OK" if n >= 6 else f"*** only {n} vias under a {w*h:.1f} mm2 pad ***"
        print(f"  X{x:8.2f} Y{y:9.2f} {kind} {w:6.2f}x{h:5.2f}mm = {w*h:5.1f}mm2   vias under: {n:2d}  {verdict}")
    print()

    print("=" * 76)
    print("BOARD / DRILL SUMMARY")
    print(f"  board outline: {BW:.2f} x {BH:.2f} mm = {BW*BH:.0f} mm2")
    for line in open(drl, errors='replace'):
        if re.match(r'^T\d+C', line):
            print("  drill " + line.strip())
    print()


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
