import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\02_固件\F005_Slave\user\motor.c'
s = open(p, encoding='utf-8').read()
old = "        (void)Adt_EnableValueBuf(t, AdtCHxA, TRUE);\n        (void)Adt_CfgDT(t, FALSE, FALSE);"
new = "        (void)Adt_EnableValueBuf(t, AdtCHxA, TRUE);\n        (void)Adt_EnableValueBuf(t, AdtCHxB, TRUE);\n        (void)Adt_CfgDT(t, FALSE, FALSE);"
assert s.count(old) == 1, 'pattern count %d' % s.count(old)
s = s.replace(old, new)
open(p, 'w', encoding='utf-8', newline='').write(s)
print('patched: value buffer enabled for both channels')
