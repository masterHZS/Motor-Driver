/******************************************************************************
 * motor.c - open-loop six-step safety controller for HC32F072 + FD6288T
 *
 * Pins:
 *   A high / HIN1 : PB2  / pin 20 / H2-12 / TIM4_CHA
 *   A low  / LIN1 : PA7  / pin 17 / H2-7
 *   B high / HIN2 : PA4  / pin 14 / H2-6  / TIM5_CHA
 *   B low  / LIN2 : PB0  / pin 18 / H2-10
 *   C high / HIN3 : PB12 / pin 25 / H2-17 / TIM6_CHA
 *   C low  / LIN3 : PB1  / pin 19 / H2-9
 *
 * Phase 1 intentionally has no BEMF or current feedback. The high-side PWM
 * duty is capped at 30% in software, and a current-limited 4S supply is
 * mandatory.
 ******************************************************************************/

#include "motor.h"

#include "adt.h"
#include "gpio.h"
#include "sysctrl.h"

typedef struct {
    en_gpio_port_t highPort;
    en_gpio_pin_t highPin;
    en_gpio_af_t highAf;
    en_gpio_port_t lowPort;
    en_gpio_pin_t lowPin;
    M0P_ADTIM_TypeDef *timer;
} motor_phase_hw_t;

static const motor_phase_hw_t s_phase[3] = {
    { GpioPortB, GpioPin2,  GpioAf4, GpioPortA, GpioPin7,  M0P_ADTIM4 },
    { GpioPortA, GpioPin4,  GpioAf5, GpioPortB, GpioPin0,  M0P_ADTIM5 },
    { GpioPortB, GpioPin12, GpioAf7, GpioPortB, GpioPin1,  M0P_ADTIM6 }
};

/* step: high phase, low phase, floating phase
 * 标准正转 120° 六步（与 F005_Slave/user/motor.c 的权威表逐行一致）:
 *   0 {A+,B-,C~}  1 {A+,C-,B~}  2 {B+,C-,A~}
 *   3 {B+,A-,C~}  4 {C+,A-,B~}  5 {C+,B-,A~}
 * 每步定子电流矢量前进 60°。第 4、5 行一旦对调，序列就变成
 * +60/+60/+60/+120/-60/+120（前冲 120° 再倒退 60°），转子会剧烈抖动。 */
static const uint8_t s_step[6][3] = {
    { 0u, 1u, 2u }, /* A+ B- ，C 悬空 */
    { 0u, 2u, 1u }, /* A+ C- ，B 悬空 */
    { 1u, 2u, 0u }, /* B+ C- ，A 悬空 */
    { 1u, 0u, 2u }, /* B+ A- ，C 悬空 */
    { 2u, 0u, 1u }, /* C+ A- ，B 悬空 */
    { 2u, 1u, 0u }  /* C+ B- ，A 悬空 */
};

static volatile uint32_t s_tickMs;
static volatile motor_state_t s_state;
static volatile uint16_t s_startRequest;
static volatile uint16_t s_throttlePercent;
static volatile uint16_t s_actualDuty;
static volatile uint16_t s_pwmHz;
static volatile uint16_t s_pwmPeriod;
static volatile uint32_t s_electricalMilliHz;
static volatile uint32_t s_stepAccumulatorUs;
static volatile uint8_t s_stepIndex;
static volatile uint8_t s_activeHighPhase;
static volatile uint8_t s_activeLowPhase;
static volatile uint16_t s_prechargeMs;
static volatile uint16_t s_fault;
static volatile uint16_t s_commOk;
static volatile uint16_t s_commErr;
static volatile uint32_t s_lastCommTick;

static void Motor_GpioSetOutput(en_gpio_port_t port, en_gpio_pin_t pin, boolean_t value);
static void Motor_GpioSetAdt(en_gpio_port_t port, en_gpio_pin_t pin, en_gpio_af_t af);
static void Motor_AllOutputsOff(void);
static void Motor_DeadtimeDelay(void);
static void Motor_ApplyStep(uint8_t step);
static void Motor_DisableTimerOutput(M0P_ADTIM_TypeDef *timer);
static void Motor_EnablePhasePwm(uint8_t phase, uint16_t dutyPercent);
static void Motor_UpdateDuty(void);
static uint16_t Motor_DutyToCompare(uint16_t dutyPercent);
static void Motor_BeginPrecharge(void);
static void Motor_FaultNow(uint16_t fault);
static void Motor_ConfigurePwm(uint16_t hz);

void Motor_Init(void)
{
    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralAdvTim, TRUE);

    s_tickMs = 0u;
    s_state = MOTOR_STATE_STOPPED;
    s_startRequest = 0u;
    s_throttlePercent = 0u;
    s_actualDuty = 0u;
    s_electricalMilliHz = 0u;
    s_stepAccumulatorUs = 0u;
    s_stepIndex = 0u;
    s_activeHighPhase = 0xFFu;
    s_activeLowPhase = 0xFFu;
    s_prechargeMs = 0u;
    s_fault = 0u;
    s_commOk = 0u;
    s_commErr = 0u;
    s_lastCommTick = 0u;

    Motor_AllOutputsOff();
    Motor_ConfigurePwm(MOTOR_DEFAULT_PWM_HZ);
}

void Motor_Service(void)
{
    /* Open-loop build: BEMF service is not used. */
}

void Motor_CommandStart(void)
{
    s_fault = 0u;
    s_startRequest = 1u;

    if (s_throttlePercent == 0u) {
        Motor_AllOutputsOff();
        s_state = MOTOR_STATE_STOPPED;
    } else if (s_state == MOTOR_STATE_STOPPED || s_state == MOTOR_STATE_FAULT) {
        Motor_BeginPrecharge();
    }
}

void Motor_CommandStop(void)
{
    s_startRequest = 0u;
    s_state = MOTOR_STATE_STOPPED;
    s_actualDuty = 0u;
    s_electricalMilliHz = 0u;
    s_stepAccumulatorUs = 0u;
    s_stepIndex = 0u;
    s_activeHighPhase = 0xFFu;
    s_activeLowPhase = 0xFFu;
    s_prechargeMs = 0u;
    Motor_AllOutputsOff();
}

void Motor_SetThrottle(uint16_t percent)
{
    if (percent > 100u) {
        percent = 100u;
    }
    s_throttlePercent = percent;

    if (s_startRequest == 0u || s_fault != 0u) {
        return;
    }

    if (percent == 0u) {
        Motor_AllOutputsOff();
        s_state = MOTOR_STATE_STOPPED;
        s_actualDuty = 0u;
        s_electricalMilliHz = 0u;
        return;
    }

    if (s_state == MOTOR_STATE_STOPPED) {
        Motor_BeginPrecharge();
    } else {
        Motor_UpdateDuty();
    }
}

void Motor_SetPwmFrequency(uint16_t hz)
{
    if (hz < 1000u || hz > 20000u || hz == s_pwmHz) {
        return;
    }

    Motor_CommandStop();
    Motor_ConfigurePwm(hz);
}

void Motor_CommHeartbeat(void)
{
    s_lastCommTick = s_tickMs;
}

void Motor_Tick1ms(void)
{
    uint32_t stepPeriodUs;

    s_tickMs++;

    if (s_state == MOTOR_STATE_FAULT || s_startRequest == 0u || s_throttlePercent == 0u) {
        return;
    }

    if ((s_tickMs - s_lastCommTick) > MOTOR_COMMAND_TIMEOUT_MS) {
        Motor_FaultNow(0x0002u); /* command timeout */
        return;
    }

    if (s_state == MOTOR_STATE_PRECHARGE) {
        s_prechargeMs++;
        if (s_prechargeMs >= MOTOR_PRECHARGE_MS) {
            s_state = MOTOR_STATE_RAMP;
            s_electricalMilliHz = MOTOR_RAMP_START_MILLIHZ;
            s_stepAccumulatorUs = 0u;
            s_stepIndex = 0u;
            Motor_ApplyStep(0u);
        } else {
            Motor_UpdateDuty();
        }
        return;
    }

    if (s_state != MOTOR_STATE_RAMP) {
        return;
    }

    if (s_electricalMilliHz < MOTOR_RAMP_MAX_MILLIHZ) {
        s_electricalMilliHz += MOTOR_RAMP_STEP_MILLIHZ;
        if (s_electricalMilliHz > MOTOR_RAMP_MAX_MILLIHZ) {
            s_electricalMilliHz = MOTOR_RAMP_MAX_MILLIHZ;
        }
    }

    if (s_electricalMilliHz == 0u) {
        return;
    }

    stepPeriodUs = 1000000000u / (6u * s_electricalMilliHz);
    if (stepPeriodUs == 0u) {
        stepPeriodUs = 1u;
    }

    s_stepAccumulatorUs += 1000u;
    while (s_stepAccumulatorUs >= stepPeriodUs) {
        s_stepAccumulatorUs -= stepPeriodUs;
        s_stepIndex = (uint8_t)((s_stepIndex + 1u) % 6u);
        Motor_ApplyStep(s_stepIndex);
    }
    Motor_UpdateDuty();
}

uint16_t Motor_GetRunState(void)
{
    if (s_state == MOTOR_STATE_PRECHARGE || s_state == MOTOR_STATE_RAMP) {
        return 1u;
    }
    return 0u;
}

uint16_t Motor_GetStartRequest(void) { return s_startRequest; }
uint16_t Motor_GetThrottlePercent(void) { return s_throttlePercent; }
uint16_t Motor_GetPwmFrequency(void) { return s_pwmHz; }
uint16_t Motor_GetActualDuty(void) { return s_actualDuty; }
uint16_t Motor_GetElectricalHz(void) { return (uint16_t)(s_electricalMilliHz / 1000u); }
uint16_t Motor_GetFault(void) { return s_fault; }
uint16_t Motor_GetCommOkCount(void) { return s_commOk; }
uint16_t Motor_GetCommErrCount(void) { return s_commErr; }
uint32_t Motor_GetTickMs(void) { return s_tickMs; }

void Motor_RecordCommOk(void)
{
    s_commOk++;
}

void Motor_RecordCommError(void)
{
    s_commErr++;
}

void Motor_SetFault(uint16_t fault)
{
    Motor_FaultNow(fault);
}

static void Motor_FaultNow(uint16_t fault)
{
    s_fault |= fault;
    s_startRequest = 0u;
    s_state = MOTOR_STATE_FAULT;
    s_actualDuty = 0u;
    s_electricalMilliHz = 0u;
    s_stepAccumulatorUs = 0u;
    s_activeHighPhase = 0xFFu;
    s_activeLowPhase = 0xFFu;
    s_prechargeMs = 0u;
    Motor_AllOutputsOff();
}

static void Motor_BeginPrecharge(void)
{
    s_state = MOTOR_STATE_PRECHARGE;
    s_prechargeMs = 0u;
    s_stepIndex = 0u;
    s_electricalMilliHz = 0u;
    s_actualDuty = MOTOR_PRECHARGE_DUTY_PERCENT;
    Motor_ApplyStep(0u);
}

static void Motor_ConfigurePwm(uint16_t hz)
{
    uint32_t pclk = Sysctrl_GetPClkFreq();
    uint32_t period;
    uint16_t i;
    stc_adt_basecnt_cfg_t baseCfg;
    stc_adt_CHxX_port_cfg_t chCfg;
    stc_adt_sw_sync_t syncCfg;

    if (hz < 1000u) {
        hz = 1000u;
    } else if (hz > 20000u) {
        hz = 20000u;
    }

    period = pclk / (2u * (uint32_t)hz);
    if (period < 2u) {
        period = 2u;
    } else if (period > 0xFFFFu) {
        period = 0xFFFFu;
    }

    DDL_ZERO_STRUCT(baseCfg);
    DDL_ZERO_STRUCT(chCfg);
    DDL_ZERO_STRUCT(syncCfg);

    baseCfg.enCntMode = AdtTriangleModeA;
    baseCfg.enCntDir = AdtCntUp;
    baseCfg.enCntClkDiv = AdtClkPClk0;

    syncCfg.bAdTim4 = TRUE;
    syncCfg.bAdTim5 = TRUE;
    syncCfg.bAdTim6 = TRUE;
    (void)Adt_SwSyncStop(&syncCfg);

    for (i = 0u; i < 3u; i++) {
        (void)Adt_Init(s_phase[i].timer, &baseCfg);
        (void)Adt_SetPeriod(s_phase[i].timer, (uint16_t)period);
        (void)Adt_SetCompareValue(s_phase[i].timer, AdtCompareA, (uint16_t)(period - 1u));
        (void)Adt_SetCompareValue(s_phase[i].timer, AdtCompareC, 0xFFFFu);

        chCfg.enCap = AdtCHxCompareOutput;
        chCfg.bOutEn = FALSE;
        chCfg.enPerc = AdtCHxPeriodKeep;
        chCfg.enCmpc = AdtCHxCompareInv;
        chCfg.enStaStp = AdtCHxStateSelSS;
        chCfg.enStaOut = AdtCHxPortOutLow;
        chCfg.enStpOut = AdtCHxPortOutLow;
        chCfg.enDisVal = AdtTIMxDisValLow;
        (void)Adt_CHxXPortCfg(s_phase[i].timer, AdtCHxA, &chCfg);
        (void)Adt_EnableValueBuf(s_phase[i].timer, AdtCHxA, TRUE);

        /* 24 MHz / 24 = 1 us, retained as an additional hardware dead-time
         * setting for the ADT block. The low-side inputs are switched as GPIO
         * in phase 1, so the explicit off-delay below is also mandatory. */
        (void)Adt_SetDTUA(s_phase[i].timer, 24u);
        (void)Adt_SetDTDA(s_phase[i].timer, 24u);
        (void)Adt_CfgDT(s_phase[i].timer, TRUE, TRUE);
        Adt_ClearAllIrqFlag(s_phase[i].timer);
    }

    s_pwmPeriod = (uint16_t)period;
    s_pwmHz = hz;
    (void)Adt_SwSyncStart(&syncCfg);
}

static uint16_t Motor_DutyToCompare(uint16_t dutyPercent)
{
    uint32_t period = s_pwmPeriod;
    uint32_t compare;

    if (dutyPercent > MOTOR_MAX_DUTY_PERCENT) {
        dutyPercent = MOTOR_MAX_DUTY_PERCENT;
    }

    compare = period - ((period * (uint32_t)dutyPercent) / 100u);
    if (compare < 1u) {
        compare = 1u;
    } else if (compare >= period) {
        compare = period - 1u;
    }
    return (uint16_t)compare;
}

static void Motor_UpdateDuty(void)
{
    uint16_t duty;

    if (s_state == MOTOR_STATE_PRECHARGE) {
        duty = MOTOR_PRECHARGE_DUTY_PERCENT;
    } else {
        duty = s_throttlePercent;
    }
    if (duty > MOTOR_MAX_DUTY_PERCENT) {
        duty = MOTOR_MAX_DUTY_PERCENT;
    }
    s_actualDuty = duty;

    if (s_activeHighPhase < 3u) {
        (void)Adt_SetCompareValue(s_phase[s_activeHighPhase].timer,
                                  AdtCompareC,
                                  Motor_DutyToCompare(duty));
    }
}

static void Motor_DisableTimerOutput(M0P_ADTIM_TypeDef *timer)
{
    timer->PCONR_f.OUTENA = FALSE;
}

static void Motor_EnablePhasePwm(uint8_t phase, uint16_t dutyPercent)
{
    uint16_t compare = Motor_DutyToCompare(dutyPercent);

    Motor_DisableTimerOutput(s_phase[phase].timer);
    (void)Adt_SetCompareValue(s_phase[phase].timer, AdtCompareA, compare);
    Motor_GpioSetAdt(s_phase[phase].highPort, s_phase[phase].highPin, s_phase[phase].highAf);
    s_phase[phase].timer->PCONR_f.OUTENA = TRUE;
    s_activeHighPhase = phase;
    s_activeLowPhase = 0xFFu;
}

static void Motor_ApplyStep(uint8_t step)
{
    uint8_t high;
    uint8_t low;
    uint16_t duty;
    uint8_t i;

    if (step >= 6u) {
        step = 0u;
    }

    high = s_step[step][0];
    low = s_step[step][1];

    Motor_AllOutputsOff();
    Motor_DeadtimeDelay();

    /* Low side is static-on in this phase-1 open-loop profile. */
    Motor_GpioSetOutput(s_phase[low].lowPort, s_phase[low].lowPin, TRUE);
    s_activeLowPhase = low;

    duty = (s_state == MOTOR_STATE_PRECHARGE)
        ? MOTOR_PRECHARGE_DUTY_PERCENT
        : s_throttlePercent;
    if (duty > MOTOR_MAX_DUTY_PERCENT) {
        duty = MOTOR_MAX_DUTY_PERCENT;
    }
    if (duty == 0u) {
        duty = 1u;
    }
    s_actualDuty = duty;

    Motor_EnablePhasePwm(high, duty);

    for (i = 0u; i < 3u; i++) {
        if (i != high && i != low) {
            Motor_GpioSetOutput(s_phase[i].highPort, s_phase[i].highPin, FALSE);
            Motor_GpioSetOutput(s_phase[i].lowPort, s_phase[i].lowPin, FALSE);
        }
    }
}

static void Motor_AllOutputsOff(void)
{
    uint8_t i;

    for (i = 0u; i < 3u; i++) {
        Motor_DisableTimerOutput(s_phase[i].timer);
        Motor_GpioSetOutput(s_phase[i].highPort, s_phase[i].highPin, FALSE);
        Motor_GpioSetOutput(s_phase[i].lowPort, s_phase[i].lowPin, FALSE);
    }

    s_activeHighPhase = 0xFFu;
    s_activeLowPhase = 0xFFu;
}

static void Motor_GpioSetOutput(en_gpio_port_t port, en_gpio_pin_t pin, boolean_t value)
{
    stc_gpio_cfg_t cfg;

    DDL_ZERO_STRUCT(cfg);
    cfg.bOutputVal = value;
    cfg.enDir = GpioDirOut;
    cfg.enDrv = GpioDrvH;
    cfg.enPu = GpioPuDisable;
    cfg.enPd = GpioPdDisable;
    cfg.enOD = GpioOdDisable;
    cfg.enCtrlMode = GpioFastIO;
    (void)Gpio_Init(port, pin, &cfg);
}

static void Motor_GpioSetAdt(en_gpio_port_t port, en_gpio_pin_t pin, en_gpio_af_t af)
{
    stc_gpio_cfg_t cfg;

    DDL_ZERO_STRUCT(cfg);
    cfg.enDir = GpioDirOut;
    cfg.enDrv = GpioDrvH;
    cfg.enPu = GpioPuDisable;
    cfg.enPd = GpioPdDisable;
    cfg.enOD = GpioOdDisable;
    cfg.enCtrlMode = GpioFastIO;
    cfg.bOutputVal = FALSE;
    (void)Gpio_Init(port, pin, &cfg);
    Gpio_SetAfMode(port, pin, af);
}

static void Motor_DeadtimeDelay(void)
{
    volatile uint8_t i;

    /* About 1 us at 24 MHz. The explicit sequence also guarantees both gate
     * inputs are low before a low-side transistor is enabled. */
    for (i = 0u; i < 8u; i++) {
        __NOP();
    }
}

void SysTick_IRQHandler(void)
{
    Motor_Tick1ms();
}

/******************************************************************************
 * EOF
 ******************************************************************************/




