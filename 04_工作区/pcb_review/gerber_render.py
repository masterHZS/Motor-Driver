"""Rasterize a Gerber copper layer and measure coverage / regions / widths."""
import re, os, sys, math
from collections import Counter, deque
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from raster_pdf import Raster, flatten
from gerber_stats import parse_gerber

CMD = re.compile(r'([^*%]*)\*')


def render_gerber(path, ppm=8.0):
    txt, scale, aps, unit_mm = parse_gerber(path)
    # board bbox from coordinates
    xs, ys = [], []
    for m in re.finditer(r'X(-?\d+)Y(-?\d+)', txt):
        xs.append(int(m.group(1)) * scale)
        ys.append(int(m.group(2)) * scale)
    if not xs:
        raise SystemExit('no coords')
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    W_mm, H_mm = x1 - x0, y1 - y0
    ras = Raster(W_mm, H_mm, ppm)

    cur_ap = None
    pos = (0.0, 0.0)
    interp = 1
    in_region = False
    region_pts = []
    last_ap_select = None

    def P(dx, dy):
        return dx - x0, dy - y0

    for m in CMD.finditer(txt):
        blk = m.group(1).strip()
        if not blk:
            continue
        # aperture select
        s = re.fullmatch(r'(?:G0?1)?\s*D(\d+)', blk, re.I)
        if s:
            code = int(s.group(1))
            if code >= 10:
                cur_ap = aps.get(code)
            continue
        # region start/end
        if re.search(r'G36', blk, re.I):
            in_region = True
            region_pts = []
            continue
        if re.search(r'G37', blk, re.I):
            in_region = False
            if len(region_pts) >= 3:
                ras.fill_poly(region_pts, val=1)
            region_pts = []
            continue
        gm = re.search(r'G0?([123])', blk, re.I)
        if gm:
            interp = int(gm.group(1))
        cm = re.search(r'X(-?\d+)?Y(-?\d+)?(?:I(-?\d+))?(?:J(-?\d+))?D0?([123])', blk, re.I)
        if not cm:
            continue
        nx = int(cm.group(1)) * scale if cm.group(1) else pos[0]
        ny = int(cm.group(2)) * scale if cm.group(2) else pos[1]
        op = int(cm.group(5))
        tgt = P(nx, ny)
        src = P(*pos)
        if op == 2:                       # move
            if in_region and region_pts:
                ras.fill_poly(region_pts, val=1)
                region_pts = []
            if in_region:
                region_pts = [tgt]
            pos = (nx, ny)
            continue
        if op == 1:                       # draw
            if in_region:
                if not region_pts:
                    region_pts = [src]
                if interp == 1:
                    region_pts.append(tgt)
                else:
                    i = int(cm.group(3) or 0) * scale
                    j = int(cm.group(4) or 0) * scale
                    cx, cy = P(pos[0] + i, pos[1] + j)
                    a0 = math.atan2(src[1] - cy, src[0] - cx)
                    a1 = math.atan2(tgt[1] - cy, tgt[0] - cx)
                    r = math.hypot(src[0] - cx, src[1] - cy)
                    if interp == 2:  # CCW
                        while a1 <= a0: a1 += 2 * math.pi
                    else:            # CW
                        while a1 >= a0: a1 -= 2 * math.pi
                    n = max(2, int(abs(a1 - a0) * r * ppm / 2))
                    for k in range(1, n + 1):
                        a = a0 + (a1 - a0) * k / n
                        region_pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
            else:
                w = cur_ap.params[0] if (cur_ap and cur_ap.params) else 0.15
                if interp == 1:
                    ras.stroke_poly([src, tgt], w)
                else:
                    i = int(cm.group(3) or 0) * scale
                    j = int(cm.group(4) or 0) * scale
                    cx, cy = P(pos[0] + i, pos[1] + j)
                    a0 = math.atan2(src[1] - cy, src[0] - cx)
                    a1 = math.atan2(tgt[1] - cy, tgt[0] - cx)
                    r = math.hypot(src[0] - cx, src[1] - cy)
                    if interp == 2:
                        while a1 <= a0: a1 += 2 * math.pi
                    else:
                        while a1 >= a0: a1 -= 2 * math.pi
                    n = max(2, int(abs(a1 - a0) * r * ppm / 2))
                    pts = []
                    for k in range(n + 1):
                        a = a0 + (a1 - a0) * k / n
                        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
                    ras.stroke_poly(pts, w)
            pos = (nx, ny)
            continue
        if op == 3:                       # flash
            if cur_ap and cur_ap.kind == 'C' and cur_ap.params:
                r = cur_ap.params[0] / 2.0
                pts = [(tgt[0] + r * math.cos(t), tgt[1] + r * math.sin(t))
                       for t in [k * 2 * math.pi / 24 for k in range(24)]]
                ras.fill_poly(pts, val=1)
            elif cur_ap and cur_ap.params:
                w = cur_ap.params[0]; h = cur_ap.params[1] if len(cur_ap.params) > 1 else w
                pts = [(tgt[0] - w/2, tgt[1] - h/2), (tgt[0] + w/2, tgt[1] - h/2),
                       (tgt[0] + w/2, tgt[1] + h/2), (tgt[0] - w/2, tgt[1] + h/2)]
                ras.fill_poly(pts, val=1)
            pos = (nx, ny)
    return ras, (x0, y0, W_mm, H_mm), scale


if __name__ == '__main__':
    for p in sys.argv[1:]:
        ras, bbox, scale = render_gerber(p, 8.0)
        W, H = ras.W, ras.H
        tot = W * H
        cop = sum(ras.buf)
        filled = sum(1 for i in range(tot) if ras.kind[i] == 1)
        stroked = sum(1 for i in range(tot) if ras.kind[i] == 2)
        mm2 = 1.0 / 64.0
        print(f"=== {os.path.basename(p)} ===")
        print(f"   bbox {bbox[2]:.2f} x {bbox[3]:.2f} mm   raster {W}x{H}")
        print(f"   copper {100.0*cop/tot:.1f}%   filled {100.0*filled/tot:.1f}%"
              f"   traced {100.0*stroked/tot:.1f}%")
        # connected regions
        buf = ras.buf
        lab = [0] * (W * H); sizes = []; cur = 0
        for s in range(W * H):
            if buf[s] and not lab[s]:
                cur += 1; n = 0; q = deque([s]); lab[s] = cur
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
        order = sorted(range(len(sizes)), key=lambda i: -sizes[i])
        print(f"   isolated copper regions: {len(sizes)}")
        for k in order[:6]:
            print(f"      {sizes[k]*mm2:9.1f} mm^2  ({100.0*sizes[k]/tot:5.2f}%)")
        print()
