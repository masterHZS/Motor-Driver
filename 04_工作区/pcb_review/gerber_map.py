"""Spatial ASCII map of a Gerber copper layer, highlighting filled regions."""
import re, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber_render import render_gerber


def main(path, cols=100, ppm=6.0):
    ras, bbox, scale = render_gerber(path, ppm)
    W, H = ras.W, ras.H
    print(f"=== {os.path.basename(path)} ===  bbox {bbox[2]:.1f} x {bbox[3]:.1f} mm")
    print("legend: '#'=filled region (pour/pad)   '.'=traced copper   ' '=bare")
    rows = int(cols * H / W / 2.1)
    for r in range(rows):
        y0 = int(r * H / rows); y1 = max(y0 + 1, int((r + 1) * H / rows))
        line = []
        for c in range(cols):
            x0 = int(c * W / cols); x1 = max(x0 + 1, int((c + 1) * W / cols))
            fill = trace = 0
            for y in range(y0, y1, 2):
                b = y * W
                for x in range(x0, x1, 2):
                    k = ras.kind[b + x]
                    if k == 1: fill += 1
                    elif k == 2: trace += 1
            line.append('#' if fill >= 2 else ('.' if (fill or trace) else ' '))
        print('|' + ''.join(line) + '|')
    print()


if __name__ == '__main__':
    for a in sys.argv[1:]:
        main(a, 100, 6.0)
