# -*- coding: utf-8 -*-
"""以安装孔为基准，换算 P2 排针与板边的相对尺寸（mm）。"""
import pymupdf, math

PXMM = 9.0397  # 由排针行距 22.961px = 2.54mm 标定

PDF = r"C:\Users\28572\Desktop\POWER_DRV8323HR_V1.01_产品说明书.pdf"
doc = pymupdf.open(PDF)
pix = pymupdf.Pixmap(doc, 163)
if pix.n - pix.alpha >= 4:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
s, W, H, N, ST = pix.samples, pix.width, pix.height, pix.n, pix.stride


def lum(x, y):
    i = y * ST + x * N
    return (s[i] * 299 + s[i + 1] * 587 + s[i + 2] * 114) // 1000


def dark(x, y):
    return lum(x, y) < 150


holes = []
for (rx0, ry0, rx1, ry1) in [(160, 130, 200, 175), (570, 130, 615, 175),
                             (160, 545, 200, 590), (570, 545, 615, 590)]:
    best = None
    for cy in range(ry0, ry1):
        for cx in range(rx0, rx1):
            darkcnt = 0
            tot = 0
            for k in range(36):
                a = 2 * math.pi * k / 36
                x = int(round(cx + 13 * math.cos(a)))
                y = int(round(cy + 13 * math.sin(a)))
                if 0 <= x < W and 0 <= y < H:
                    tot += 1
                    if dark(x, y):
                        darkcnt += 1
            score = darkcnt / max(tot, 1)
            if best is None or score > best[0]:
                best = (score, cx, cy)
    holes.append(best)
    print("window %d,%d-%d,%d -> center (%d,%d) ringhit %.2f" % (rx0, ry0, rx1, ry1, best[1], best[2], best[0]))

hs = [(h[1], h[2]) for h in holes]
print("mounting holes (px):", hs)
if len(hs) == 4:
    hx = sorted(set(p[0] for p in hs))
    hy = sorted(set(p[1] for p in hs))
    print("hole pitch x = %.2f px = %.3f mm (nominal 36)" % (hx[-1] - hx[0], (hx[-1] - hx[0]) / PXMM))
    print("hole pitch y = %.2f px = %.3f mm (nominal 44)" % (hy[-1] - hy[0], (hy[-1] - hy[0]) / PXMM))

rowmax = []
for y in range(120, 600):
    xs = [x for x in range(140, 650) if dark(x, y)]
    if xs:
        rowmax.append((y, xs[0], xs[-1]))
ys = [r[0] for r in rowmax]
left = min(r[1] for r in rowmax)
right = max(r[2] for r in rowmax)
print("board outline(px): left=%d right=%d top=%d bottom=%d" % (left, right, ys[0], ys[-1]))
print("board size: %.2f x %.2f mm" % ((right - left + 1) / PXMM, (ys[-1] - ys[0] + 1) / PXMM))

cols = [190.5, 213.48]
rows = [175.5, 198.5, 221.4, 244.5, 267.4, 290.5, 313.2, 336.3,
        359.3, 382.3, 405.2, 428.0, 451.0, 474.2, 497.4, 519.9]
print("=== P2 header relative dims ===")
print("col pitch: %.2f px = %.3f mm" % (cols[1] - cols[0], (cols[1] - cols[0]) / PXMM))
print("row pitch mean: %.3f mm" % (((rows[-1] - rows[0]) / (len(rows) - 1)) / PXMM))
print("header span y: %.2f mm" % ((rows[-1] - rows[0]) / PXMM))
print("col1 center x from left edge: %.2f mm" % ((cols[0] - left) / PXMM))
print("col2 center x from left edge: %.2f mm" % ((cols[1] - left) / PXMM))
print("row1 y from top edge: %.2f mm" % ((rows[0] - ys[0]) / PXMM))
print("row16 y from top edge: %.2f mm" % ((rows[-1] - ys[0]) / PXMM))
print("col2 to right edge: %.2f mm" % ((right - cols[1]) / PXMM))
print("row16 to bottom edge: %.2f mm" % ((ys[-1] - rows[-1]) / PXMM))
