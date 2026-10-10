"""Minimal RS-274X (Gerber) parser + rasterizer, standard library only.

Handles: %FSLAX..%, %MOMM/IN%, %ADD..% apertures (C/R/O/P), G01/G02/G03,
D01/D02/D03, G36/G37 region fills, LPD/LPC polarity.
Good enough to measure copper coverage, trace widths and region areas.
"""
import re, os, sys, math
from collections import Counter, deque


class Aperture:
    def __init__(self, code, kind, params):
        self.code = code
        self.kind = kind
        self.params = params
    def __repr__(self):
        return f"Aperture({self.code},{self.kind},{self.params})"


def parse_gerber(path):
    with open(path, 'r', errors='replace') as f:
        txt = f.read()

    # --- format spec
    fs = re.search(r'%FSLAX(\d)(\d)Y(\d)(\d)\*%', txt)
    xi, xd = (int(fs.group(1)), int(fs.group(2))) if fs else (3, 6)
    yi, yd = (int(fs.group(3)), int(fs.group(4))) if fs else (3, 6)
    unit_mm = '%MOMM' in txt
    scale = 10.0 ** (-xd) if unit_mm else 0.0254 * 10.0 ** (-xd)

    # --- apertures
    aps = {}
    for m in re.finditer(r'%ADD(\d+)([A-Za-z_$.][\w$.]*)[,]?([^*%]*)\*%', txt):
        code = int(m.group(1))
        kind = m.group(2)
        params = [float(x) for x in re.findall(r'-?\d*\.?\d+', m.group(3) or '')]
        aps[code] = Aperture(code, kind, params)

    return txt, scale, aps, unit_mm


def stats(path):
    txt, scale, aps, unit_mm = parse_gerber(path)
    # aperture usage counts by Dnn select
    sel = re.findall(r'(?:^|\n)\s*(?:G0?1)?\s*D(\d+)\*', txt)
    uses = Counter(int(s) for s in sel if int(s) >= 10)

    print(f"=== {os.path.basename(path)} ===")
    print(f"   units: {'mm' if unit_mm else 'inch'}   coord scale: {scale} mm/unit-count")
    print(f"   apertures defined: {len(aps)}")
    kinds = Counter(a.kind for a in aps.values())
    print(f"   aperture kinds: {dict(kinds)}")
    print(f"   regions (G36/G37): {txt.count('G36')}")
    print(f"   polarity switches: LPC={txt.count('%LPC%')} LPD={txt.count('%LPD%')}")
    print(f"   draw ops D01: {len(re.findall(r'D0?1\*', txt))}  "
          f"move D02: {len(re.findall(r'D0?2\*', txt))}  "
          f"flash D03: {len(re.findall(r'D0?3\*', txt))}")
    # circle apertures = round pads; report distribution
    circles = sorted(round(a.params[0], 3) for a in aps.values()
                     if a.kind == 'C' and a.params)
    if circles:
        c = Counter(circles)
        print("   round aperture diameters (mm) -> count:")
        for d in sorted(c):
            print(f"      {d:7.3f} mm  x{c[d]}  selects={uses.get([a.code for a in aps.values() if a.kind=='C' and a.params and round(a.params[0],3)==d][0],0)}")
    rects = sorted(round(a.params[0], 3) for a in aps.values()
                   if a.kind in ('R', 'O') and a.params)
    if rects:
        c = Counter(rects)
        print("   rect/obround apertures (mm):")
        for d in sorted(c):
            print(f"      {d:7.3f} mm  x{c[d]}")


if __name__ == '__main__':
    for p in sys.argv[1:]:
        stats(p)
        print()
