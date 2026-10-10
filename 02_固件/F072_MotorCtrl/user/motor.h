/******************************************************************************
 * motor.h - safe open-loop six-step controller for HC32F072
 ******************************************************************************/
#ifndef F072_MOTOR_H
#define F072_MOTOR_H

#include "ddl.h"

#define MOTOR_FW_VERSION              (0x0100u)
#define MOTOR_DEFAULT_PWM_HZ          (20000u)
#define MOTOR_MAX_DUTY_PERCENT        (30u)
#define MOTOR_PRECHARGE_DUTY_PERCENT  (15u)   /* 定位对准用，取 BEMF 版上限 */
#define MOTOR_PRECHARGE_MS            (500u)  /* 200 ms 对准不足，转子常来不及到位 */
#define MOTOR_RAMP_START_MILLIHZ      (10000u)   /* 10.000 Hz */
#define MOTOR_RAMP_STEP_MILLIHZ       (100u)     /* +0.100 Hz each millisecond */
#define MOTOR_RAMP_MAX_MILLIHZ        (500000u)  /* 500.000 Hz electrical */
#define MOTOR_COMMAND_TIMEOUT_MS      (1000u)

typedef enum {
    MOTOR_STATE_STOPPED = 0,
    MOTOR_STATE_PRECHARGE,
    MOTOR_STATE_RAMP,
    MOTOR_STATE_CLOSED_LOOP,
    MOTOR_STATE_FAULT
} motor_state_t;

void Motor_Init(void);
void Motor_Tick1ms(void);
void Motor_Service(void);
void Motor_CommandStart(void);
void Motor_CommandStop(void);
void Motor_SetThrottle(uint16_t percent);
void Motor_SetPwmFrequency(uint16_t hz);
void Motor_CommHeartbeat(void);

uint16_t Motor_GetRunState(void);
uint16_t Motor_GetStartRequest(void);
uint16_t Motor_GetThrottlePercent(void);
uint16_t Motor_GetPwmFrequency(void);
uint16_t Motor_GetActualDuty(void);
uint16_t Motor_GetElectricalHz(void);
uint16_t Motor_GetFault(void);
uint16_t Motor_GetCommOkCount(void);
uint16_t Motor_GetCommErrCount(void);
void Motor_RecordCommOk(void);
void Motor_RecordCommError(void);
void Motor_SetFault(uint16_t fault);
uint32_t Motor_GetTickMs(void);

#endif /* F072_MOTOR_H */



