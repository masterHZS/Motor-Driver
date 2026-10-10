import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\02_固件\F005_Slave\user\motor.c'
s = open(p, encoding='utf-8').read()

old1 = """    case MOTOR_PHASE_HIGH_PWM:
        /* CHA is high around the triangle valley and low around the peak. */
        t->GCMAR = cmp;
        t->GCMCR = cmp;"""
new1 = """    case MOTOR_PHASE_HIGH_PWM:
        /* CHA is high around the triangle valley and low around the peak.
         * GCMBR decides the CHB (complementary low side) level per the ADT
         * app note; it defaults to 0xFFFF, in which case the CHB compare
         * never fires and the low side stays off (bootstrap droop).
         * Write every compare register to be safe. */
        t->GCMAR = cmp;
        t->GCMBR = cmp;
        t->GCMCR = cmp;
        t->GCMDR = cmp;"""
assert s.count(old1) == 1, 'count1 %d' % s.count(old1)
s = s.replace(old1, new1)

old2 = """    hi = Motor_MapPhase(s_step[s_stepIndex].highSide);
    s_phase[hi].timer->GCMAR = cmp;
    s_phase[hi].timer->GCMCR = cmp;
    s_actualDuty = duty;"""
new2 = """    hi = Motor_MapPhase(s_step[s_stepIndex].highSide);
    s_phase[hi].timer->GCMAR = cmp;
    s_phase[hi].timer->GCMBR = cmp;
    s_phase[hi].timer->GCMCR = cmp;
    s_phase[hi].timer->GCMDR = cmp;
    s_actualDuty = duty;"""
assert s.count(old2) == 1, 'count2 %d' % s.count(old2)
s = s.replace(old2, new2)
open(p,'w',encoding='utf-8',newline='').write(s)
print('motor.c: all four compare regs written')
