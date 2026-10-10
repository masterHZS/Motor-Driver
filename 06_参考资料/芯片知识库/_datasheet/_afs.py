import re, sys, io

src = sys.argv[1]
dst = sys.argv[2]
lines = io.open(src, encoding="utf-8").read().split("\n")

# find section headers
hdrs = []
pat = re.compile(r"^\s*6\.5\.\d+\.\d+\s+端口\s+(P\d\d)\s+功能配置寄存器")
for i, l in enumerate(lines):
    m = pat.match(l)
    if m:
        hdrs.append((m.group(1), i))

out = []
for name, i in hdrs:
    out.append("### %s_SEL  (section line %d)" % (name, i + 1))
    # scan following 80 lines for bit descriptions and offset/reset
    for j in range(i, min(i + 90, len(lines))):
        l = lines[j].strip()
        if re.match(r"^[01]{3}[：:]", l) or l.startswith("偏移地址") or l.startswith("复位值") or re.match(r"^\d+:\d+$", l):
            out.append("  %d: %s" % (j + 1, l))
    out.append("")

io.open(dst, "w", encoding="utf-8").write("\n".join(out))
print("sections:", len(hdrs))
