import sys, os, re
import pymupdf

src = sys.argv[1]
dst = sys.argv[2]
doc = pymupdf.open(src)
out = []
for i, page in enumerate(doc):
    out.append(f"\n{'='*70}\n### PAGE {i+1} / {len(doc)}\n{'='*70}\n")
    out.append(page.get_text("text"))
with open(dst, "w", encoding="utf-8") as f:
    f.write("".join(out))
print(f"pages={len(doc)} chars={sum(len(x) for x in out)} -> {dst}")
