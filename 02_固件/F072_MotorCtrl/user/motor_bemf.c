/******************************************************************************
 * motor_bemf.c - sensorless BEMF six-step controller for HC32F072 + FD6288T
 *
 * Drive: high-side PWM + low-side static on, same power stage as F072_MotorCtrl.
 * BEMF : floating-phase ADC on PA3 / PA5 / PA6 (AIN_A/B/C).
 * Time : TIM3 32-bit free-running, PCLK/16 = 1.5 MHz.
 *
 * This is the 072 port of the ASAC-ESC open-loop -> BEMF-closed-loop idea,
 * with conservative limits for the 2216-730KV inrunner.
 ******************************************************************************/

#include "motor.h"

#include "adc.h"
#include "adt.h"
#include "gpio.h"
#include "sysctrl.h"
#include "timer3.h"

#define BEMF_MAX_DUTY_PERCENT            (15u)
#define BEMF_OPEN_LOOP_START_US          (20000u)
#define BEMF_OPEN_LOOP_MIN_US            (2000u)
/* 开环斜坡做成恒定角加速度：令 dT/dt = -C*T^2，则 df/dt = C/6 为常数。
 * 每次换相要减的量 = C*T^3（T 以 us 计，除以 1e12 还原）。
 * C = 30 -> 电频率 5 Hz/s。固定递减量（200 us/70 us）会让角加速度在斜坡
 * 末端放大几十倍：70 us 在 T=20 ms 时是 1.5 Hz/s，到 T=6 ms 变成 54 Hz/s，
 * 200 us 更是到 1300 Hz/s —— 转子就是在后段被甩脱的。 */
#define BEMF_OPEN_LOOP_ACCEL_C           (30u)
#define BEMF_OPEN_LOOP_MIN_COMMUTATIONS  (600u)
#define BEMF_STARTUP_TIMEOUT_MS          (12000u)
#define BEMF_STEP_TIMEOUT_MULTIPLIER     (2u)

#define BEMF_FAULT_COMMAND_TIMEOUT       (0x0002u)
#define BEMF_FAULT_BEMF_LOST             (0x0004u)

typedef struct {
    en_gpio_port_t highPort;
    en_gpio_pin_t highPin;
    en_gpio_af_t highAf;
    en_gpio_port_t lowPort;
    en_gpio_pin_t lowPin;
    M0P_ADTIM_TypeDef *timer;
} motor_phase_hw_t;

/* 高边 AF 号必须逐脚对数据手册，不能按"ADTIM4 就是 AF4"类推：
 *   数据手册的引脚复用表按 AF1..AF7 排列（PA09/PA10 的 UART0_TXD/RXD 在第一列，
 *   而板上已验证 PA9/PA10 用 AF1 = UART0，故第一列即 AF1）。
 *   PB02 : PCA_ECI, LPUART1_TXD, TIM4_CHA, TIM1_BK, TIM0_BK, TIM2_BK  -> TIM4_CHA = AF3
 *   PA04 : SPI0_CS, UART1_TXD, PCA_CH4, TIM2_ETR, TIM5_CHA, LVD_OUT, TIM3_CH2B -> AF5
 *   PB12 : SPI1_CS, TIM3_BK, LPUART0_TXD, TIM0_BK, LPUART0_RTS, TIM6_CHA -> TIM6_CHA = AF6
 * 原来写 PB2=AF4 / PB12=AF7，分别落到 TIM1_BK 和未定义档位上，三相里两相的
 * 高边永远出不来 PWM（定时器在计数、PERAR/GCMAR/OUTENA 全对，引脚却纹丝不动）。 */
static const motor_phase_hw_t s_phase[3] = {
    { GpioPortB, GpioPin2,  GpioAf3, GpioPortA, GpioPin7,  M0P_ADTIM4 },
    { GpioPortA, GpioPin4,  GpioAf5, GpioPortB, GpioPin0,  M0P_ADTIM5 },
    { GpioPortB, GpioPin12, GpioAf6, GpioPortB, GpioPin1,  M0P_ADTIM6 }
};

/* high phase, low phase, floating phase
 * 标准正转 120° 六步，与 motor.c、F005_Slave/user/motor.c 的权威表逐行一致。
 * 悬浮相的 BEMF 斜率随着这张表交替：偶数步（0/2/4）先正后负 = 下降过零，
 * 奇数步（1/3/5）先负后正 = 上升过零，即 Motor_ApplyStep() 里的 step 奇偶判断。
 * 这张表一旦错序，过零方向判断会跟着错，闭环必然失锁。 */
static const uint8_t s_step[6][3] = {
    { 0u, 1u, 2u }, /* A+ B- ，C 悬空，下降过零 */
    { 0u, 2u, 1u }, /* A+ C- ，B 悬空，上升过零 */
    { 1u, 2u, 0u }, /* B+ C- ，A 悬空，下降过零 */
    { 1u, 0u, 2u }, /* B+ A- ，C 悬空，上升过零 */
    { 2u, 0u, 1u }, /* C+ A- ，B 悬空，下降过零 */
    { 2u, 1u, 0u }  /* C+ B- ，A 悬空，上升过零 */
};

/* 相电压 BEMF 采样通道。
 * 2026-10-10 用 SWD 直扫 ADC（tests/adc_channel_sweep.py，绕过固件的调试采样器）
 * 实测：PA3/PA5/PA6 = 556/483/485 counts，三个脚读数高度一致，是同一绕组的三路
 * 分压；而 PA0/PA1/PA2 = 3715/3657/2782 counts，既不一致也不落地，PA4/PA7（本设计
 * 未用）= 7/8 counts（真悬空读 0）。
 * 结论：BEMF 三根线落在 PA3/PA5/PA6，顺序 A/B/C = CH3/CH5/CH6。 */
static const en_adc_samp_ch_sel_t s_phaseAdcChannel[3] = {
    AdcExInputCH3, /* PA3 - AIN_A */
    AdcExInputCH5, /* PA5 - AIN_B */
    AdcExInputCH6  /* PA6 - AIN_C */
};

/* 调试扫描用：s_debugAdcAll[] 的下标就是 PA 脚号，必须查这张表，
 * 不能用 s_debugChannel 直接索引 s_phaseAdcChannel[]（越界读）。 */
static const en_adc_samp_ch_sel_t s_debugAdcChannel[8] = {
    AdcExInputCH0, AdcExInputCH1, AdcExInputCH2, AdcExInputCH3,
    AdcExInputCH4, AdcExInputCH5, AdcExInputCH6, AdcExInputCH7
};

static volatile uint32_t s_tickMs;
static volatile motor_state_t s_state;
static volatile uint16_t s_startRequest;
static volatile uint16_t s_throttlePercent;
static volatile uint16_t s_actualDuty;
static volatile uint16_t s_pwmHz;
static volatile uint16_t s_pwmPeriod;
static volatile uint32_t s_electricalMilliHz;
static volatile uint16_t s_fault;
static volatile uint16_t s_commOk;
static volatile uint16_t s_commErr;
static volatile uint32_t s_lastCommTick;
static volatile uint16_t s_prechargeMs;

static volatile uint8_t s_bldcState;
static volatile boolean_t s_bemfRising;
static volatile uint16_t s_highestAdc;
static volatile uint16_t s_zeroCrossPoint;
static volatile uint16_t s_adcFilter[5];
static volatile uint8_t s_adcFilterIndex;
static volatile uint32_t s_lastCommutationUs;
static volatile uint32_t s_nextCommutationUs;
static volatile boolean_t s_nextCommutationSet;
static volatile uint32_t s_lastCommutationDurationUs;
static volatile uint32_t s_openLoopPeriodUs;
static volatile uint16_t s_openLoopCommutationCount;
static volatile uint32_t s_startupStartMs;

/* Debug-only: last filtered ADC value for each phase, readable over SWD. */
static volatile uint16_t s_debugPhaseAdc[3];
static volatile uint16_t s_debugAdcAll[8];
static volatile uint8_t s_floatingPhase;

static void Motor_GpioSetOutput(en_gpio_port_t port, en_gpio_pin_t pin, boolean_t value);
static void Motor_GpioSetAdt(en_gpio_port_t port, en_gpio_pin_t pin, en_gpio_af_t af);
static void Motor_AllOutputsOff(void);
static void Motor_DeadtimeDelay(void);
static void Motor_ConfigurePwm(uint16_t hz);
static uint16_t Motor_DutyToCompare(uint16_t dutyPercent);
static void Motor_EnablePhasePwm(uint8_t phase, uint16_t dutyPercent);
static void Motor_DisableTimerOutput(M0P_ADTIM_TypeDef *timer);
static void Motor_ApplyStep(uint8_t step);
static void Motor_UpdateDuty(void);
static void Motor_Communtate(void);
static uint16_t Motor_ReadBemf(void);
static void Motor_DebugSampleAdc(void);
static uint16_t Motor_AdcRead(void);
static void Motor_AdcSelect(uint8_t phase);
static void Motor_FaultNow(uint16_t fault);
static void Motor_BeginPrecharge(void);
static uint32_t Motor_NowUs(void);

static uint32_t Motor_NowUs(void)
{
    return (Tim3_M0_Cnt32Get() * 2u) / 3u;
}

void Motor_Init(void)
{
    stc_adc_cfg_t adcCfg;
    stc_tim3_mode0_cfg_t timeCfg;

    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralAdvTim, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralAdcBgr, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralTim3, TRUE);

    s_tickMs = 0u;
    s_state = MOTOR_STATE_STOPPED;
    s_startRequest = 0u;
    s_throttlePercent = 0u;
    s_actualDuty = 0u;
    s_electricalMilliHz = 0u;
    s_fault = 0u;
    s_commOk = 0u;
    s_commErr = 0u;
    s_lastCommTick = 0u;
    s_prechargeMs = 0u;
    s_bldcState = 0u;
    s_bemfRising = FALSE;
    s_highestAdc = 0u;
    s_zeroCrossPoint = 0u;
    s_adcFilterIndex = 0u;
    s_lastCommutationUs = 0u;
    s_nextCommutationUs = 0u;
    s_nextCommutationSet = FALSE;
    s_lastCommutationDurationUs = 0u;
    s_openLoopPeriodUs = BEMF_OPEN_LOOP_START_US;
    s_openLoopCommutationCount = 0u;
    s_startupStartMs = 0u;
    s_debugPhaseAdc[0] = 0u;
    s_debugPhaseAdc[1] = 0u;
    s_debugPhaseAdc[2] = 0u;
    { uint8_t di; for (di = 0u; di < 8u; di++) { s_debugAdcAll[di] = 0u; } }
    s_floatingPhase = 0u;

    Motor_AllOutputsOff();
    Motor_ConfigurePwm(MOTOR_DEFAULT_PWM_HZ);

    /* BGR must be enabled before ADC / input-buffer use. */
    M0P_BGR->CR_f.BGR_EN = 1u;
    delay10us(2u);

    DDL_ZERO_STRUCT(adcCfg);
    adcCfg.enAdcMode = AdcSglMode;
    adcCfg.enAdcClkDiv = AdcMskClkDiv8;        /* 3 MHz */
    adcCfg.enAdcSampCycleSel = AdcMskSampCycle12Clk;
    adcCfg.enAdcRefVolSel = AdcMskRefVolSelAVDD;
    adcCfg.enAdcOpBuf = AdcMskBufEnable;
    adcCfg.enInRef = AdcMskInRefDisable;
    adcCfg.enAdcAlign = AdcAlignRight;
    (void)Adc_Init(&adcCfg);
    Adc_Enable();
    Adc_SGL_Stop();
    (void)Adc_CfgSglChannel(s_phaseAdcChannel[2]);
    Adc_ClrIrqStatus(AdcMskIrqSgl);

    /* PA0..PA7 are ADC-capable; phase voltage uses PA3/PA5/PA6 (see s_phaseAdcChannel).
     * PA4/PA7 are restored to motor functions when a step is applied. */
    (void)Gpio_SetAnalogMode(GpioPortA, GpioPin0);
    (void)Gpio_SetAnalogMode(GpioPortA, GpioPin1);
    (void)Gpio_SetAnalogMode(GpioPortA, GpioPin2);
    (void)Gpio_SetAnalogMode(GpioPortA, GpioPin3);
    (void)Gpio_SetAnalogMode(GpioPortA, GpioPin4);
    (void)Gpio_SetAnalogMode(GpioPortA, GpioPin5);
    (void)Gpio_SetAnalogMode(GpioPortA, GpioPin6);
    (void)Gpio_SetAnalogMode(GpioPortA, GpioPin7);

    DDL_ZERO_STRUCT(timeCfg);
    timeCfg.enWorkMode = Tim3WorkMode0;
    timeCfg.enGateP = Tim3GatePositive;
    timeCfg.bEnGate = FALSE;
    timeCfg.enPRS = Tim3PCLKDiv16;             /* 24 MHz / 16 = 1.5 MHz */
    timeCfg.bEnTog = FALSE;
    timeCfg.enCT = Tim3Timer;
    timeCfg.enCntMode = Tim332bitFreeMode;
    (void)Tim3_Mode0_Init(&timeCfg);
    Tim3_M0_Cnt32Set(0u);
    (void)Tim3_M0_Run();
}

void Motor_Service(void)
{
    uint32_t now;
    uint16_t adc;
    boolean_t cross;

    if (s_state == MOTOR_STATE_STOPPED) {
        Motor_DebugSampleAdc();
        return;
    }
    if (s_state == MOTOR_STATE_FAULT) {
        return;
    }
    if (s_state == MOTOR_STATE_PRECHARGE) {
        return;
    }

    now = Motor_NowUs();

    if (s_state == MOTOR_STATE_RAMP) {
        if (s_nextCommutationSet && ((int32_t)(now - s_nextCommutationUs) >= 0)) {
            Motor_Communtate();
        }

        adc = Motor_ReadBemf();
        if (adc > s_highestAdc) {
            s_highestAdc = adc;
        }

        cross = ((s_bemfRising && (adc > s_zeroCrossPoint)) ||
                 ((!s_bemfRising) && (adc < s_zeroCrossPoint)));

        if ((s_openLoopCommutationCount >= BEMF_OPEN_LOOP_MIN_COMMUTATIONS) && cross) {
            s_state = MOTOR_STATE_CLOSED_LOOP;
            s_nextCommutationSet = FALSE;
            s_lastCommutationUs = now;
            s_electricalMilliHz = 0u;
        }

        if ((s_tickMs - s_startupStartMs) > BEMF_STARTUP_TIMEOUT_MS) {
            Motor_FaultNow(BEMF_FAULT_BEMF_LOST);
        }
        return;
    }

    if (s_state == MOTOR_STATE_CLOSED_LOOP) {
        adc = Motor_ReadBemf();

        cross = ((s_bemfRising && (adc > s_zeroCrossPoint)) ||
                 ((!s_bemfRising) && (adc < s_zeroCrossPoint)));

        if (!s_nextCommutationSet && cross) {
            s_nextCommutationUs = now + (s_lastCommutationDurationUs / 2u);
            s_nextCommutationSet = TRUE;
        }

        if (s_nextCommutationSet && ((int32_t)(now - s_nextCommutationUs) >= 0)) {
            Motor_Communtate();
        } else {
            uint32_t timeout = s_lastCommutationDurationUs * BEMF_STEP_TIMEOUT_MULTIPLIER;
            if (timeout < 2000u) {
                timeout = 2000u;
            }
            if ((now - s_lastCommutationUs) > timeout) {
                Motor_FaultNow(BEMF_FAULT_BEMF_LOST);
            }
        }
    }
}

void Motor_Tick1ms(void)
{
    s_tickMs++;

    if (s_state == MOTOR_STATE_FAULT || s_startRequest == 0u || s_throttlePercent == 0u) {
        return;
    }

    if ((s_tickMs - s_lastCommTick) > MOTOR_COMMAND_TIMEOUT_MS) {
        Motor_FaultNow(BEMF_FAULT_COMMAND_TIMEOUT);
        return;
    }

    if (s_state == MOTOR_STATE_PRECHARGE) {
        s_prechargeMs++;
        if (s_prechargeMs >= MOTOR_PRECHARGE_MS) {
            s_state = MOTOR_STATE_RAMP;
            s_bldcState = 0u;
            s_openLoopPeriodUs = BEMF_OPEN_LOOP_START_US;
            s_openLoopCommutationCount = 0u;
            s_highestAdc = 0u;
            s_zeroCrossPoint = 0u;
            s_lastCommutationUs = Motor_NowUs();
            s_nextCommutationUs = s_lastCommutationUs + s_openLoopPeriodUs;
            s_nextCommutationSet = TRUE;
            s_startupStartMs = s_tickMs;
            Motor_ApplyStep(0u);
        }
    }
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
    s_nextCommutationSet = FALSE;
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
        Motor_CommandStop();
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

uint16_t Motor_GetRunState(void)
{
    if (s_state == MOTOR_STATE_PRECHARGE ||
        s_state == MOTOR_STATE_RAMP ||
        s_state == MOTOR_STATE_CLOSED_LOOP) {
        return 1u;
    }
    return 0u;
}

uint16_t Motor_GetStartRequest(void) { return s_startRequest; }
uint16_t Motor_GetThrottlePercent(void) { return s_throttlePercent; }
uint16_t Motor_GetPwmFrequency(void) { return s_pwmHz; }
uint16_t Motor_GetActualDuty(void) { return s_actualDuty; }
uint16_t Motor_GetFault(void) { return s_fault; }
uint16_t Motor_GetCommOkCount(void) { return s_commOk; }
uint16_t Motor_GetCommErrCount(void) { return s_commErr; }
uint32_t Motor_GetTickMs(void) { return s_tickMs; }

uint16_t Motor_GetElectricalHz(void)
{
    if (s_lastCommutationDurationUs == 0u) {
        return (uint16_t)(s_electricalMilliHz / 1000u);
    }
    return (uint16_t)(1000000u / (6u * s_lastCommutationDurationUs));
}

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

static void Motor_BeginPrecharge(void)
{
    s_state = MOTOR_STATE_PRECHARGE;
    s_prechargeMs = 0u;
    s_actualDuty = MOTOR_PRECHARGE_DUTY_PERCENT;
    s_bldcState = 0u;
    s_highestAdc = 0u;
    s_zeroCrossPoint = 0u;
    s_lastCommutationUs = Motor_NowUs();
    Motor_ApplyStep(0u);
}

static void Motor_FaultNow(uint16_t fault)
{
    s_fault |= fault;
    s_startRequest = 0u;
    s_state = MOTOR_STATE_FAULT;
    s_actualDuty = 0u;
    s_electricalMilliHz = 0u;
    s_nextCommutationSet = FALSE;
    s_prechargeMs = 0u;
    Motor_AllOutputsOff();
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
        (void)Adt_SetCompareValue(s_phase[i].timer, AdtCompareC, (uint16_t)(period - 1u));

        chCfg.enCap = AdtCHxCompareOutput;
        chCfg.bOutEn = TRUE;
        /* 按 SDK 的 adt/CompareOutput 例程配 CHA：PeriodLow + CompareHigh。
         * 原来沿用 F005 的 PeriodKeep + CompareInv，在 F072 上实测输出恒高、
         * 完全没有方波（定时器计数/周期/比较值/OUTENA 都是对的）。 */
        chCfg.enPerc = AdtCHxPeriodLow;
        chCfg.enCmpc = AdtCHxCompareHigh;
        chCfg.enStaStp = AdtCHxStateSelSS;
        chCfg.enStaOut = AdtCHxPortOutLow;
        chCfg.enStpOut = AdtCHxPortOutLow;
        chCfg.enDisVal = AdtTIMxDisValLow;
        /* DISSELA 必须显式选到"不触发"的那一档。DDL_ZERO_STRUCT 会把它留成
         * AdtCHxDisSel0，而条件 0 在本板上是被 break 功能拉活的：结果是定时器
         * 计数、PERAR/GCMAR 都对、OUTENA 也是 1，引脚却被永久强制到 DISVALA
         * (低)，一点方波都没有。可对照的 F005 版显式用的是 AdtCHxDisSel3。 */
        chCfg.enDisSel = AdtCHxDisSel3;
        (void)Adt_CHxXPortCfg(s_phase[i].timer, AdtCHxA, &chCfg);
        (void)Adt_EnableValueBuf(s_phase[i].timer, AdtCHxA, TRUE);

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

    if (dutyPercent > BEMF_MAX_DUTY_PERCENT) {
        dutyPercent = BEMF_MAX_DUTY_PERCENT;
    }

    compare = period - ((period * (uint32_t)dutyPercent) / 100u);
    if (compare < 1u) {
        compare = 1u;
    } else if (compare >= period) {
        compare = period - 1u;
    }
    return (uint16_t)compare;
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
    (void)Adt_SetCompareValue(s_phase[phase].timer, AdtCompareC, compare);
    Motor_GpioSetAdt(s_phase[phase].highPort, s_phase[phase].highPin, s_phase[phase].highAf);
    s_phase[phase].timer->PCONR_f.OUTENA = TRUE;
}

static void Motor_UpdateDuty(void)
{
    uint8_t high;
    uint16_t duty;
    uint16_t compare;

    if (s_bldcState >= 6u) {
        return;
    }

    high = s_step[s_bldcState][0];
    duty = (s_state == MOTOR_STATE_PRECHARGE) ? MOTOR_PRECHARGE_DUTY_PERCENT : s_throttlePercent;
    if (duty > BEMF_MAX_DUTY_PERCENT) {
        duty = BEMF_MAX_DUTY_PERCENT;
    }
    if (duty == 0u) {
        duty = 1u;
    }
    s_actualDuty = duty;
    compare = Motor_DutyToCompare(duty);
    (void)Adt_SetCompareValue(s_phase[high].timer, AdtCompareA, compare);
    (void)Adt_SetCompareValue(s_phase[high].timer, AdtCompareC, compare);
}

static void Motor_ApplyStep(uint8_t step)
{
    uint8_t high;
    uint8_t low;
    uint8_t floating;
    uint8_t i;

    step = (uint8_t)(step % 6u);
    high = s_step[step][0];
    low = s_step[step][1];
    floating = s_step[step][2];

    Motor_AllOutputsOff();
    Motor_DeadtimeDelay();

    Motor_GpioSetOutput(s_phase[low].lowPort, s_phase[low].lowPin, TRUE);

    Motor_EnablePhasePwm(high, (s_state == MOTOR_STATE_PRECHARGE) ? MOTOR_PRECHARGE_DUTY_PERCENT : s_throttlePercent);
    for (i = 0u; i < 3u; i++) {
        if (i != high && i != low) {
            Motor_GpioSetOutput(s_phase[i].highPort, s_phase[i].highPin, FALSE);
            Motor_GpioSetOutput(s_phase[i].lowPort, s_phase[i].lowPin, FALSE);
        }
    }

    Motor_AdcSelect(floating);
    s_floatingPhase = floating;

    /* 悬浮相过零方向与 s_step 表顺序绑定：偶数步下降过零、奇数步上升过零，
     * 等价于 F005 表里 bemfSignBeforeCross = -1（负半周先出现）→ 上升沿。 */
    s_bemfRising = ((step & 1u) != 0u);
    if (step == 0u || step == 2u || step == 4u) {
        s_zeroCrossPoint = (uint16_t)(s_highestAdc / 2u);
        s_highestAdc = 0u;
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

    for (i = 0u; i < 8u; i++) {
        __NOP();
    }
}

static void Motor_Communtate(void)
{
    uint32_t now = Motor_NowUs();
    uint32_t duration = now - s_lastCommutationUs;

    if (duration > 0u) {
        s_lastCommutationDurationUs = duration;
    }
    s_lastCommutationUs = now;

    s_bldcState = (uint8_t)((s_bldcState + 1u) % 6u);
    Motor_ApplyStep(s_bldcState);

    if (s_state == MOTOR_STATE_RAMP) {
        if (s_openLoopPeriodUs > BEMF_OPEN_LOOP_MIN_US) {
            uint64_t t = s_openLoopPeriodUs;
            uint32_t decrement =
                (uint32_t)(((uint64_t)BEMF_OPEN_LOOP_ACCEL_C * t * t * t)
                           / 1000000000000ull);
            if (decrement < 1u) {
                decrement = 1u;
            }
            if (s_openLoopPeriodUs > (BEMF_OPEN_LOOP_MIN_US + decrement)) {
                s_openLoopPeriodUs -= decrement;
            } else {
                s_openLoopPeriodUs = BEMF_OPEN_LOOP_MIN_US;
            }
        }
        s_nextCommutationUs = now + s_openLoopPeriodUs;
        s_nextCommutationSet = TRUE;
        if (s_openLoopCommutationCount < 0xFFFFu) {
            s_openLoopCommutationCount++;
        }
        s_electricalMilliHz = (1000000000u / (6u * s_openLoopPeriodUs));
    } else {
        s_nextCommutationSet = FALSE;
        if (s_lastCommutationDurationUs > 0u) {
            s_electricalMilliHz = (1000000000u / (6u * s_lastCommutationDurationUs));
        }
    }
}

static void Motor_AdcSelect(uint8_t phase)
{
    Adc_SGL_Stop();
    (void)Adc_CfgSglChannel(s_phaseAdcChannel[phase]);
    Adc_ClrIrqStatus(AdcMskIrqSgl);
}

static uint16_t Motor_AdcRead(void)
{
    uint16_t value;

    /* First conversion discharges the sample/hold capacitor; use the second. */
    Adc_SGL_Start();
    while (!Adc_GetIrqStatus(AdcMskIrqSgl)) {
    }
    Adc_ClrIrqStatus(AdcMskIrqSgl);
    (void)Adc_GetSglResult();
    Adc_SGL_Stop();

    Adc_SGL_Start();
    while (!Adc_GetIrqStatus(AdcMskIrqSgl)) {
    }
    Adc_ClrIrqStatus(AdcMskIrqSgl);
    value = (uint16_t)Adc_GetSglResult();
    Adc_SGL_Stop();
    return value;
}

static void Motor_DebugSampleAdc(void)
{
    static uint8_t s_debugChannel = 0u;
    uint16_t value;

    s_debugChannel = (uint8_t)((s_debugChannel + 1u) % 8u);
    Adc_SGL_Stop();
    (void)Adc_CfgSglChannel(s_debugAdcChannel[s_debugChannel]);
    Adc_ClrIrqStatus(AdcMskIrqSgl);
    value = Motor_AdcRead();
    s_debugAdcAll[s_debugChannel] = value;

    {
        uint8_t phase;
        for (phase = 0u; phase < 3u; phase++) {
            if (s_debugAdcChannel[s_debugChannel] == s_phaseAdcChannel[phase]) {
                s_debugPhaseAdc[phase] = value;
            }
        }
    }
}

static uint16_t Motor_ReadBemf(void)
{
    uint32_t sum = 0u;
    uint8_t i;

    s_adcFilter[s_adcFilterIndex] = Motor_AdcRead();
    s_adcFilterIndex = (uint8_t)((s_adcFilterIndex + 1u) % 5u);

    for (i = 0u; i < 5u; i++) {
        sum += s_adcFilter[i];
    }
    {
        uint16_t avg = (uint16_t)(sum / 5u);
        if (s_floatingPhase < 3u) {
            s_debugPhaseAdc[s_floatingPhase] = avg;
        }
        return avg;
    }
}

void SysTick_IRQHandler(void)
{
    Motor_Tick1ms();
}
