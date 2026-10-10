import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\02_固件\F005_Slave\user\motor.c'
s = open(p, encoding='utf-8').read()

old1 = """    threshold = ((uint32_t)s_vbusCounts * MOTOR_PHASE_TO_BUS_THRESHOLD_NUM) /
                MOTOR_PHASE_TO_BUS_THRESHOLD_DEN;"""
new1 = """    /* The 150k/1nF phase divider averages the 20 kHz carrier, so the ADC
     * sees duty*Vbus/2 + BEMF rather than Vbus/2 + BEMF.  Scale the
     * threshold by the instantaneous duty (measured failing otherwise,
     * 2026-09-30). */
    threshold = ((uint32_t)s_vbusCounts * MOTOR_PHASE_TO_BUS_THRESHOLD_NUM) /
                MOTOR_PHASE_TO_BUS_THRESHOLD_DEN;
    threshold = (threshold * (uint32_t)s_actualDuty) / 100u;"""
assert s.count(old1) == 1
s = s.replace(old1, new1)

old2 = """    hi = Motor_MapPhase(s_step[s_stepIndex].highSide);
    s_phase[hi].timer->GCMCR = cmp;
    s_actualDuty = duty;"""
new2 = """    hi = Motor_MapPhase(s_step[s_stepIndex].highSide);
    s_phase[hi].timer->GCMAR = cmp;
    s_phase[hi].timer->GCMCR = cmp;
    s_actualDuty = duty;
    Motor_SetBemfThreshold();"""
assert s.count(old2) == 1
s = s.replace(old2, new2)

open(p,'w',encoding='utf-8',newline='').write(s)
print('patched: duty-scaled BEMF threshold + GCMAR on duty update')
