import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\02_固件\F005_Slave\user\motor.c'
s = open(p, encoding='utf-8').read()
old = """    (void)Adt_SwBrake(TRUE);
    for (phase = 0u; phase < MOTOR_PHASE_COUNT; phase++) {
        Motor_SetPhaseMode(phase, MOTOR_PHASE_FLOAT, 0u);
    }

    Motor_SetPhaseMode(hi, MOTOR_PHASE_HIGH_PWM, cmp);
    Motor_SetPhaseMode(lo, MOTOR_PHASE_LOW_ON, 0u);
    Motor_SetPhaseMode(fl, MOTOR_PHASE_FLOAT, 0u);

    s_actualDuty = duty;
    s_stepCount++;
    Motor_BemfReset();
    (void)Adt_SwBrake(FALSE);"""
new = """    /* No software brake here: writing the CHB action registers while SOFTBK
     * is asserted latches CHB (measured with the logic analyser on
     * 2026-09-30), which kills the complementary low-side switching and with
     * it the bootstrap recharge of the high side.  Disabling every output
     * first is sufficient protection - the FD6288T also has its own
     * shoot-through interlock. */
    for (phase = 0u; phase < MOTOR_PHASE_COUNT; phase++) {
        Motor_SetPhaseMode(phase, MOTOR_PHASE_FLOAT, 0u);
    }

    Motor_SetPhaseMode(hi, MOTOR_PHASE_HIGH_PWM, cmp);
    Motor_SetPhaseMode(lo, MOTOR_PHASE_LOW_ON, 0u);
    Motor_SetPhaseMode(fl, MOTOR_PHASE_FLOAT, 0u);

    s_actualDuty = duty;
    s_stepCount++;
    Motor_BemfReset();"""
print('count old:', s.count(old))
print('count reapply hack:', s.count('    Motor_SetPhaseMode(hi, MOTOR_PHASE_HIGH_PWM, cmp);\n}'))
s2 = s.replace(old, new)
# remove the earlier "re-apply after brake" hack if still present
hack = """
    /* Re-apply the PWM phase with the brake released.  Writing the CHB action
     * registers while SOFTBK is asserted latches CHB at the braked level, so
     * the complementary low side would never switch and the bootstrap
     * capacitor of the high side would not be recharged (measured on the
     * logic analyser, 2026-09-30). */
    Motor_SetPhaseMode(hi, MOTOR_PHASE_HIGH_PWM, cmp);"""
if hack in s2:
    s2 = s2.replace(hack, "")
    print('removed re-apply hack')
open(p,'w',encoding='utf-8',newline='').write(s2)
print('motor.c updated')
