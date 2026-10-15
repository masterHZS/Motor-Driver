# -*- coding: utf-8 -*-
"""精确提取机械图中排针孔的圆心：连通域 + 质心。"""
import pymupdf, math

PDF = r"C:\Users\28572\Desktop\POWER_DRV8323HR_V1.01_产品说明书.pdf"
doc = pymupdf.open(PDF)
pix = pymupdf.Pixmap(doc, 163)
if pix.n - pix.alpha >= 4:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
s, W, H, N, ST = pix.samples, pix.width, pix.height, pix.n, pix.stride


def dark(x, y):
    i = y * ST + x * N
    return (s[i] * 299 + s[i + 1] * 587 + s[i + 2] * 114) // 1000 < 150


# 只在 x 180..240（排针两列），y 150..540 范围做连通域
X0, X1, Y0, Y1 = 178, 245, 150, 545
seen = [[False] * (X1 - X0) for _ in range(Y1 - Y0)]
comps = []
for yy in range(Y0, Y1):
    for xx in range(X0, X1):
        if seen[yy - Y0][xx - X0] or not dark(xx, yy):
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
                        if not seen[ny - Y0][nx - X0] and dark(nx, ny):
                            seen[ny - Y0][nx - X0] = True
                            stack.append((nx, ny))
        comps.append(pts)

print("连通域数:", len(comps))
rings = []
for pts in comps:
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    w = max(xs) - min(xs) + 1; h = max(ys) - min(ys) + 1
    if 5 <= w <= 14 and 5 <= h <= 14 and len(pts) >= 12:
        cx = sum(xs) / len(xs); cy = sum(ys) / len(ys)
        rings.append((cx, cy, w, h, len(pts)))
rings.sort(key=lambda t: (round(t[0]), t[1]))
print("圆孔数:", len(rings))
for r in rings:
    print(f"  cx={r[0]:7.2f} cy={r[1]:7.2f} w={r[2]} h={r[3]} n={r[4]}")
if rings:
    xs = sorted(set(round(r[0]) for r in rings))
    col1 = [r for r in rings if abs(r[0] - xs[0]) < 6]
    col2 = [r for r in rings if abs(r[0] - xs[-1]) < 6]
    print("列1 cx均值=%.2f 行数=%d" % (sum(r[0] for r in col1) / len(col1), len(col1)))
    print("列2 cx均值=%.2f 行数=%d" % (sum(r[0] for r in col2) / len(col2), len(col2)))
    if len(col1) > 16:
        c1 = sorted(col1, key=lambda r: r[1])[1:-1]
    else:
        c1 = sorted(col1, key=lambda r: r[1])
    d = [c1[i + 1][1] - c1[i][1] for i in range(len(c1) - 1)]
    print("列1 相邻行距:", " ".join(f"{v:.2f}" for v in d))
    if d:
        mean = sum(d) / len(d)
        print("列1 平均行距=%.3f px -> 若为 2.54mm 则 %.4f px/mm; 板宽454px=%.2f mm, 板高452px=%.2f mm"
              % (mean, mean / 2.54, 454 / (mean / 2.54), 452 / (mean / 2.54)))
    colx = [sum(r[0] for r in col1) / len(col1), sum(r[0] for r in col2) / len(col2)]
    print("列间距: %.2f px" % (colx[1] - colx[0]))
