"""Dump coordinate extents and G36 region shapes/extents from a Gerber."""
import re, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber_stats import parse_gerber


def dump(path):
    txt, scale, aps, unit_mm = parse_gerber(path)
    print(f"=== {os.path.basename(path)} ===")
    xs, ys = [], []
    for m in re.finditer(r'X(-?\d+)Y(-?\d+)', txt):
        xs.append(int(m.group(1)) * scale)
        ys.append(int(m.group(2)) * scale)
    print(f"   coord count: {len(xs)}")
    print(f"   X range: {min(xs):10.3f} .. {max(xs):10.3f}  (span {max(xs)-min(xs):.2f} mm)")
    print(f"   Y range: {min(ys):10.3f} .. {max(ys):10.3f}  (span {max(ys)-min(ys):.2f} mm)")

    # split content into G36..G37 regions, report each region's bbox and vertex count
    body = txt
    regions = []
    for m in re.finditer(r'G36\*(.*?)G37\*', body, re.S):
        seg = m.group(1)
        pts = [(int(a) * scale, int(b) * scale)
               for a, b in re.findall(r'X(-?\d+)Y(-?\d+)', seg)]
        if not pts:
            continue
        rx = [p[0] for p in pts]; ry = [p[1] for p in pts]
        regions.append((len(pts), min(rx), max(rx), min(ry), max(ry),
                        (max(rx)-min(rx)) * (max(ry)-min(ry))))
    print(f"   G36 regions: {len(regions)}")
    for i, (n, x0, x1, y0, y1, bb) in enumerate(sorted(regions, key=lambda r: -r[5])[:8]):
        print(f"     region[{i}] verts={n:5d}  X {x0:8.2f}..{x1:8.2f}  "
              f"Y {y0:8.2f}..{y1:8.2f}  span {x1-x0:7.2f} x {y1-y0:7.2f} mm  bbox {bb:9.1f} mm^2")

    # aperture selects actually used for draws, weighted by op count
    from collections import Counter
    cur = None
    usage = Counter()
    for m in re.finditer(r'([^*%]*)\*', txt):
        blk = m.group(1).strip()
        s = re.fullmatch(r'(?:G0?1)?\s*D(\d+)', blk, re.I)
        if s and int(s.group(1)) >= 10:
            cur = int(s.group(1))
            continue
        if re.search(r'D0?1\*?$', blk) and cur:
            usage[cur] += 1
    print("   apertures actually used for draws (D01), by aperture:")
    for code, n in usage.most_common(20):
        a = aps.get(code)
        if a:
            print(f"      D{code:<3d} {a.kind} {a.params}  draws={n}")
    print()


if __name__ == '__main__':
    for p in sys.argv[1:]:
        dump(p)
