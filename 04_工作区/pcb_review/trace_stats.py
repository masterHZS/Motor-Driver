"""Trace-width histogram + via count + wide-trace map for a copper layer."""
import sys, os, re, zlib
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import raster_pdf as R


def content_of(path):
    while True:
        c = R.get_content(path)
        if not c.lstrip().startswith(b'<<'):
            return c
        # stream content was itself a dict; unlikely here
        return c


def trace_stats(path):
    content = R.get_content(path)
    widths = Counter()
    args = []
    cur = None
    for tok in R.tokenize(content):
        if isinstance(tok, float):
            args.append(tok); continue
        op = tok
        if op == 'w' and args:
            cur = round(args[-1], 3)
        elif op in ('S', 's') and cur is not None:
            widths[cur] += 1
        elif op in ('m', 'l', 'c', 're', 'f', 'F', 'B', 'b'):
            pass
        args = []
    return widths


def wide_map(path, minw=1.5, cols=78, ppm=8.0):
    """Rasterize only strokes wider than minw mm."""
    ras, _, _, dims = R.render(path, ppm)
    W, H = ras.W, ras.H
    # re-render manually keeping only wide strokes
    ras2 = R.Raster(dims[0], dims[1], ppm)
    content = R.get_content(path)
    st = dict(ctm=[1,0,0,1,0,0], lw=0.15, sg=0.0, fg=0.0)
    stack = []; cur = []; start = None; args = []

    def mul(a,b):
        return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
                a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
                a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]
    def tf(pt):
        c = st['ctm']
        return (c[0]*pt[0]+c[2]*pt[1]+c[4], c[1]*pt[0]+c[3]*pt[1]+c[5])

    for tok in R.tokenize(content):
        if isinstance(tok, float):
            args.append(tok); continue
        op = tok
        if op == 'q': stack.append(dict(st))
        elif op == 'Q':
            if stack: st = stack.pop()
        elif op == 'cm' and len(args) >= 6: st['ctm'] = mul(st['ctm'], args[-6:])
        elif op == 'w' and args: st['lw'] = args[-1]
        elif op == 'G' and args: st['sg'] = args[-1]
        elif op == 'g' and args: st['sg'] = st['fg'] = args[-1]
        elif op == 'RG' and len(args) >= 3: st['sg'] = sum(args[-3:])/3
        elif op == 'm' and len(args) >= 2:
            if cur: pass
            cur = [tf(args[-2:])]; start = cur[0]
        elif op == 'l' and len(args) >= 2 and cur: cur.append(tf(args[-2:]))
        elif op == 'c' and len(args) >= 6 and cur:
            p1=tf(args[-6:-4]); p2=tf(args[-4:-2]); p3=tf(args[-2:])
            cur.extend(R.flatten(cur[-1], p1, p2, p3))
        elif op == 'h' and cur and start: cur.append(start)
        elif op in ('S','s'):
            if op == 's' and start: cur.append(start)
            if st['sg'] < 0.5 and st['lw'] >= minw and len(cur) >= 2:
                ras2.stroke_poly(cur, st['lw'], closed=(op=='s'))
            cur = []; start = None
        elif op in ('f','F','B','b'):
            cur = []; start = None
        args = []

    rows = int(cols * H / W / 2.1)
    print(f"--- strokes >= {minw} mm on {os.path.basename(path)} ---")
    for r in range(rows):
        y0=int(r*H/rows); y1=max(y0+1,int((r+1)*H/rows))
        line=[]
        for c in range(cols):
            x0=int(c*W/cols); x1=max(x0+1,int((c+1)*W/cols))
            hit=0
            for y in range(y0,y1,2):
                b=y*W
                for x in range(x0,x1,2):
                    if ras2.buf[b+x]: hit+=1
            line.append('#' if hit>=3 else ('+' if hit else ' '))
        print('|'+''.join(line)+'|')
    print()


if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(f"=== stroke widths: {os.path.basename(p)} ===")
        w = trace_stats(p)
        for k in sorted(w):
            print(f"   {k:6.3f} mm : {w[k]:4d} strokes")
        print()
