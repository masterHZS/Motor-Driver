import sys, os, re, zlib
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
import raster_pdf as R

for name in ["装配图底层\\Bottom Layer.pdf.pdf", "装配图顶层\\Top Layer.pdf.pdf"]:
    p = os.path.join(_HERE, "extracted", name)
    c = R.get_content(p)
    txt = c.decode("latin1")
    print("="*70)
    print(os.path.basename(p))
    # look for hatch / pattern / big fills
    for kw in ["Pattern", "pattern", "/P", "sh", "gs", "Do", "W n", "W* n"]:
        n = txt.count(kw)
        if n: print(f"   keyword {kw!r}: {n}")
    # find the biggest 're' rectangles
    res = [tuple(float(x) for x in m.groups())
           for m in re.finditer(r"(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+re", txt)]
    print("   're' rects:", len(res))
    for r in res[:10]:
        print("      ", r, "area", abs(r[2]*r[3]))
    # count fill ops and their approximate path sizes
    print("   'f' count:", len(re.findall(r"\bf\b", txt)), " 'S':", len(re.findall(r"\bS\b", txt)))
