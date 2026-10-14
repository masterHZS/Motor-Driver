/******************************************************************************
 * motor.h - sensorless six-step controller for HC32F005 + FD6288T
 *
 * Motor: 2216-730KV three-phase BLDC pump (no Hall sensors).
 * Board: motor-driver-V3.1, HC32F005C6PA + FD6288T.
 *
 * Control chain:
 *   normal:  ALIGN -> OPEN_LOOP (V/f) -> BEMF_CLOSED_LOOP -> FAULT/STOP
 *   0x0002: target speed percentage; bounded startup then BEMF speed feedback
 ******************************************************************************/
#ifndef F005_MOTOR_H
#define F005_MOTOR_H

#include "ddl.h"

/* ---- firmware / protocol identity ---- */
#define MOTOR_FW_VERSION                  (0x0202u)

#ifndef MOTOR_BUILD_ID
#define MOTOR_BUILD_ID                    (1u)
#endif

/* ---- PWM ---- */
#define MOTOR_PWM_DEFAULT_HZ              (20000u)

/* Build-profile switch used by build_comms.ps1 for the temporary direct
 * HostSoftware -> F005 bench control loop.  0 keeps the sensorless project. */
#ifndef MOTOR_DIRECT_THROTTLE_MODE
#define MOTOR_DIRECT_THROTTLE_MODE        (0u)
#endif
#if MOTOR_DIRECT_THROTTLE_MODE
#error 持续开环带电机已禁止，请构建无感闭环版本
#endif

/* ---- duty limits ---- */
#ifndef MOTOR_MAX_DUTY_PERCENT
#define MOTOR_MAX_DUTY_PERCENT            (30u)
#endif
#ifndef MOTOR_ALIGN_DUTY_PERCENT
#define MOTOR_ALIGN_DUTY_PERCENT          (10u)
#endif
#ifndef MOTOR_OPEN_LOOP_MAX_DUTY_PERCENT
#define MOTOR_OPEN_LOOP_MAX_DUTY_PERCENT  (25u)
#endif

/* ---- start-up profile ----
 * The previous 0.5-4.5 Hz forced ramp could not establish useful BEMF on a
 * high-KV pump.  Start at 10 Hz electrical, accelerate at 20 Hz/s, and cap the
 * open-loop attempt at 120 Hz.  Duty follows an approximate V/f line:
 *   duty[%] = 10 + 15 * (f_elec - 10 Hz) / 100 Hz
 */
#ifndef MOTOR_HOLD_MS
#define MOTOR_HOLD_MS                     (500u)
#endif
#ifndef MOTOR_PRECHARGE_MS
#define MOTOR_PRECHARGE_MS                (300u)
#endif
#ifndef MOTOR_ALIGN_MS
#define MOTOR_ALIGN_MS                    (350u)
#endif
#ifndef MOTOR_OPEN_LOOP_START_MILLIHZ
#define MOTOR_OPEN_LOOP_START_MILLIHZ     (10000u)  /* 10.000 Hz */
#endif
#ifndef MOTOR_OPEN_LOOP_ACCEL_MILLIHZ_PER_SECOND
#define MOTOR_OPEN_LOOP_ACCEL_MILLIHZ_PER_SECOND (20000u) /* +20 Hz/s */
#endif
#ifndef MOTOR_OPEN_LOOP_MAX_MILLIHZ
#define MOTOR_OPEN_LOOP_MAX_MILLIHZ       (120000u) /* 120 Hz before lock */
#endif
#ifndef MOTOR_OPEN_LOOP_MIN_STEPS
#define MOTOR_OPEN_LOOP_MIN_STEPS         (36u)     /* six electrical revs */
#endif

/* ---- BEMF观察器：实际VN采样，方向/消隐/时窗/连续确认 ---- */
#ifndef MOTOR_BEMF_HYSTERESIS_COUNTS
#define MOTOR_BEMF_HYSTERESIS_COUNTS      (3u)
#endif
#define MOTOR_BEMF_LOCK_STEPS             (6u)
#define MOTOR_STARTUP_TIMEOUT_MS          (8000u)
#define MOTOR_ADC_MAX_FRAME_TICKS         (12u) /* 32 us，超时帧不参与过零 */
#ifndef MOTOR_BEMF_DELAY_COMP_TICKS
#define MOTOR_BEMF_DELAY_COMP_TICKS       (0u) /* 未实测RC延迟，不写死24 us补偿 */
#endif

/* ---- communication timeout (kept for the Modbus-facing API) ---- */
#define MOTOR_COMMAND_TIMEOUT_MS          (1000u)

/* ---- one-shot bench self test ---- */
#ifndef MOTOR_SELFTEST_TOTAL_MS
#define MOTOR_SELFTEST_TOTAL_MS           (12000u)
#endif

#ifndef MOTOR_COMMUTATION_REVERSE
#define MOTOR_COMMUTATION_REVERSE         (0u)
#endif
#ifndef MOTOR_PHASE_MAP
#define MOTOR_PHASE_MAP                   (0u)
#endif
#ifndef MOTOR_BEMF_SIGN_MULTIPLIER
#define MOTOR_BEMF_SIGN_MULTIPLIER        (1)
#endif
#ifndef MOTOR_SELFTEST_COAST_MS
#define MOTOR_SELFTEST_COAST_MS           (500u)
#endif

/* ---- protection thresholds ----
 * Current: R32 = 3 mOhm, INA181A2 gain = 50, ADC Vref = 2.5 V.
 * Bus: R30 = 220 kOhm, R31 = 10 kOhm.
 */
#define MOTOR_ADC_VREF_MV                 (2500u)
#define MOTOR_ADC_FULL_SCALE              (4096u)
#define MOTOR_ISENSE_AMPS_PER_COUNT       (4.0690e-3f)
#define MOTOR_VBUS_MV_PER_COUNT           (14.038f)

#ifndef MOTOR_OC_TRIP_AMPS
#define MOTOR_OC_TRIP_AMPS                (2.0f)   /* bench safety net */
#endif
#define MOTOR_OC_TRIP_COUNTS              ((uint16_t)(MOTOR_OC_TRIP_AMPS / \
                                           MOTOR_ISENSE_AMPS_PER_COUNT))
#ifndef MOTOR_VBUS_MIN_MV
#define MOTOR_VBUS_MIN_MV                 (13000u)
#endif
#ifndef MOTOR_VBUS_MAX_MV
#define MOTOR_VBUS_MAX_MV                 (18000u)
#endif

typedef enum {
    MOTOR_STATE_STOPPED = 0,
    MOTOR_STATE_HOLD,
    MOTOR_STATE_PRECHARGE,
    MOTOR_STATE_ALIGN,
    MOTOR_STATE_OPEN_LOOP,
    MOTOR_STATE_CLOSED_LOOP,
    MOTOR_STATE_FAULT
} motor_state_t;

/* Fault bits (mirrored into the legacy register map / SWD result block). */
#define MOTOR_FAULT_NONE                  (0x0000u)
#define MOTOR_FAULT_ILLEGAL_COMMAND       (0x0001u)
#define MOTOR_FAULT_COMM_TIMEOUT          (0x0002u)
#define MOTOR_FAULT_OVERCURRENT           (0x0004u)
#define MOTOR_FAULT_UNDERVOLTAGE          (0x0008u)
#define MOTOR_FAULT_OVERVOLTAGE           (0x0010u)
#define MOTOR_FAULT_STALL                 (0x0020u)
#define MOTOR_FAULT_BEMF_LOST             (0x0040u)
#define MOTOR_FAULT_ADC_TIMEOUT           (0x0080u)

void     Motor_Init(void);
void     Motor_Service(void);          /* call continuously from main() */
void     Motor_Tick1ms(void);

/* one-shot power-on self test */
void     Motor_SelfTestStart(void);
boolean_t Motor_SelfTestFinished(void);

/* command interface (kept for the existing upper-layer protocol) */
void     Motor_CommandStart(void);
void     Motor_CommandStop(void);
void     Motor_SetThrottle(uint16_t percent);
void     Motor_CommHeartbeat(void);

uint16_t Motor_GetRunState(void);
uint16_t Motor_GetStartRequest(void);
uint16_t Motor_GetThrottlePercent(void);
uint16_t Motor_GetActualDuty(void);
uint16_t Motor_GetPwmFrequency(void);
boolean_t Motor_SetPwmFrequency(uint16_t hz);
uint16_t Motor_GetElectricalHz(void);
uint16_t Motor_GetFault(void);
uint16_t Motor_GetCommOkCount(void);
uint16_t Motor_GetCommErrCount(void);
void     Motor_SetCommRequired(boolean_t required);
boolean_t Motor_IsCommRequired(void);
void     Motor_RecordCommOk(void);
void     Motor_RecordCommError(void);
void     Motor_SetFault(uint16_t fault);
uint32_t Motor_GetTickMs(void);

/* diagnostics for the SWD result block */
uint16_t Motor_GetVbusCounts(void);
uint16_t Motor_GetIsensePeakCounts(void);
uint32_t Motor_GetStepCount(void);
uint16_t Motor_GetFirmwareMode(void);
uint16_t Motor_GetBemfCounts(void);
uint16_t Motor_GetBemfThresholdCounts(void);
uint32_t Motor_GetZeroCrossCount(void);

#endif /* F005_MOTOR_H */
