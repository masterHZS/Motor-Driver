# -*- coding: utf-8 -*-
"""定位 LQFP64 引脚图所在页，并按坐标重建映射。"""
import pymupdf, re, json

DS = r"C:\Users\28572\Desktop\motor-drive\06_参考资料\芯片知识库\_datasheet\stm32g431rb.pdf"
doc = pymupdf.open(DS)

tgt = None
for i in range(44, 50):
    t = doc[i].get_text("text")
    if "LQFP64 pinout" in t:
        tgt = i
        print("Figure 10 (LQFP64) found on PDF page", i + 1, "index", i)
        for line in t.split("\n")[:12]:
            print("   |", line)
        break
print("target index:", tgt)

page = doc[tgt]
words = page.get_text("words")
NUM = re.compile(r"^\d{1,2}$")
NAME = re.compile(r"^P[A-H]\d{1,2}$")
SPECIAL = {"VDD", "VSS", "VDDA", "VSSA", "VBAT", "VREF+"}

rows = []
for w in words:
    t = w[4]
    if NUM.match(t) or NAME.match(t) or t in SPECIAL or t.endswith("-NRST") or t.endswith("-BOOT0"):
        rows.append((t, (w[0] + w[2]) / 2, (w[1] + w[3]) / 2))
rows.sort(key=lambda v: (round(v[2]), v[1]))
for t, cx, cy in rows:
    print("%-14s cx=%7.1f cy=%7.1f" % (t, cx, cy))
