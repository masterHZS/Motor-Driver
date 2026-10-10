"""Spatial ASCII map + per-region location of a copper layer."""
import sys, os
from collections import deque
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from raster_pdf import render


def label(ras):
    W, H = ras.W, ras.H
    buf = ras.buf
    lab = [0] * (W * H)
    sizes = []
    cur = 0
    for s in range(W * H):
        if buf[s] and not lab[s]:
            cur += 1
            n = 0
            q = deque([s]); lab[s] = cur
            while q:
                i = q.popleft(); n += 1
                y, x = divmod(i, W)
                for dy, dx in ((0,1),(0,-1),(1,0),(-1,0)):
                    ny, nx = y+dy, x+dx
                    if 0 <= ny < H and 0 <= nx < W:
                        j = ny*W+nx
                        if buf[j] and not lab[j]:
                            lab[j] = cur; q.append(j)
            sizes.append(n)
    return lab, sizes


def main(path, cols=78, ppm=8.0):
    ras, nf, ns, dims = render(path, ppm)
    W, H = ras.W, ras.H
    lab, sizes = label(ras)
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i])
    # rank lookup: region id -> rank char
    rankchar = {}
    for r, k in enumerate(order):
        rankchar[k+1] = '#' if r == 0 else ('+' if r < 5 else ('.' if r < 20 else ','))

    rows = int(cols * H / W / 2.1)
    print(f"=== {os.path.basename(path)} ===  board {dims[0]:.0f}x{dims[1]:.0f} mm")
    print("legend: '#'=largest region  '+'=2nd-5th  '.'=6th-20th  ','=rest  ' '=no copper")
    for r in range(rows):
        y0 = int(r * H / rows); y1 = max(y0+1, int((r+1) * H / rows))
        line = []
        for c in range(cols):
            x0 = int(c * W / cols); x1 = max(x0+1, int((c+1) * W / cols))
            cnt = {}
            for y in range(y0, y1, 2):
                base = y * W
                for x in range(x0, x1, 2):
                    l = lab[base + x]
                    if l:
                        cnt[l] = cnt.get(l, 0) + 1
            line.append(rankchar[max(cnt, key=cnt.get)] if cnt else ' ')
        print('|' + ''.join(line) + '|')
    print()
    # report the biggest region's spatial extent in mm
    k = order[0] + 1
    xs = [i % W for i in range(W*H) if lab[i] == k]
    ys = [i // W for i in range(W*H) if lab[i] == k]
    print(f"largest region: {sizes[order[0]]/(ppm*ppm):.0f} mm^2, "
          f"x {min(xs)/ppm:.1f}..{max(xs)/ppm:.1f} mm, y {min(ys)/ppm:.1f}..{max(ys)/ppm:.1f} mm")
    print()


if __name__ == '__main__':
    for p in sys.argv[1:]:
        main(p, 78, 8.0)
