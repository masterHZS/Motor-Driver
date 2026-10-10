import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\02_固件\F005_Slave\scope\adtprobe.c'
s = open(p, encoding='utf-8').read()
old = """    for (;;) {
        const variant_t *v = &s_v[idx];
        M0P_ADTIM4->GCMAR = v->cmpaVal;"""
new = """    for (;;) {
        const variant_t *v = &s_v[idx];
        if ((idx & 1u) != 0u) { (void)Adt_SwBrake(TRUE); }
        M0P_ADTIM4->GCMAR = v->cmpaVal;"""
assert s.count(old) == 1
s = s.replace(old, new)
old2 = """        M0P_ADTIM4->PCONR_f.OUTENA = TRUE;
        M0P_ADTIM4->PCONR_f.OUTENB = TRUE;
        for (n = 0u; n < 2000000u; n++) { __NOP(); }"""
new2 = """        M0P_ADTIM4->PCONR_f.OUTENA = TRUE;
        M0P_ADTIM4->PCONR_f.OUTENB = TRUE;
        if ((idx & 1u) != 0u) { (void)Adt_SwBrake(FALSE); }
        for (n = 0u; n < 2000000u; n++) { __NOP(); }"""
assert s.count(old2) == 1
s = s.replace(old2, new2)
open(p,'w',encoding='utf-8',newline='').write(s)
print('adtprobe patched: odd variants write config while braked')
