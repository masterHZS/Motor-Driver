"""Connected-component analysis of a rasterized copper layer."""
import sys, os
from collections import deque, Counter
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
            q = deque([s])
            lab[s] = cur
            while q:
                i = q.popleft()
                n += 1
                y, x = divmod(i, W)
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W:
                        j = ny * W + nx
                        if buf[j] and not lab[j]:
                            lab[j] = cur
                            q.append(j)
            sizes.append(n)
    return lab, sizes


def main(path, ppm=8.0):
    ras, nf, ns, dims = render(path, ppm)
    W, H = ras.W, ras.H
    tot = W * H
    mm2 = 1.0 / (ppm * ppm)
    lab, sizes = label(ras)
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i])

    print(f"=== {os.path.basename(path)} ===")
    print(f"board {dims[0]:.1f} x {dims[1]:.1f} mm   raster {W}x{H} @{ppm}px/mm")
    print(f"total copper {100.0*sum(sizes)/tot:.1f}%   isolated regions: {len(sizes)}")
    print("largest 12 regions:")
    for k in order[:12]:
        n = sizes[k]
        # bounding box of this region
        ys = [i // W for i in range(tot) if lab[i] == k + 1]
        xs = [i % W for i in range(tot) if lab[i] == k + 1]
        bx = (max(xs) - min(xs)) / ppm
        by = (max(ys) - min(ys)) / ppm
        print(f"   {n*mm2:9.1f} mm^2  ({100.0*n/tot:5.2f}%)  bbox {bx:6.1f} x {by:6.1f} mm")
    # area distribution buckets
    b = Counter()
    for n in sizes:
        a = n * mm2
        if a >= 1000: b['>=1000 mm2'] += 1
        elif a >= 100: b['100-1000'] += 1
        elif a >= 10: b['10-100'] += 1
        elif a >= 1: b['1-10'] += 1
        else: b['<1'] += 1
    print("region area histogram:", dict(b))
    print()


if __name__ == '__main__':
    for p in sys.argv[1:]:
        main(p, 8.0)
