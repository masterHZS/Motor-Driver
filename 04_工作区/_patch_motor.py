import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\02_固件\F005_Slave\user\motor.c'
s = open(p, encoding='utf-8').read()

old1 = """        t->PCONR_f.CMPCB  = AdtCHxCompareLow;
        t->PCONR_f.PERCB  = AdtCHxPeriodLow;
        t->PCONR_f.STACB  = AdtCHxPortOutLow;
        t->PCONR_f.OUTENB = TRUE;"""
new1 = """        t->PCONR_f.CMPCB  = AdtCHxCompareHigh;
        t->PCONR_f.PERCB  = AdtCHxPeriodLow;
        t->PCONR_f.STACB  = AdtCHxPortOutLow;
        t->PCONR_f.OUTENB = TRUE;"""
assert s.count(old1) == 1, 'HIGH_PWM block not found exactly once: %d' % s.count(old1)
s = s.replace(old1, new1)

old2 = "cmp = (((uint32_t)MOTOR_PERAR * (uint32_t)dutyPercent) + 50u) / 100u;"
new2 = "cmp = (((uint32_t)(2u * MOTOR_PERAR) * (uint32_t)dutyPercent) + 50u) / 100u;"
assert s.count(old2) == 1, 'duty map line not found exactly once: %d' % s.count(old2)
s = s.replace(old2, new2)

open(p, 'w', encoding='utf-8', newline='').write(s)
print('motor.c patched OK')
