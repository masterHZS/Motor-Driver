import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'libs'))
from pypdf import PdfReader

src, dst = sys.argv[1], sys.argv[2]
r = PdfReader(src)
out = []
for i, p in enumerate(r.pages):
    out.append("\n" + "=" * 70 + "\n### PAGE %d / %d\n" % (i + 1, len(r.pages)) + "=" * 70 + "\n")
    try:
        out.append(p.extract_text() or "")
    except Exception as e:
        out.append("<<ERR %s>>" % e)
txt = "".join(out)
with open(dst, "w", encoding="utf-8") as f:
    f.write(txt)
print("pages=%d chars=%d -> %s" % (len(r.pages), len(txt), dst))
