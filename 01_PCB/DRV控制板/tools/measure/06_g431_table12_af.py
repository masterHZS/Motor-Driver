# -*- coding: utf-8 -*-
"""解析 DS12589 Table 12：LQFP64 脚号 -> 名称 / 复用 / 附加功能。"""
import pymupdf, re, json

DS = r"C:\Users\28572\Desktop\motor-drive\06_参考资料\芯片知识库\_datasheet\stm32g431rb.pdf"
doc = pymupdf.open(DS)

NAME = re.compile(r"^(P[A-H]\d{1,2})(-(OSC32_IN|OSC32_OUT|OSC_IN|OSC_OUT|NRST|BOOT0))?$")
SPECIAL = {"VDD", "VSS", "VDDA", "VSSA", "VREF+", "VBAT", "NRST", "BOOT0",
           "VCAP_1", "VCAP_2", "PDR_ON"}
CELL = re.compile(r"^\d{1,2}$|^[A-G]\d$|^-$")

recs = []
for pno in range(50, 61):
    toks = [t.strip() for t in doc[pno].get_text("text").split("\n") if t.strip()]
    for i, t in enumerate(toks):
        if not (NAME.match(t) or t in SPECIAL):
            continue
        rev, j = [], i - 1
        while j >= 0 and len(rev) < 14:
            s = toks[j]
            if CELL.match(s):
                rev.append(s)
            else:
                break
            j -= 1
        fwd = rev[::-1]
        # 找连续数字序列（9 或 10 个）
        seq = fwd[:]
        while seq and not CELL.match(seq[0]):
            seq.pop(0)
        if len(seq) < 9:
            continue
        # 取最后 9 个（UFQFPN32..LQFP100）
        tail = seq[-9:]
        try:
            lqfp64 = int(tail[5])
        except ValueError:
            continue
        if not (1 <= lqfp64 <= 64):
            continue
        after, k = [], i + 1
        while k < len(toks) and len(after) < 40:
            s = toks[k]
            if NAME.match(s) or (s in SPECIAL and s != t) or s.startswith("Table 12"):
                break
            after.append(s)
            k += 1
        recs.append({"p": lqfp64, "name": t, "tail": tail, "after": after})

print("raw recs:", len(recs))
best = {}
for r in recs:
    p = r["p"]
    if p not in best or len(r["after"]) > len(best[p]["after"]):
        best[p] = r
print("unique pins:", len(best), "missing:", [p for p in range(1, 65) if p not in best])

PAT = (r"ADC[12]_IN\d+|DAC\d_OUT\d|COMP\d_(?:IN[PM]|OUT)|OPAMP\d_VIN[PM]|OPAMP\d_VOUT|"
       r"TIM\d+_(?:CH\d+N?|BKIN2?|ETR)|USART\d_(?:TX|RX|CK|CTS|RTS_DE)|UART\d_(?:TX|RX)|"
       r"LPUART1_(?:TX|RX|CTS|RTS_DE)|SPI\d_(?:SCK|MISO|MOSI|NSS)|I2C\d_(?:SCL|SDA|SMBA)|"
       r"FDCAN1_(?:TX|RX)|USB_D[MP]|SWDIO|SWCLK|EVENTOUT|OSC_IN|OSC_OUT|OSC32_IN|"
       r"OSC32_OUT|RTC_REFIN|MCO|TRACECK|TRACED\d|WKUP\d|RTC_TAMP\d|RTC_TS|RTC_OUT\d")
out = {}
for p in range(1, 65):
    r = best.get(p)
    if not r:
        continue
    txt = " ".join(r["after"])
    af = sorted(set(re.findall(PAT, txt)))
    out[p] = {"name": r["name"], "af": af, "raw": txt[:200]}

json.dump(out, open(r"C:\Users\28572\Desktop\motor-drive\tmp\g431_table12.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
for p in range(1, 65):
    o = out.get(p)
    if o:
        print("%3d %-16s %s" % (p, o["name"], ",".join(o["af"])[:120]))
    else:
        print("%3d ???" % p)
