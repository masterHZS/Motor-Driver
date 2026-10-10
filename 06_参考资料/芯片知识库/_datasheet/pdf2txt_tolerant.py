import sys, pymupdf
src, dst = sys.argv[1], sys.argv[2]
doc = pymupdf.open(src)
n = doc.page_count
out = []
for i in range(n):
    out.append("\n" + "="*70 + "\n### PAGE %d / %d\n" % (i+1, n) + "="*70 + "\n")
    try:
        out.append(doc.load_page(i).get_text("text"))
    except Exception as e:
        out.append("\n<<ERR: %s>>\n" % e)
with open(dst, "w", encoding="utf-8") as f:
    f.write("".join(out))
print("pages=%d chars=%d -> %s" % (n, sum(len(x) for x in out), dst))
