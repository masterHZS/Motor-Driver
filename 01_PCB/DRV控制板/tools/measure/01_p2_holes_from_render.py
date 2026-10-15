# -*- coding: utf-8 -*-
"""P2 排针孔：从顶视图/底视图效果图与机械图中提取孔中心，换算 mm。
尺度标定：板框 47(x) x 50(y) mm。"""
import pymupdf

PDF = r"C:\Users\28572\Desktop\POWER_DRV8323HR_V1.01_产品说明书.pdf"
doc = pymupdf.open(PDF)

VIEWS = {
    "top   (p1,xref54)": (54, 2573 if False else 1271, 1350),
    "bottom(p1,xref55)": (55, 1166, 1236),
}


def get(xref):
    pix = pymupdf.Pixmap(doc, xref)
    if pix.n - pix.alpha >= 4:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    return pix


def make_accessor(pix):
    s, W, H, N, ST = pix.samples, pix.width, pix.height, pix.n, pix.stride

    def rgb(x, y):
        i = y * ST + x * N
        return s[i], s[i + 1], s[i + 2]
    return rgb, W, H


def is_pad(r, g, b):
    return r > 120 and g > 90 and b < 140 and (r - b) > 45 and (g - b) > 25


def is_green(r, g, b):
    return g > r and g > b and g > 40


for label, (xref, _, _) in VIEWS.items():
    pix = get(xref)
    rgb, W, H = make_accessor(pix)
    print(f"\n===== {label}  {W}x{H} =====")
    # 板框：找非白区域的包围盒（去掉阴影：要求像素不是近白）
    xs, ys = [], []
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            r, g, b = rgb(x, y)
            if not (min(r, g, b) > 205):
                xs.append(x); ys.append(y)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    print(f"非白包围盒 x:{x0}..{x1} ({x1-x0+1}px)  y:{y0}..{y1} ({y1-y0+1}px)")
    sx = (x1 - x0 + 1) / 47.0
    sy = (y1 - y0 + 1) / 50.0
    print(f"尺度: {sx:.4f} px/mm (x), {sy:.4f} px/mm (y)")
    # 在右侧条带找焊盘（P2 在右上区域）
    band_x0 = int(x0 + 0.80 * (x1 - x0))
    print(f"右侧条带 x {band_x0}..{x1}")
    rows = []
    for y in range(y0, y1 + 1):
        cnt = sum(1 for x in range(band_x0, x1 + 1) if is_pad(*rgb(x, y)))
        rows.append((y, cnt))
    runs, cur = [], None
    for y, cnt in rows:
        if cnt > 3:
            if cur is None:
                cur = y
        else:
            if cur is not None:
                runs.append((cur, y - 1)); cur = None
    if cur is not None:
        runs.append((cur, y1))
    print(f"焊盘行段数: {len(runs)}")
    centers = []
    for (a, b) in runs:
        yc = (a + b) / 2.0
        # 该行内按 x 分列
        cols, cc = [], None
        for x in range(band_x0, x1 + 1):
            if is_pad(*rgb(x, int(yc))):
                if cc is None:
                    cc = x
            else:
                if cc is not None:
                    cols.append(((cc + x - 1) / 2.0, x - cc)); cc = None
        if cc is not None:
            cols.append(((cc + x1) / 2.0, x1 - cc + 1))
        centers.append((yc, cols))
        print(f"  y {a:4d}..{b:4d}  yc={yc:7.1f} ({(yc-y0)/sy:6.2f}mm)  高度{b-a+1:3d}px  列:" +
              " ".join(f"x={c:.0f}({(c-x0)/sx:.2f}mm,w{w})" for c, w in cols))
    if len(centers) > 2:
        pitch = [(centers[i + 1][0] - centers[i][0]) / sy for i in range(len(centers) - 1)]
        print("相邻行间距(mm):", " ".join(f"{p:.3f}" for p in pitch))
