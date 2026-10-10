"""Rasterize a PCB copper-layer PDF using only the Python standard library.

Parses the page content stream (path construction + graphics state ops),
flattens Bezier curves, and scanline-fills polygons (nonzero winding rule).
Units are millimetres; the PDF MediaBox is the board area.
"""
import re, sys, zlib, os, math

# ---------------------------------------------------------------- PDF plumbing

def get_content(path):
    with open(path, 'rb') as f:
        data = f.read()
    m = re.search(rb'<<(.*?)>>\s*stream\r?\n', data, re.S)
    if not m:
        raise SystemExit('no stream found in ' + path)
    d = m.group(1)
    start = m.end()
    end = data.find(b'endstream', start)
    raw = data[start:end]
    if b'FlateDecode' in d:
        raw = zlib.decompress(raw)
    return raw


NUM = re.compile(rb'-?\d*\.?\d+(?:[eE][-+]?\d+)?')

def tokenize(s):
    """Yield tokens: floats and operator words."""
    i, n = 0, len(s)
    while i < n:
        c = s[i:i+1]
        if c in b' \t\r\n':
            i += 1
            continue
        if c == b'%':
            j = s.find(b'\n', i)
            i = n if j < 0 else j + 1
            continue
        m = NUM.match(s, i)
        if m and not (c.isalpha() and c not in b'eE'):
            yield float(m.group())
            i = m.end()
            continue
        if c.isalpha() or c in b'"\'':
            j = i
            while j < n and (s[j:j+1].isalpha() or s[j:j+1] == b'*'):
                j += 1
            yield s[i:j].decode('latin1')
            i = j
            continue
        # single-char operator
        yield s[i:i+1].decode('latin1')
        i += 1


# ---------------------------------------------------------------- rasterizer

class Raster:
    def __init__(self, w_mm, h_mm, ppm):
        self.ppm = ppm
        self.W = int(round(w_mm * ppm))
        self.H = int(round(h_mm * ppm))
        self.buf = bytearray(self.W * self.H)   # 0 = no copper, 1 = copper
        # coverage kind: 1 = filled (pour/pad), 2 = stroked (trace)
        self.kind = bytearray(self.W * self.H)
        self.h_mm = h_mm

    def _dev(self, x, y):
        """PDF mm coords -> pixel coords (y flipped)."""
        return x * self.ppm, (self.h_mm - y) * self.ppm

    def fill_poly(self, pts, val=1):
        if len(pts) < 3:
            return
        W, H, ppm = self.W, self.H, self.ppm
        dev = [self._dev(x, y) for x, y in pts]
        ys = [p[1] for p in dev]
        y0 = max(0, int(math.floor(min(ys))))
        y1 = min(H - 1, int(math.ceil(max(ys))))
        n = len(dev)
        for py in range(y0, y1 + 1):
            yc = py + 0.5
            xs = []
            for i in range(n):
                x1, y1_ = dev[i]
                x2, y2_ = dev[(i + 1) % n]
                if y1_ == y2_:
                    continue
                if (y1_ <= yc < y2_) or (y2_ <= yc < y1_):
                    t = (yc - y1_) / (y2_ - y1_)
                    xs.append(x1 + t * (x2 - x1))
            if not xs:
                continue
            xs.sort()
            for k in range(0, len(xs) - 1, 2):
                a = max(0, int(math.ceil(xs[k] - 0.5)))
                b = min(W - 1, int(math.floor(xs[k + 1] - 0.5)))
                base = py * W
                for px in range(a, b + 1):
                    self.buf[base + px] = 1
                    self.kind[base + px] = val

    def stroke_poly(self, pts, width_mm, closed=False):
        if len(pts) < 2:
            return
        r = max(width_mm / 2.0, 0.5 / self.ppm)
        seq = list(pts) + ([pts[0]] if closed else [])
        for i in range(len(seq) - 1):
            (x1, y1), (x2, y2) = seq[i], seq[i + 1]
            dx, dy = x2 - x1, y2 - y1
            L = math.hypot(dx, dy)
            if L < 1e-9:
                continue
            nx, ny = -dy / L * r, dx / L * r
            self.fill_poly([(x1 + nx, y1 + ny), (x2 + nx, y2 + ny),
                            (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)], val=2)


def flatten(p0, p1, p2, p3, steps=8):
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3*p0[0] + 3*mt*mt*t*p1[0] + 3*mt*t*t*p2[0] + t**3*p3[0]
        y = mt**3*p0[1] + 3*mt*mt*t*p1[1] + 3*mt*t*t*p2[1] + t**3*p3[1]
        out.append((x, y))
    return out


def render(path, ppm=8.0):
    content = get_content(path)
    m = re.search(rb'/MediaBox\s*\[([^\]]*)\]', content)
    if not m:
        # MediaBox may be in the stream dict; fall back
        with open(path, 'rb') as f:
            head = f.read(4000)
        m = re.search(rb'/MediaBox\s*\[([^\]]*)\]', head)
    box = [float(x) for x in NUM.findall(m.group(1))]
    x0, y0, x1, y1 = box
    w_mm, h_mm = x1 - x0, y1 - y0
    ras = Raster(w_mm, h_mm, ppm)

    st = dict(ctm=[1, 0, 0, 1, 0, 0], lw=0.15, fill_gray=0.0,
              stroke_gray=0.0, clip=None)
    stack = []
    cur = []          # current path points
    start = None
    subpaths = []     # finished subpaths of current path object

    def mul(a, b):
        a0,a1,a2,a3,a4,a5 = a
        b0,b1,b2,b3,b4,b5 = b
        return [a0*b0+a2*b1, a1*b0+a3*b1,
                a0*b2+a2*b3, a1*b2+a3*b3,
                a0*b4+a2*b5+a4, a1*b4+a3*b5+a5]

    def tf(pt):
        x, y = pt
        c = st['ctm']
        return (c[0]*x + c[2]*y + c[4], c[1]*x + c[3]*y + c[5])

    args = []
    drawn_fill = drawn_stroke = 0
    for tok in tokenize(content):
        if isinstance(tok, float):
            args.append(tok)
            continue
        op = tok
        if op == 'q':
            stack.append(dict(st))
        elif op == 'Q':
            if stack:
                st = stack.pop()
        elif op == 'cm':
            if len(args) >= 6:
                st['ctm'] = mul(st['ctm'], args[-6:])
        elif op == 'w':
            if args:
                st['lw'] = args[-1]
        elif op == 'g':
            if args:
                st['fill_gray'] = st['stroke_gray'] = args[-1]
        elif op == 'G':
            if args:
                st['stroke_gray'] = args[-1]
        elif op == 'rg' or op == 'RG':
            if len(args) >= 3:
                g = (args[-3] + args[-2] + args[-1]) / 3.0
                if op == 'rg':
                    st['fill_gray'] = g
                else:
                    st['stroke_gray'] = g
        elif op == 'm':
            if len(args) >= 2:
                if cur:
                    subpaths.append((cur, False))
                cur = [tf(args[-2:])]
                start = cur[0]
        elif op == 'l':
            if len(args) >= 2 and cur:
                cur.append(tf(args[-2:]))
        elif op == 'c':
            if len(args) >= 6 and cur:
                p1 = tf(args[-6:-4]); p2 = tf(args[-4:-2]); p3 = tf(args[-2:])
                cur.extend(flatten(cur[-1], p1, p2, p3))
        elif op == 'v':
            if len(args) >= 4 and cur:
                p2 = tf(args[-4:-2]); p3 = tf(args[-2:])
                cur.extend(flatten(cur[-1], cur[-1], p2, p3))
        elif op == 'y':
            if len(args) >= 4 and cur:
                p1 = tf(args[-4:-2]); p3 = tf(args[-2:])
                cur.extend(flatten(cur[-1], p1, p3, p3))
        elif op == 'h':
            if cur and start:
                cur.append(start)
        elif op in ('f', 'F', 'f*', 'b', 'b*', 'B', 'B*'):
            if cur:
                subpaths.append((cur, True))
            dark = st['fill_gray'] < 0.5
            if dark:
                for pts, _ in subpaths:
                    if len(pts) >= 3:
                        ras.fill_poly(pts, val=1)
                        drawn_fill += 1
            cur, start, subpaths = [], None, []
        elif op in ('S', 's'):
            if cur:
                if op == 's' and start:
                    cur.append(start)
                subpaths.append((cur, op == 's'))
            if st['stroke_gray'] < 0.5:
                for pts, cl in subpaths:
                    ras.stroke_poly(pts, st['lw'], cl)
                    drawn_stroke += 1
            cur, start, subpaths = [], None, []
        elif op in ('n', 'W', 'W*'):
            if op == 'n':
                cur, start, subpaths = [], None, []
        elif op in ('re',):
            if len(args) >= 4:
                x, y, w, h = args[-4:]
                pts = [tf((x, y)), tf((x + w, y)), tf((x + w, y + h)), tf((x, y + h))]
                subpaths.append((pts, True))
                cur = pts
        elif op in ('BT', 'ET', 'Tf', 'TL', 'Tm', 'Td', 'TD', 'Tj', 'TJ', 'Tc', 'Tw', 'Tz', 'Ts', 'Tr'):
            if op in ('BT',):
                pass
        args = []
    return ras, drawn_fill, drawn_stroke, (w_mm, h_mm)


if __name__ == '__main__':
    path = sys.argv[1]
    ppm = float(sys.argv[2]) if len(sys.argv) > 2 else 8.0
    ras, nf, ns, dims = render(path, ppm)
    tot = ras.W * ras.H
    cop = sum(ras.buf)
    # copper split by kind
    filled = sum(1 for i in range(tot) if ras.kind[i] == 1)
    stroked = sum(1 for i in range(tot) if ras.kind[i] == 2)
    print(f"file      : {os.path.basename(path)}")
    print(f"board     : {dims[0]:.2f} x {dims[1]:.2f} mm")
    print(f"raster    : {ras.W} x {ras.H} px @ {ppm} px/mm")
    print(f"fills     : {nf}   strokes: {ns}")
    print(f"copper    : {cop} px = {100.0*cop/tot:.1f}% of board")
    print(f"  filled  : {100.0*filled/tot:.1f}%   stroked(trace): {100.0*stroked/tot:.1f}%")
