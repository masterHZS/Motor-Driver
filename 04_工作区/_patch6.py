import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\02_固件\F005_Slave\scope\adtprobe.c'
s = open(p, encoding='utf-8').read()
old2 = """        if ((idx & 1u) != 0u) { (void)Adt_SwBrake(FALSE); }
        for (n = 0u; n < 2000000u; n++) { __NOP(); }"""
new2 = """        if ((idx & 1u) != 0u) {
            (void)Adt_SwBrake(FALSE);
            M0P_ADTIM4->GCMAR = v->cmpaVal;
            M0P_ADTIM4->GCMCR = v->cmpbVal;
            M0P_ADTIM4->PCONR_f.CMPCA = v->cmpa;
            M0P_ADTIM4->PCONR_f.PERCA = v->pera;
            M0P_ADTIM4->PCONR_f.STACA = v->staca;
            M0P_ADTIM4->PCONR_f.CMPCB = v->cmpb;
            M0P_ADTIM4->PCONR_f.PERCB = v->perb;
            M0P_ADTIM4->PCONR_f.STACB = v->stacb;
            M0P_ADTIM4->PCONR_f.OUTENA = TRUE;
            M0P_ADTIM4->PCONR_f.OUTENB = TRUE;
        }
        for (n = 0u; n < 2000000u; n++) { __NOP(); }"""
assert s.count(old2) == 1, 'count %d' % s.count(old2)
s = s.replace(old2, new2)
open(p,'w',encoding='utf-8',newline='').write(s)
print('adtprobe: odd variants = brake-while-write + post-brake re-apply')
