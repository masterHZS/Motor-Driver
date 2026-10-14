#ifndef F005_SPEED_CONTROL_H
#define F005_SPEED_CONTROL_H
#include <stdint.h>

/* 油门是目标电频率比例；机械RPM需已确认的转子极对数。 */
#define SPEED_MIN_MILLIHZ 5000u
#define SPEED_MAX_MILLIHZ 300000u
#define SPEED_RAMP_STEP_MILLIHZ 300u /* 每10ms；30电Hz/s */

typedef struct {
    int32_t integral_milli_permille;
    uint32_t reference_millihz;
} speed_control_t;

uint32_t Speed_TargetMilliHz(uint16_t percent);
void Speed_Reset(speed_control_t *c, uint16_t duty_permille, uint32_t speed_millihz);
uint16_t Speed_Update10ms(speed_control_t *c, uint16_t percent,
                         uint32_t measured_millihz, uint16_t maximum_permille);
#endif
