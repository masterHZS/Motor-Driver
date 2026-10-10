import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\02_固件\F005_Slave\user\motor.c'
s = open(p, encoding='utf-8').read()
old = """        t->PCONR_f.CMPCA  = AdtCHxCompareLow;
        t->PCONR_f.PERCA  = AdtCHxPeriodLow;
        t->PCONR_f.STACA  = AdtCHxPortOutLow;
        t->PCONR_f.OUTENA = FALSE;

        t->PCONR_f.CMPCB  = AdtCHxCompareLow;
        t->PCONR_f.PERCB  = AdtCHxPeriodLow;
        t->PCONR_f.STACB  = AdtCHxPortOutLow;
        t->PCONR_f.OUTENB = FALSE;"""
new = """        t->PCONR_f.CMPCA  = AdtCHxCompareLow;
        t->PCONR_f.PERCA  = AdtCHxPeriodLow;
        t->PCONR_f.STACA  = AdtCHxPortOutLow;
        t->PCONR_f.OUTENA = TRUE;

        t->PCONR_f.CMPCB  = AdtCHxCompareLow;
        t->PCONR_f.PERCB  = AdtCHxPeriodLow;
        t->PCONR_f.STACB  = AdtCHxPortOutLow;
        /* keep the output enabled: disabling and re-enabling CHB leaves it
         * latched and the complementary low side never switches again
         * (measured 2026-09-30).  Driving both inputs low is equivalent. */
        t->PCONR_f.OUTENB = TRUE;"""
assert s.count(old) == 1, 'count %d' % s.count(old)
s = s.replace(old, new)
open(p,'w',encoding='utf-8',newline='').write(s)
print('motor.c: FLOAT keeps outputs enabled (all-low actions)')
