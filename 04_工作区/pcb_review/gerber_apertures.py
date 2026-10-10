"""Correct aperture bookkeeping: per-aperture draw counts and flash counts.

Also: locate vias (flash-only circular apertures) and check thermal-via clusters.
"""
import re, os, sys, math
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber2 import parse, CMDRE

BOARD = (249.047, 358.140, -100.965, -49.911)


def audit(path):
    txt, div, aps, nareas = parse(path)
    cur = None
    draws = Counter()
    flashes = Counter()
    width_by_draw = Counter()
    for mm in CMDRE.finditer(txt):
        blk = mm.group(1).strip()
        if not blk or blk.startswith('G04'):
            continue
        sm = re.fullmatch(r'(?:G0?[123])?\s*D(\d+)', blk)
        if sm:
            c = int(sm.group(1))
            if c >= 10:
                cur = c
            continue
        cm = re.search(r'X(-?\d+)?Y(-?\d+)?(?:I(-?\d+))?(?:J(-?\d+))?D0?([123])', blk)
        if not cm:
            continue
        op = int(cm.group(5))
        if cur is None:
            continue
        if op == 1:
            draws[cur] += 1
        elif op == 3:
            flashes[cur] += 1

    print(f"=== {os.path.basename(path)} ===")
    print(f"   {'ap':>5}  {'kind':>2}  {'params (mm)':<28} {'draws':>6} {'flashes':>8}")
    for code in sorted(set(list(draws) + list(flashes))):
        kind, prm = aps.get(code, ('?', []))
        print(f"   D{code:<4}  {kind:>2}  {str(prm):<28} {draws[code]:>6} {flashes[code]:>8}")
    print()
    # pure-via apertures = circle/rect used ONLY for flashing, never drawing
    via_aps = [c for c in flashes if draws.get(c, 0) == 0]
    print(f"   flash-only apertures (candidate vias/TH pads): {via_aps}")
    for c in via_aps:
        kind, prm = aps.get(c, ('?', []))
        print(f"      D{c}: {kind} {prm}  -> {flashes[c]} flashes")
    print()


if __name__ == '__main__':
    for p in sys.argv[1:]:
        audit(p)
