import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\02_固件\F005_Slave\user\motor.c'
s = open(p, encoding='utf-8').read()
old = """    s_actualDuty = duty;
    s_stepCount++;
    Motor_BemfReset();
    (void)Adt_SwBrake(FALSE);
}"""
new = """    s_actualDuty = duty;
    s_stepCount++;
    Motor_BemfReset();
    (void)Adt_SwBrake(FALSE);

    /* Re-apply the PWM phase with the brake released.  Writing the CHB action
     * registers while SOFTBK is asserted latches CHB at the braked level, so
     * the complementary low side would never switch and the bootstrap
     * capacitor of the high side would not be recharged (measured on the
     * logic analyser, 2026-09-30). */
    Motor_SetPhaseMode(hi, MOTOR_PHASE_HIGH_PWM, cmp);
}"""
assert s.count(old) == 1, 'apply-step pattern count %d' % s.count(old)
s = s.replace(old, new)
open(p,'w',encoding='utf-8',newline='').write(s)
print('motor.c patched: re-apply PWM mode after brake release')
