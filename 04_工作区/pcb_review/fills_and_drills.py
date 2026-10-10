"""Show ONLY filled polygon regions (pours/pads) per layer, and count drill hits."""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import raster_pdf as R


def fills_map(path, cols=78, ppm=8.0):
    ras, _, _, dims = R.render(path, ppm)
    W, H = ras.W, ras.H
    # keep only kind==1 (filled)
    for i in range(W * H):
        if ras.kind[i] != 1:
            ras.buf[i] = 0
    print(f"--- FILLED areas only (pours/pads): {os.path.basename(path)} ---")
    rows = int(cols * H / W / 2.1)
    for r in range(rows):
        y0 = int(r*H/rows); y1 = max(y0+1, int((r+1)*H/rows))
        line = []
        for c in range(cols):
            x0 = int(c*W/cols); x1 = max(x0+1, int((c+1)*W/cols))
            hit = 0
            for y in range(y0, y1, 2):
                b = y*W
                for x in range(x0, x1, 2):
                    if ras.buf[b+x]:
                        hit += 1
            line.append('#' if hit >= 3 else ('+' if hit else ' '))
        print('|' + ''.join(line) + '|')
    print(f"filled copper = {100.0*sum(ras.buf)/(W*H):.1f}% of board area")
    print()


def drill_hits(path):
    """Count small circular subpaths in the drill drawing (vias + holes)."""
    content = R.get_content(path)
    args = []
    circles = []
    cur = []
    stack = []
    st = [1,0,0,1,0,0]
    def mul(a,b):
        return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
                a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
                a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]
    for tok in R.tokenize(content):
        if isinstance(tok, float):
            args.append(tok); continue
        op = tok
        if op == 'q': stack.append(list(st))
        elif op == 'Q':
            if stack: st = stack.pop()
        elif op == 'cm' and len(args) >= 6: st = mul(st, args[-6:])
        elif op == 'm' and len(args) >= 2: cur = [args[-2:]]
        elif op == 'c' and len(args) >= 6 and cur:
            cur.append(args[-2:])
        elif op in ('f','F','S','s','B','b'):
            if len(cur) >= 4:
                xs = [p[0] for p in cur]; ys = [p[1] for p in cur]
                w = max(xs)-min(xs); h = max(ys)-min(ys)
                # scale by ctm
                sx = (st[0]**2 + st[1]**2) ** 0.5
                circles.append((round(w*sx,2), round(h*sx,2)))
            cur = []
        args = []
    from collections import Counter
    c = Counter(circles)
    print(f"--- drill/hole features in {os.path.basename(path)} : {len(circles)} total ---")
    for k in sorted(c, key=lambda k: -c[k])[:20]:
        print(f"   {k[0]:5.2f} x {k[1]:5.2f} mm  x{c[k]}")
    print()


if __name__ == '__main__':
    fills_map(sys.argv[1]); fills_map(sys.argv[2])
    drill_hits(sys.argv[3])
