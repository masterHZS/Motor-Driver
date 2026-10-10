import sys, pymupdf
src = sys.argv[1]
doc = pymupdf.open(src)
print("total", doc.page_count, flush=True)
out=[]
for i in range(doc.page_count):
    try:
        p = doc.load_page(i)
        out.append(p.get_text("text"))
    except Exception as e:
        out.append("\n<<ERR PAGE %d: %s>>\n" % (i+1, e))
    if (i+1) % 50 == 0:
        print("done", i+1, flush=True)
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(out))
print("chars", sum(len(x) for x in out))
