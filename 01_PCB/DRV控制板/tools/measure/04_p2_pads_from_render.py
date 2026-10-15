# -*- coding: utf-8 -*-
"""底视图渲染：用连通域精确提取 P2 焊盘行/列，确认排针行数。"""
import pymupdf

PDF = r"C:\Users\28572\Desktop\POWER_DRV8323HR_V1.01_产品说明书.pdf"
doc = pymupdf.open(PDF)
pix = pymupdf.Pixmap(doc, 55)
if pix.n - pix.alpha >= 4:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
s, W, H, N, ST = pix.samples, pix.width, pix.height, pix.n, pix.stride
print("bottom view:", W, "x", H)


def rgb(x, y):
    i = y * ST + x * N
    return s[i], s[i + 1], s[i + 2]


def is_pad(x, y):
    r, g, b = rgb(x, y)
    return r > 115 and g > 85 and b < 150 and (r - b) > 40 and (g - b) > 20


# P2 区域：x 1020..1160, y 200..1060
X0, X1, Y0, Y1 = 1018, 1164, 195, 1065
seen = [[False] * (X1 - X0) for _ in range(Y1 - Y0)]
comps = []
for yy in range(Y0, Y1):
    for xx in range(X0, X1):
        if seen[yy - Y0][xx - X0] or not is_pad(xx, yy):
            continue
        stack = [(xx, yy)]
        seen[yy - Y0][xx - X0] = True
        pts = []
        while stack:
            cx, cy = stack.pop()
            pts.append((cx, cy))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = cx + dx, cy + dy
                    if X0 <= nx < X1 and Y0 <= ny < Y1:
                        if not seen[ny - Y0][nx - X0] and is_pad(nx, ny):
                            seen[ny - Y0][nx - X0] = True
                            stack.append((nx, ny))
        if len(pts) > 30:
            comps.append(pts)

print("blobs:", len(comps))
info = []
for pts in comps:
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    info.append((sum(xs) / len(xs), sum(ys) / len(ys),
                 max(xs) - min(xs) + 1, max(ys) - min(ys) + 1, len(pts)))
info.sort(key=lambda t: (t[1], t[0]))
for t in info:
    print("  cx=%7.1f cy=%7.1f w=%3d h=%3d n=%4d" % t)
