#include "speed_control.h"

uint32_t Speed_TargetMilliHz(uint16_t percent)
{
    if (percent == 0u) { return 0u; }
    if (percent > 100u) { percent = 100u; }
    return SPEED_MIN_MILLIHZ +
           ((SPEED_MAX_MILLIHZ - SPEED_MIN_MILLIHZ) * percent) / 100u;
}

void Speed_Reset(speed_control_t *c, uint16_t duty, uint32_t speed)
{
    c->integral_milli_permille = (int32_t)duty * 1000;
    c->reference_millihz = speed;
}

uint16_t Speed_Update10ms(speed_control_t *c, uint16_t percent,
                         uint32_t measured, uint16_t maximum)
{
    uint32_t target = Speed_TargetMilliHz(percent);
    int32_t error, integral, output;
    if (target == 0u) {
        Speed_Reset(c, 0u, 0u);
        return 0u;
    }
    if (c->reference_millihz < target) {
        uint32_t delta = target - c->reference_millihz;
        c->reference_millihz += delta > SPEED_RAMP_STEP_MILLIHZ ?
                                SPEED_RAMP_STEP_MILLIHZ : delta;
    } else {
        uint32_t delta = c->reference_millihz - target;
        c->reference_millihz -= delta > SPEED_RAMP_STEP_MILLIHZ ?
                                SPEED_RAMP_STEP_MILLIHZ : delta;
    }
    error = (int32_t)c->reference_millihz - (int32_t)measured;
    /* 初始保守增益，需泵负载实测整定：Kp=0.02 %/Hz，Ki=0.05 %/(Hz*s)。 */
    integral = c->integral_milli_permille + error / 200;
    output = integral / 1000 + error / 5000;
    /* 饱和时冻结同方向积分，避免负载解除后的持续加速。 */
    if (!((output > maximum && error > 0) || (output < 10 && error < 0))) {
        if (integral < 0) { integral = 0; }
        if (integral > (int32_t)maximum * 1000) { integral = (int32_t)maximum * 1000; }
        c->integral_milli_permille = integral;
    }
    output = c->integral_milli_permille / 1000 + error / 5000;
    if (output < 10) { output = 10; }
    if (output > maximum) { output = maximum; }
    return (uint16_t)output;
}
