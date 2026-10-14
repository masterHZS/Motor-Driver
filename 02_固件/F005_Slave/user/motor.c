/******************************************************************************
 * motor.c - sensorless six-step controller for HC32F005C6PA + FD6288T
 *           motor-driver-V3.1 (hardware frozen)
 *
 * Why this file was rewritten
 * ---------------------------
 * The Hall-less 2216-730KV pump cannot use a fixed frequency ramp as its final
 * control law.  The only usable position signal is the floating-phase BEMF.
 *
 * This implementation uses:
 *   HOLD        - all gates off
 *   ALIGN       - fixed vector, low duty
 *   OPEN_LOOP   - approximate V/f acceleration to establish BEMF
 *   CLOSED_LOOP - BEMF zero crossing + 30 electrical degrees delay
 *   FAULT       - latched shutdown
 *
 * PWM uses the XHSC HC32F005 DDL Rev2.0.0 complementary-output pattern:
 *   CHA: CompareInv + PeriodKeep, start low
 *   CHB: CompareInv + PeriodKeep, start high
 * DTCEN=1 makes the ADT derive GCMBR from GCMAR and DTUAR/DTDAR.  Do not
 * write GCMBR by hand in this mode.  Compare values are updated through the
 * GCMCR buffer at the triangle valley so a commutation never cuts a pulse.
 ******************************************************************************/

#include "motor.h"
#include "bemf_observer.h"
#include "speed_control.h"

#include "adc.h"
#include "adt.h"
#include "gpio.h"
#include "sysctrl.h"

/* --------------------------------------------------------------------------
 * Constants
 * ----------------------------------------------------------------------- */
#define MOTOR_PCLK_HZ             (24000000u)
#define MOTOR_PERAR               (MOTOR_PCLK_HZ / (2u * MOTOR_PWM_DEFAULT_HZ))
#define MOTOR_CMP_MIN             (1u)
#define MOTOR_CMP_MAX             (MOTOR_PERAR)

#define MOTOR_COMM_TIMER          M0P_TIM1
#define MOTOR_TIME_TIMER          M0P_TIM2
#define MOTOR_BT_PRESCALE_DIV64   (6u)
#define MOTOR_COMM_CLOCK_HZ       (MOTOR_PCLK_HZ / 64u)   /* 375000 Hz */
#define MOTOR_TICK_PERIOD_COUNTS  (MOTOR_PCLK_HZ / 1000u)
#define MOTOR_TICK_RELOAD         ((uint16_t)(0x10000u - MOTOR_TICK_PERIOD_COUNTS))
#define MOTOR_STEP_TICKS_SCALE    (MOTOR_COMM_CLOCK_HZ * 1000u / 6u) /* 62.5e6 */

#define MOTOR_ADC_CH_ISENSE       (AdcExInputCH5)   /* P35 / AIN5 */
#define MOTOR_ADC_CH_VBUS         (AdcExInputCH7)   /* P01 / AIN7 */
#define MOTOR_ADC_CH_PHASE_A      (AdcExInputCH0)   /* P24 / AIN0 */
#define MOTOR_ADC_CH_PHASE_B      (AdcExInputCH3)   /* P33 / AIN3 */
#define MOTOR_ADC_CH_PHASE_C      (AdcExInputCH8)   /* P02 / AIN8 */
#define MOTOR_ADC_CH_NEUTRAL      (AdcExInputCH4)   /* VN飞线 -> P34，第1脚 */
#define MOTOR_ADC_SAMPLE_COMPARE  (300u) /* 三角波下降段，高边已关断 */
#define MOTOR_ADC_ACQUIRE_GUARD    (80u)  /* 4 ADC clocks + software margin */

#define MOTOR_DEADTIME_COUNTS     (24u)   /* 1 us at PCLK0 = 24 MHz */
#define MOTOR_ADC_CURRENT_EVERY   (4u)
#define MOTOR_ADC_VBUS_EVERY      (100u)

#define MOTOR_ISENSE_MIN          (4u)
#define MOTOR_VBUS_MIN_COUNTS     (32u)

/* --------------------------------------------------------------------------
 * Pin / timer description
 * ----------------------------------------------------------------------- */
typedef struct {
    en_gpio_port_t     highPort;
    en_gpio_pin_t      highPin;
    en_gpio_af_t       highAf;
    en_gpio_port_t     lowPort;
    en_gpio_pin_t      lowPin;
    en_gpio_af_t       lowAf;
    M0P_ADTIM_TypeDef *timer;
} motor_phase_hw_t;

static const motor_phase_hw_t s_phase[3] = {
    /* A */ { GpioPort2, GpioPin3, GpioAf3, GpioPort1, GpioPin5, GpioAf3, M0P_ADTIM4 },
    /* B */ { GpioPort2, GpioPin5, GpioAf3, GpioPort2, GpioPin6, GpioAf3, M0P_ADTIM5 },
    /* C */ { GpioPort3, GpioPin6, GpioAf2, GpioPort3, GpioPin2, GpioAf3, M0P_ADTIM6 },
};

enum {
    MOTOR_PHASE_A = 0u,
    MOTOR_PHASE_B = 1u,
    MOTOR_PHASE_C = 2u,
    MOTOR_PHASE_COUNT = 3u,
    MOTOR_STEP_COUNT = 6u
};

typedef struct {
    uint8_t highSide;
    uint8_t lowSide;
    uint8_t floating;
    int8_t  bemfSignBeforeCross; /* sign of Vfloat - Vneutral before zero */
} motor_step_t;

/* Positive direction: AB -> AC -> BC -> BA -> CA -> CB. */
static const motor_step_t s_step[MOTOR_STEP_COUNT] = {
    { MOTOR_PHASE_A, MOTOR_PHASE_B, MOTOR_PHASE_C,  1 },
    { MOTOR_PHASE_A, MOTOR_PHASE_C, MOTOR_PHASE_B, -1 },
    { MOTOR_PHASE_B, MOTOR_PHASE_C, MOTOR_PHASE_A,  1 },
    { MOTOR_PHASE_B, MOTOR_PHASE_A, MOTOR_PHASE_C, -1 },
    { MOTOR_PHASE_C, MOTOR_PHASE_A, MOTOR_PHASE_B,  1 },
    { MOTOR_PHASE_C, MOTOR_PHASE_B, MOTOR_PHASE_A, -1 }
};

static const uint8_t s_phaseAdcChannel[MOTOR_PHASE_COUNT] = {
    (uint8_t)AdcExInputCH0,
    (uint8_t)AdcExInputCH3,
    (uint8_t)AdcExInputCH8
};

typedef enum {
    MOTOR_PHASE_FLOAT = 0u,
    MOTOR_PHASE_HIGH_PWM,
    MOTOR_PHASE_LOW_ON
} motor_phase_mode_t;

typedef enum {
    MOTOR_ADC_NONE = 0u,
    MOTOR_ADC_BEMF,
    MOTOR_ADC_NEUTRAL_FIRST,
    MOTOR_ADC_NEUTRAL_LAST,
    MOTOR_ADC_CURRENT,
    MOTOR_ADC_VBUS
} motor_adc_kind_t;

/* --------------------------------------------------------------------------
 * State
 * ----------------------------------------------------------------------- */
static volatile motor_state_t s_state;
static volatile uint16_t s_startRequest;
static volatile uint16_t s_throttlePercent;
static volatile uint16_t s_throttleRequestPercent;
static volatile uint16_t s_actualDuty;
static volatile uint16_t s_fault;
static volatile uint16_t s_commOk;
static volatile uint16_t s_commErr;

static volatile uint32_t s_tickMs;
static volatile uint32_t s_lastCommTick;
static volatile uint32_t s_selftestElapsedMs;
static volatile boolean_t s_selftestRunning;
static volatile boolean_t s_selftestDone;
static volatile boolean_t s_continuousRun;
static volatile boolean_t s_commRequired;
static volatile boolean_t s_prechargeApplied;
static volatile boolean_t s_alignStepApplied;

static volatile uint32_t s_electricalMilliHz;
static volatile uint32_t s_rampAccumulatorMs;
static volatile uint8_t  s_stepIndex;
static volatile uint32_t s_stepCount;
static volatile uint16_t s_openLoopCommutationCount;
static volatile uint8_t  s_pendingStep;
static volatile boolean_t s_stepPending;
static volatile boolean_t s_dutyPending;
static volatile uint16_t s_pendingDutyCompare;
static volatile uint16_t s_pendingDutyPercent;

/* TIM2 is a free-running 32-bit time base at 375 kHz. TIM1 is the one-shot
 * commutation timer at the same rate; TIM0 is reserved for UART0 baud. */
static volatile uint32_t s_lastCommutationTick;
static volatile uint32_t s_lastStepTicks;
static volatile boolean_t s_commutationScheduled;

/* BEMF observer. */
static volatile uint16_t s_bemfCounts;
static volatile uint16_t s_bemfThresholdCounts;
static volatile uint32_t s_zeroCrossCount;
static bemf_observer_t s_observer;
static volatile uint8_t s_lockSteps;
static volatile uint32_t s_lastZeroCrossTick;
static volatile boolean_t s_zeroCrossValid;
static speed_control_t s_speedControl;
static volatile uint16_t s_closedDutyPermille;

/* ADC sharing between BEMF, current and bus protection. */
static volatile motor_adc_kind_t s_adcKind;
static volatile boolean_t s_adcPending;
static volatile uint32_t s_pwmCycle;
static volatile uint8_t s_adcStep;
static volatile uint32_t s_adcTick;
static volatile uint32_t s_adcFrameTick;
static volatile uint32_t s_adcNeutralFirstTick;
static volatile uint32_t s_adcPhaseTick;
static volatile uint16_t s_adcNeutralFirst;
static volatile uint16_t s_adcPhase;
static volatile uint32_t s_currentSampleCycle;

/* Protection / diagnostics. */
static volatile uint16_t s_vbusCounts;
static volatile boolean_t s_vbusValid;
static volatile uint16_t s_isenseCounts;
static volatile uint16_t s_isensePeakCounts;
static volatile uint32_t s_adcOverrunCount;

/* --------------------------------------------------------------------------
 * Forward declarations
 * ----------------------------------------------------------------------- */
static void Motor_AdcInit(void);
static void Motor_AdcStartChannel(uint8_t channel);
static void Motor_UpdateAdcResult(void);

static void Motor_SysTickInit(void);
static void Motor_CommTimerInit(void);
static void Motor_TimeTimerInit(void);
static void Motor_ArmCommutationDelay(uint32_t delayTicks);
static void Motor_StopCommutationTimer(void);
static uint32_t Motor_NowTicks(void);

static void Motor_AdtInit(void);
static void Motor_StopAllPwm(void);
static void Motor_StartAllPwm(void);
static void Motor_SetPhaseMode(uint8_t phase, motor_phase_mode_t mode, uint16_t cmp);
static void Motor_AllOutputsOff(void);
static void Motor_AllLowSidesOn(void);
static void Motor_RequestStep(uint8_t step);
static void Motor_ApplyStepAtValley(uint8_t step);
static void Motor_UpdateDuty(void);
static uint16_t Motor_ClampDutyPercent(uint16_t dutyPercent);
static uint16_t Motor_DutyToCompare(uint16_t dutyPercent);
static uint8_t  Motor_MapPhase(uint8_t phase);
static void     Motor_BeginStartup(void);
static uint16_t Motor_ThrottleToDutyPercent(uint16_t percent);

static void Motor_FaultNow(uint16_t fault);
static void Motor_BemfReset(void);
static void Motor_BemfProcess(uint16_t raw);
static void __attribute__((noinline)) Motor_OnZeroCross(uint32_t crossingTick);
static void Motor_CommutationIrq(void);
static void Motor_AdcTriggerFromPwm(void);
static boolean_t Motor_AdcOffWindowAvailable(void);
static void Motor_PrepareCurrentForPeak(void);
static uint32_t Motor_StepTicksFromMilliHz(uint32_t milliHz);
static uint32_t Motor_MilliHzFromStepTicks(uint32_t stepTicks);

/* --------------------------------------------------------------------------
 * ADC
 * ----------------------------------------------------------------------- */
static void Motor_AdcInit(void)
{
    stc_adc_cfg_t      cfg;
    stc_adc_norm_cfg_t norm;

    Sysctrl_SetPeripheralGate(SysctrlPeripheralAdcBgr, TRUE);
    M0P_BGR->CR_f.BGR_EN = 1u;

    Adc_Enable();
    delay100us(1u);

    DDL_ZERO_STRUCT(cfg);
    cfg.enAdcOpMode      = AdcNormalMode;
    cfg.enAdcClkSel      = AdcClkSysTDiv8;      /* 3 MHz, <= 200 ksps at 2.5 V ref */
    cfg.enAdcSampTimeSel = AdcSampTime4Clk;     /* sample window 1.33 us */
    cfg.enAdcRefVolSel   = RefVolSelInBgr2p5;
    cfg.bAdcInBufEn      = FALSE;
    cfg.enAdcTrig0Sel    = AdcTrigDisable;
    cfg.enAdcTrig1Sel    = AdcTrigDisable;
    (void)Adc_Init(&cfg);

    DDL_ZERO_STRUCT(norm);
    norm.enAdcNormModeCh = MOTOR_ADC_CH_PHASE_A;
    norm.bAdcResultAccEn = FALSE;
    (void)Adc_ConfigNormMode(&cfg, &norm);
    Adc_ClrContIrqState();
    Adc_EnableIrq();
    EnableNvic(ADC_IRQn, IrqLevel1, TRUE);
}

static void Motor_AdcStartChannel(uint8_t channel)
{
    /* Direct register writes keep the 20 kHz PWM ISR short. */
    M0P_ADC->CR1_f.CT = 0u;                 /* single conversion mode */
    M0P_ADC->CR0_f.SEL = ((uint32_t)channel & 0x0Fu);
    M0P_ADC->ICLR = ~(1u << 3);
    s_adcTick = Motor_NowTicks();
    s_adcPending = TRUE;
    M0P_ADC->CR0_f.START = 1u;
}

static void Motor_UpdateAdcResult(void)
{
    uint16_t raw = 0u;
    uint32_t mv;

    if ((s_adcPending == 0u) || M0P_ADC->CR0_f.START) {
        return;
    }

    raw = (uint16_t)M0P_ADC->RESULT_f.RESULT;
    s_adcPending = FALSE;
    if (s_adcKind == MOTOR_ADC_CURRENT) { M0P_ADC->CR1_f.TRIGS0 = AdcTrigDisable; }

    switch (s_adcKind) {
    case MOTOR_ADC_NEUTRAL_FIRST:
        s_adcNeutralFirst = raw;
        s_adcNeutralFirstTick = s_adcTick;
        if (s_adcStep != s_stepIndex || s_stepPending ||
            !Motor_AdcOffWindowAvailable()) { break; }
        s_adcKind = MOTOR_ADC_BEMF;
        Motor_AdcStartChannel(s_phaseAdcChannel[Motor_MapPhase(s_step[s_adcStep].floating)]);
        return;

    case MOTOR_ADC_BEMF:
        s_adcPhase = raw;
        s_adcPhaseTick = s_adcTick;
        if (s_adcStep != s_stepIndex || s_stepPending ||
            !Motor_AdcOffWindowAvailable()) { break; }
        s_adcKind = MOTOR_ADC_NEUTRAL_LAST;
        Motor_AdcStartChannel((uint8_t)MOTOR_ADC_CH_NEUTRAL);
        return;

    case MOTOR_ADC_NEUTRAL_LAST:
        if (s_adcStep == s_stepIndex && !s_stepPending &&
            (s_adcTick - s_adcFrameTick) <= MOTOR_ADC_MAX_FRAME_TICKS) {
            s_bemfThresholdCounts = Bemf_InterpolateNeutral(
                s_adcNeutralFirst, raw, s_adcNeutralFirstTick,
                s_adcPhaseTick, s_adcTick);
            Motor_BemfProcess(s_adcPhase);
        }
        break;

    case MOTOR_ADC_CURRENT:
        s_isenseCounts = raw;
        if (raw > s_isensePeakCounts) {
            s_isensePeakCounts = raw;
        }
        if (raw > MOTOR_OC_TRIP_COUNTS) {
            Motor_FaultNow(MOTOR_FAULT_OVERCURRENT);
        }
        break;

    case MOTOR_ADC_VBUS:
        s_vbusCounts = raw;
        if (raw >= MOTOR_VBUS_MIN_COUNTS) {
            s_vbusValid = TRUE;
            mv = ((uint32_t)raw * 14038u + 500u) / 1000u;
            if ((s_selftestRunning != 0u) && (mv < MOTOR_VBUS_MIN_MV)) {
                Motor_FaultNow(MOTOR_FAULT_UNDERVOLTAGE);
            } else if ((s_selftestRunning != 0u) && (mv > MOTOR_VBUS_MAX_MV)) {
                Motor_FaultNow(MOTOR_FAULT_OVERVOLTAGE);
            }
        } else {
            s_vbusValid = FALSE;
            if (s_selftestRunning) { Motor_FaultNow(MOTOR_FAULT_UNDERVOLTAGE); }
        }
        break;

    default:
        break;
    }

    s_adcKind = MOTOR_ADC_NONE;
    Motor_PrepareCurrentForPeak();
}

void Adc_IRQHandler(void)
{
    if (M0P_ADC->IFR_f.CONT_INTF) {
        M0P_ADC->ICLR = ~(1u << 3);
        Motor_UpdateAdcResult();
    }
}

/* --------------------------------------------------------------------------
 * Base timers
 * ----------------------------------------------------------------------- */
static uint32_t Motor_NowTicks(void)
{
    return MOTOR_TIME_TIMER->CNT32_f.CNT32;
}

static void Motor_SysTickInit(void)
{
    /* The F005 UART0 baud generator owns TIM0.  Keep the motor 1 ms software
     * tick on the Cortex-M0+ SysTick so TIM0 remains available after the SWD
     * release delay. */
    SysTick->LOAD = (uint32_t)(MOTOR_TICK_PERIOD_COUNTS - 1u);
    SysTick->VAL  = 0u;
    SysTick->CTRL = 0x00000007u;   /* core clock, interrupt enabled, enable */
    NVIC_SetPriority(SysTick_IRQn, 3u);
}

static void Motor_CommTimerInit(void)
{
    Sysctrl_SetPeripheralGate(SysctrlPeripheralBt, TRUE);

    MOTOR_COMM_TIMER->CR   = 0u;
    MOTOR_COMM_TIMER->ARR  = 0xFFFFu;
    MOTOR_COMM_TIMER->CNT  = 0u;
    MOTOR_COMM_TIMER->ICLR = 0u;

    MOTOR_COMM_TIMER->CR_f.MD   = 1u;                    /* reload mode */
    MOTOR_COMM_TIMER->CR_f.PRS  = MOTOR_BT_PRESCALE_DIV64;
    MOTOR_COMM_TIMER->CR_f.UIE  = 1u;
    MOTOR_COMM_TIMER->CR_f.CTEN = 0u;

    EnableNvic(TIM1_IRQn, IrqLevel1, TRUE);
}

static void Motor_TimeTimerInit(void)
{
    Sysctrl_SetPeripheralGate(SysctrlPeripheralBt, TRUE);

    MOTOR_TIME_TIMER->CR = 0u;
    MOTOR_TIME_TIMER->CNT32 = 0u;
    MOTOR_TIME_TIMER->CR_f.MD   = 0u;                    /* 32-bit free run */
    MOTOR_TIME_TIMER->CR_f.PRS  = MOTOR_BT_PRESCALE_DIV64;
    MOTOR_TIME_TIMER->CR_f.CTEN = 1u;
}

static void Motor_ArmCommutationDelay(uint32_t delayTicks)
{
    uint16_t reload;

    if (delayTicks == 0u) {
        delayTicks = 1u;
    }
    if (delayTicks > 65535u) {
        delayTicks = 65535u;
    }

    MOTOR_COMM_TIMER->CR_f.CTEN = 0u;
    MOTOR_COMM_TIMER->ICLR = 0u;

    reload = (uint16_t)(0u - (uint16_t)delayTicks);
    MOTOR_COMM_TIMER->ARR = reload;
    MOTOR_COMM_TIMER->CNT = reload;
    MOTOR_COMM_TIMER->CR_f.CTEN = 1u;
}

static void Motor_StopCommutationTimer(void)
{
    MOTOR_COMM_TIMER->CR_f.CTEN = 0u;
    MOTOR_COMM_TIMER->ICLR = 0u;
    s_commutationScheduled = FALSE;
}

/* --------------------------------------------------------------------------
 * ADT / PWM
 * ----------------------------------------------------------------------- */
static void Motor_AdtInit(void)
{
    uint8_t i;
    stc_adt_basecnt_cfg_t base;
    stc_adt_sw_sync_t sync;

    Sysctrl_SetPeripheralGate(SysctrlPeripheralAdvTim, TRUE);

    DDL_ZERO_STRUCT(base);
    base.enCntMode    = AdtTriangleModeA;
    base.enCntDir     = AdtCntUp;
    base.enCntClkDiv  = AdtClkPClk0;

    for (i = 0u; i < MOTOR_PHASE_COUNT; i++) {
        M0P_ADTIM_TypeDef *t = s_phase[i].timer;

        (void)Adt_Init(t, &base);
        (void)Adt_SetPeriod(t, MOTOR_PERAR);
        (void)Adt_SetCompareValue(t, AdtCompareD, MOTOR_ADC_SAMPLE_COMPARE);

        /* All three timers start in a defined float state.  PCONR fields are
         * installed before the counters are synchronously released; the board
         * has external 10 kOhm pull-downs on every FD6288T input as well. */
        t->PCONR = 0u;
        t->PCONR_f.CAPCA    = AdtCHxCompareOutput;
        t->PCONR_f.CAPCB    = AdtCHxCompareOutput;
        t->PCONR_f.STASTPSA = AdtCHxStateSelSS;
        t->PCONR_f.STASTPSB = AdtCHxStateSelSS;
        t->PCONR_f.STPCA    = AdtCHxPortOutLow;
        t->PCONR_f.STPCB    = AdtCHxPortOutLow;
        t->PCONR_f.DISSELA  = AdtCHxDisSel3;
        t->PCONR_f.DISSELB  = AdtCHxDisSel3;
        t->PCONR_f.DISVALA  = AdtTIMxDisValLow;
        t->PCONR_f.DISVALB  = AdtTIMxDisValLow;
        t->PCONR_f.OUTENA   = TRUE;
        t->PCONR_f.OUTENB   = TRUE;

        Motor_SetPhaseMode(i, MOTOR_PHASE_FLOAT, 0u);
        (void)Adt_ClearCount(t);
    }

    Adt_ClearAllIrqFlag(M0P_ADTIM4);
    (void)Adt_CfgIrq(M0P_ADTIM4, AdtUDFIrq, TRUE);
    (void)Adt_CfgIrq(M0P_ADTIM4, AdtCMDIrq, TRUE);
    EnableNvic(ADTIM4_IRQn, IrqLevel1, TRUE);

    DDL_ZERO_STRUCT(sync);
    sync.bAdTim4 = TRUE;
    sync.bAdTim5 = TRUE;
    sync.bAdTim6 = TRUE;
    (void)Adt_SwSyncStart(&sync);
}

static void Motor_StopAllPwm(void)
{
    stc_adt_sw_sync_t sync;

    DDL_ZERO_STRUCT(sync);
    sync.bAdTim4 = TRUE;
    sync.bAdTim5 = TRUE;
    sync.bAdTim6 = TRUE;
    (void)Adt_SwSyncStop(&sync);
    (void)Adt_SwSyncClear(&sync);
}

static void Motor_StartAllPwm(void)
{
    stc_adt_sw_sync_t sync;

    DDL_ZERO_STRUCT(sync);
    sync.bAdTim4 = TRUE;
    sync.bAdTim5 = TRUE;
    sync.bAdTim6 = TRUE;
    (void)Adt_SwSyncStart(&sync);
}

static void Motor_SetPhaseMode(uint8_t phase,
                               motor_phase_mode_t mode,
                               uint16_t cmp)
{
    M0P_ADTIM_TypeDef *t = s_phase[phase].timer;

    switch (mode) {
    case MOTOR_PHASE_HIGH_PWM:
        /* Figure 11-15 of the Rev2.50 reference manual: both channels toggle
         * at their compare values and keep their state at the period match.
         * DTCEN makes GCMBR = GCMAR - dead time, so GCMBR must not be written. */
        (void)Adt_EnableValueBuf(t, AdtCHxA, TRUE);
        (void)Adt_EnableValueBuf(t, AdtCHxB, FALSE);
        (void)Adt_SetCompareValue(t, AdtCompareA, cmp);
        (void)Adt_SetCompareValue(t, AdtCompareC, cmp);

        t->PCONR_f.CMPCA  = AdtCHxCompareInv;
        t->PCONR_f.PERCA  = AdtCHxPeriodKeep;
        t->PCONR_f.STACA  = AdtCHxPortOutLow;
        t->PCONR_f.OUTENA = TRUE;

        t->PCONR_f.CMPCB  = AdtCHxCompareInv;
        t->PCONR_f.PERCB  = AdtCHxPeriodKeep;
        t->PCONR_f.STACB  = AdtCHxPortOutHigh;
        t->PCONR_f.OUTENB = TRUE;

        (void)Adt_SetDTUA(t, MOTOR_DEADTIME_COUNTS);
        (void)Adt_SetDTDA(t, MOTOR_DEADTIME_COUNTS);
        (void)Adt_CfgDT(t, TRUE, TRUE);
        break;

    case MOTOR_PHASE_LOW_ON:
        (void)Adt_EnableValueBuf(t, AdtCHxA, FALSE);
        (void)Adt_EnableValueBuf(t, AdtCHxB, FALSE);
        (void)Adt_SetDTUA(t, MOTOR_DEADTIME_COUNTS);
        (void)Adt_SetDTDA(t, MOTOR_DEADTIME_COUNTS);
        (void)Adt_CfgDT(t, TRUE, TRUE);

        t->PCONR_f.CMPCA  = AdtCHxCompareLow;
        t->PCONR_f.PERCA  = AdtCHxPeriodLow;
        t->PCONR_f.STACA  = AdtCHxPortOutLow;
        t->PCONR_f.OUTENA = TRUE;

        t->PCONR_f.CMPCB  = AdtCHxCompareHigh;
        t->PCONR_f.PERCB  = AdtCHxPeriodHigh;
        t->PCONR_f.STACB  = AdtCHxPortOutHigh;
        t->PCONR_f.OUTENB = TRUE;
        break;

    case MOTOR_PHASE_FLOAT:
    default:
        (void)Adt_EnableValueBuf(t, AdtCHxA, FALSE);
        (void)Adt_EnableValueBuf(t, AdtCHxB, FALSE);
        (void)Adt_SetDTUA(t, MOTOR_DEADTIME_COUNTS);
        (void)Adt_SetDTDA(t, MOTOR_DEADTIME_COUNTS);
        (void)Adt_CfgDT(t, TRUE, TRUE);

        t->PCONR_f.CMPCA  = AdtCHxCompareLow;
        t->PCONR_f.PERCA  = AdtCHxPeriodLow;
        t->PCONR_f.STACA  = AdtCHxPortOutLow;
        t->PCONR_f.OUTENA = TRUE;

        t->PCONR_f.CMPCB  = AdtCHxCompareLow;
        t->PCONR_f.PERCB  = AdtCHxPeriodLow;
        t->PCONR_f.STACB  = AdtCHxPortOutLow;
        t->PCONR_f.OUTENB = TRUE;
        break;
    }
}

static void Motor_AllOutputsOff(void)
{
    uint8_t phase;

    Motor_StopAllPwm();
    for (phase = 0u; phase < MOTOR_PHASE_COUNT; phase++) {
        Motor_SetPhaseMode(phase, MOTOR_PHASE_FLOAT, 0u);
    }
    Motor_StartAllPwm();
}

static void Motor_AllLowSidesOn(void)
{
    uint8_t phase;

    Motor_StopAllPwm();
    for (phase = 0u; phase < MOTOR_PHASE_COUNT; phase++) {
        Motor_SetPhaseMode(phase, MOTOR_PHASE_LOW_ON, 0u);
    }
    Motor_StartAllPwm();
}

static uint16_t Motor_ClampDutyPercent(uint16_t dutyPercent)
{
    if (dutyPercent > MOTOR_MAX_DUTY_PERCENT) {
        return (uint16_t)MOTOR_MAX_DUTY_PERCENT;
    }
    return dutyPercent;
}

static uint16_t Motor_DutyToCompare(uint16_t dutyPercent)
{
    uint32_t cmp;

    dutyPercent = Motor_ClampDutyPercent(dutyPercent);
    /* CompareInv + PeriodKeep: the high-side pulse is the interval where the
     * counter is above GCMAR, therefore duty = (PERAR - GCMAR) / PERAR. */
    cmp = (((uint32_t)MOTOR_PERAR * (100u - (uint32_t)dutyPercent)) + 50u) / 100u;

    if (cmp < MOTOR_CMP_MIN) {
        cmp = MOTOR_CMP_MIN;
    }
    if (cmp > MOTOR_CMP_MAX) {
        cmp = MOTOR_CMP_MAX;
    }
    return (uint16_t)cmp;
}

static uint16_t Motor_ClosedDutyToCompare(void)
{
    uint32_t duty = s_closedDutyPermille;
    uint32_t maximum = MOTOR_MAX_DUTY_PERCENT * 10u;
    if (duty > maximum) { duty = maximum; }
    return (uint16_t)(MOTOR_PERAR - (MOTOR_PERAR * duty + 500u) / 1000u);
}

static uint16_t Motor_ThrottleToDutyPercent(uint16_t percent)
{
    uint32_t duty;

    if (percent > 100u) {
        percent = 100u;
    }
    if (percent == 0u) {
        return 0u;
    }

    duty = (((uint32_t)percent * MOTOR_MAX_DUTY_PERCENT) + 50u) / 100u;
    if (duty == 0u) {
        duty = 1u;
    }
    return Motor_ClampDutyPercent((uint16_t)duty);
}

static void Motor_BeginStartup(void)
{
    s_startRequest      = 1u;
    s_selftestRunning   = TRUE;
    s_selftestDone      = FALSE;
    s_continuousRun     = TRUE;
    s_selftestElapsedMs = 0u;
    s_prechargeApplied  = FALSE;
    s_alignStepApplied  = FALSE;
    s_state             = MOTOR_STATE_HOLD;
    s_stepIndex         = 0u;
    s_openLoopCommutationCount = 0u;
    s_rampAccumulatorMs = 0u;
    s_commutationScheduled = FALSE;
    s_lastStepTicks = Motor_StepTicksFromMilliHz(MOTOR_OPEN_LOOP_START_MILLIHZ);
    s_lastCommutationTick = Motor_NowTicks();
    s_lockSteps = 0u;
    s_zeroCrossValid = FALSE;
    s_stepPending = FALSE;
    s_dutyPending = FALSE;
    s_throttlePercent = Motor_ThrottleToDutyPercent(s_throttleRequestPercent);
    if (s_throttlePercent > MOTOR_ALIGN_DUTY_PERCENT) {
        s_throttlePercent = MOTOR_ALIGN_DUTY_PERCENT;
    }
    Motor_StopCommutationTimer();
    Motor_AllOutputsOff();
}

static const uint8_t s_phaseMap[6][3] = {
    { MOTOR_PHASE_A, MOTOR_PHASE_B, MOTOR_PHASE_C },
    { MOTOR_PHASE_A, MOTOR_PHASE_C, MOTOR_PHASE_B },
    { MOTOR_PHASE_B, MOTOR_PHASE_A, MOTOR_PHASE_C },
    { MOTOR_PHASE_B, MOTOR_PHASE_C, MOTOR_PHASE_A },
    { MOTOR_PHASE_C, MOTOR_PHASE_A, MOTOR_PHASE_B },
    { MOTOR_PHASE_C, MOTOR_PHASE_B, MOTOR_PHASE_A }
};

static uint8_t Motor_MapPhase(uint8_t phase)
{
    return s_phaseMap[(MOTOR_PHASE_MAP % 6u)][phase];
}

static void Motor_RequestStep(uint8_t step)
{
    s_pendingStep = (uint8_t)(step % MOTOR_STEP_COUNT);
    s_stepPending = TRUE;
}

static void Motor_ApplyStepAtValley(uint8_t step)
{
    uint8_t phase;
    uint8_t hi = Motor_MapPhase(s_step[step].highSide);
    uint8_t lo = Motor_MapPhase(s_step[step].lowSide);
    uint8_t fl = Motor_MapPhase(s_step[step].floating);
    uint16_t duty = Motor_ClampDutyPercent(s_throttlePercent);
    uint16_t cmp = Motor_DutyToCompare(duty);
    if (s_state == MOTOR_STATE_CLOSED_LOOP) {
        duty = (s_closedDutyPermille + 5u) / 10u;
        cmp = Motor_ClosedDutyToCompare();
    }
    if (s_state == MOTOR_STATE_STOPPED || s_state == MOTOR_STATE_FAULT) { return; }
    if (s_state == MOTOR_STATE_OPEN_LOOP) {
        if (!s_observer.emitted) {
            s_lockSteps = 0u;
            s_zeroCrossValid = FALSE;
        }
        s_lastStepTicks = Motor_StepTicksFromMilliHz(s_electricalMilliHz);
        if (s_openLoopCommutationCount < 0xFFFFu) { s_openLoopCommutationCount++; }
    }
    s_stepIndex = step;

    /* The ADT PCONR/DCONR registers must only be changed while their counters
     * are stopped.  Stop all three timers at the valley, install the new
     * vectors, then release them together again. */
    Motor_StopAllPwm();

    for (phase = 0u; phase < MOTOR_PHASE_COUNT; phase++) {
        Motor_SetPhaseMode(phase, MOTOR_PHASE_FLOAT, 0u);
    }

    Motor_SetPhaseMode(hi, MOTOR_PHASE_HIGH_PWM, cmp);
    Motor_SetPhaseMode(lo, MOTOR_PHASE_LOW_ON, 0u);
    Motor_SetPhaseMode(fl, MOTOR_PHASE_FLOAT, 0u);

    Motor_StartAllPwm();

    s_actualDuty = duty;
    s_stepCount++;
    s_lastCommutationTick = Motor_NowTicks();
    Motor_BemfReset();
    if (s_state == MOTOR_STATE_OPEN_LOOP) {
        Motor_ArmCommutationDelay(s_lastStepTicks);
        s_commutationScheduled = TRUE;
    }
}

static void Motor_UpdateDuty(void)
{
    uint16_t duty = Motor_ClampDutyPercent(s_throttlePercent);
    uint16_t cmp = Motor_DutyToCompare(duty);
    if (s_state == MOTOR_STATE_CLOSED_LOOP) {
        duty = (s_closedDutyPermille + 5u) / 10u;
        cmp = Motor_ClosedDutyToCompare();
    }

    if (duty == s_actualDuty && s_state != MOTOR_STATE_CLOSED_LOOP) {
        return;
    }

    /* 1ms时基只发布请求；寄存器与回读占空比在谷点一起提交。 */
    {
        uint32_t irqMask = __get_PRIMASK();
        __disable_irq();
        s_pendingDutyCompare = cmp;
        s_pendingDutyPercent = duty;
        s_dutyPending = TRUE;
        __set_PRIMASK(irqMask);
    }
}

/* --------------------------------------------------------------------------
 * BEMF
 * ----------------------------------------------------------------------- */
static void Motor_BemfReset(void)
{
    int8_t expected = s_step[s_stepIndex].bemfSignBeforeCross;
    uint32_t blank = s_lastStepTicks / 8u;
#if MOTOR_COMMUTATION_REVERSE
    expected = (int8_t)-expected;
#endif
    expected = (int8_t)(expected * MOTOR_BEMF_SIGN_MULTIPLIER);
    if (blank < 38u) { blank = 38u; } /* 至少约100 us，且不超过有效检测窗 */
    Bemf_Reset(&s_observer, s_stepIndex, s_lastCommutationTick,
               s_lastStepTicks, blank, expected, MOTOR_BEMF_HYSTERESIS_COUNTS);
}

static void Motor_OnZeroCross(uint32_t crossingTick)
{
    uint32_t interval = s_lastStepTicks;
    uint32_t now = Motor_NowTicks();
    uint32_t deadline;
    int32_t delay;
    if (s_state != MOTOR_STATE_OPEN_LOOP && s_state != MOTOR_STATE_CLOSED_LOOP) {
        return;
    }
    if (s_zeroCrossValid) {
        uint32_t measured = crossingTick - s_lastZeroCrossTick;
        if (measured < interval / 2u || measured > interval + interval / 2u) {
            s_lockSteps = 0u;
            s_zeroCrossValid = FALSE;
            return;
        }
        interval = (interval * 3u + measured) / 4u;
    }
    s_lastZeroCrossTick = crossingTick;
    s_zeroCrossValid = TRUE;
    s_zeroCrossCount++;
    if (s_state == MOTOR_STATE_OPEN_LOOP) {
        if (s_openLoopCommutationCount < MOTOR_OPEN_LOOP_MIN_STEPS) {
            s_lockSteps = 0u;
            return;
        }
        if (++s_lockSteps < MOTOR_BEMF_LOCK_STEPS) { return; }
        /* 先撤销启动换相定时，再建立由真实过零决定的定时。 */
        Motor_StopCommutationTimer();
        s_state = MOTOR_STATE_CLOSED_LOOP;
        s_closedDutyPermille = s_actualDuty * 10u;
        Speed_Reset(&s_speedControl, s_closedDutyPermille,
                     Motor_MilliHzFromStepTicks(interval));
    } else if (s_commutationScheduled) {
        return;
    }
    s_lastStepTicks = interval;
    deadline = crossingTick + interval / 2u - MOTOR_BEMF_DELAY_COMP_TICKS;
    delay = (int32_t)(deadline - now);
    if (delay <= 0 || delay > 65535) {
        Motor_FaultNow(MOTOR_FAULT_BEMF_LOST);
        return;
    }
    Motor_ArmCommutationDelay((uint32_t)delay);
    s_commutationScheduled = TRUE;
}

static void Motor_BemfProcess(uint16_t raw)
{
    uint32_t crossingTick;
    s_bemfCounts = raw;
    if ((s_state != MOTOR_STATE_OPEN_LOOP && s_state != MOTOR_STATE_CLOSED_LOOP) ||
        !s_vbusValid || s_stepPending) { return; }
    if (Bemf_Sample(&s_observer, s_adcStep, s_adcPhaseTick,
                    (int16_t)((int32_t)raw - s_bemfThresholdCounts), &crossingTick)) {
        Motor_OnZeroCross(crossingTick);
    }
}

/* --------------------------------------------------------------------------
 * ISR entry points
 * ----------------------------------------------------------------------- */
/* SysTick owns the 1 ms motor tick.  TIM1 is the one-shot commutation timer,
 * while TIM0 is reserved for UART0 baud generation by modbus_slave.c.  The
 * weak callbacks are defined here so the port vector layer stays generic. */
void SysTick_IRQHandler(void)
{
    Motor_Tick1ms();
}

void Tim1_IRQHandler(void)
{
    MOTOR_COMM_TIMER->CR_f.CTEN = 0u;
    MOTOR_COMM_TIMER->ICLR = 0u;
    Motor_CommutationIrq();
}

static void Motor_CommutationIrq(void)
{
    uint8_t next;
    if (s_state != MOTOR_STATE_OPEN_LOOP && s_state != MOTOR_STATE_CLOSED_LOOP) {
        return;
    }
    s_commutationScheduled = FALSE;
#if MOTOR_COMMUTATION_REVERSE
    next = (uint8_t)((s_stepIndex + MOTOR_STEP_COUNT - 1u) % MOTOR_STEP_COUNT);
#else
    next = (uint8_t)((s_stepIndex + 1u) % MOTOR_STEP_COUNT);
#endif
    Motor_RequestStep(next);
}

void Tim4_IRQHandler(void)
{
    if (Adt_GetIrqFlag(M0P_ADTIM4, AdtUDFIrq)) {
        (void)Adt_ClearIrqFlag(M0P_ADTIM4, AdtUDFIrq);
        s_pwmCycle++;
        if (s_stepPending) {
            uint8_t step = s_pendingStep;
            s_stepPending = FALSE;
            Motor_ApplyStepAtValley(step);
            s_dutyPending = FALSE;
        } else if (s_dutyPending && (s_state == MOTOR_STATE_ALIGN ||
                    s_state == MOTOR_STATE_OPEN_LOOP || s_state == MOTOR_STATE_CLOSED_LOOP)) {
            uint8_t hi = Motor_MapPhase(s_step[s_stepIndex].highSide);
            s_dutyPending = FALSE;
            (void)Adt_SetCompareValue(s_phase[hi].timer, AdtCompareA, s_pendingDutyCompare);
            (void)Adt_SetCompareValue(s_phase[hi].timer, AdtCompareC, s_pendingDutyCompare);
            s_actualDuty = s_pendingDutyPercent;
        }
        Motor_PrepareCurrentForPeak();
    }
    if (Adt_GetIrqFlag(M0P_ADTIM4, AdtCMDIrq)) {
        (void)Adt_ClearIrqFlag(M0P_ADTIM4, AdtCMDIrq);
        /* DIRF=0是下降计数，仅在高边关断后的固定相位采样一次。 */
        if (M0P_ADTIM4->STFLR_f.DIRF == 0u) { Motor_AdcTriggerFromPwm(); }
    }
}

static boolean_t Motor_AdcOffWindowAvailable(void)
{
    M0P_ADTIM_TypeDef *t = s_phase[Motor_MapPhase(s_step[s_stepIndex].highSide)].timer;
    uint32_t count = t->CNTER;
    uint32_t compare = t->GCMAR;
    uint32_t remaining;
    if (s_state != MOTOR_STATE_OPEN_LOOP && s_state != MOTOR_STATE_CLOSED_LOOP) {
        return FALSE;
    }
    if (count >= compare) { return FALSE; }
    remaining = t->STFLR_f.DIRF ? compare - count : compare + count;
    return (remaining > MOTOR_ADC_ACQUIRE_GUARD) ? TRUE : FALSE;
}

static void Motor_AdcTriggerFromPwm(void)
{
    uint8_t channel;
    if (s_adcPending || Adc_PollBusyState()) {
        s_adcOverrunCount++;
        if (s_selftestRunning && (Motor_NowTicks() - s_adcFrameTick) > 75u) {
            Motor_FaultNow(MOTOR_FAULT_ADC_TIMEOUT);
        }
        return;
    }
    s_adcFrameTick = Motor_NowTicks();
    s_adcStep = s_stepIndex;
    if ((s_pwmCycle % MOTOR_ADC_VBUS_EVERY) == 0u) {
        s_adcKind = MOTOR_ADC_VBUS;
        channel = (uint8_t)MOTOR_ADC_CH_VBUS;
    } else if (s_state != MOTOR_STATE_OPEN_LOOP && s_state != MOTOR_STATE_CLOSED_LOOP) {
        return;
    } else {
        if (!Motor_AdcOffWindowAvailable() || s_stepPending) { return; }
        s_adcKind = MOTOR_ADC_NEUTRAL_FIRST;
        channel = (uint8_t)MOTOR_ADC_CH_NEUTRAL;
    }
    Motor_AdcStartChannel(channel);
}

static void Motor_PrepareCurrentForPeak(void)
{
    if (s_adcPending || M0P_ADC->CR0_f.START ||
        s_currentSampleCycle == s_pwmCycle ||
        (s_pwmCycle % MOTOR_ADC_CURRENT_EVERY) != 0u ||
        M0P_ADTIM4->STFLR_f.DIRF == 0u) { return; }
    /* 母线电流只在PWM导通区采样；谷点/OFF采样可能只看到续流零母线电流。
     * ADC由TIM4峰点硬件触发，软件只在之前配置通道。低占空比下有效
     * ON窗口仍可能不足，软件读数不能代替外部5 A限流电源。 */
    s_currentSampleCycle = s_pwmCycle;
    s_adcKind = MOTOR_ADC_CURRENT;
    s_adcStep = s_stepIndex;
    s_adcFrameTick = Motor_NowTicks();
    s_adcTick = s_adcFrameTick;
    M0P_ADC->CR0_f.SEL = (uint32_t)MOTOR_ADC_CH_ISENSE;
    M0P_ADC->ICLR = ~(1u << 3);
    M0P_ADC->CR1_f.TRIGS0 = AdcTrigTimer4;
    M0P_ADTIM4->CR_f.OVFE = 1u;
    s_adcPending = TRUE;
}

/* --------------------------------------------------------------------------
 * Fault handling and helpers
 * ----------------------------------------------------------------------- */
static void Motor_FaultNow(uint16_t fault)
{
    s_state = MOTOR_STATE_FAULT;
    Motor_StopCommutationTimer();
    s_stepPending = FALSE;
    s_dutyPending = FALSE;
    s_fault |= fault;
    s_startRequest = 0u;
    s_state = MOTOR_STATE_FAULT;
    s_actualDuty = 0u;
    s_electricalMilliHz = 0u;
    s_selftestRunning = FALSE;
    s_selftestDone = TRUE;
    Motor_AllOutputsOff();
}

static uint32_t Motor_StepTicksFromMilliHz(uint32_t milliHz)
{
    if (milliHz == 0u) {
        return 1u;
    }
    return MOTOR_STEP_TICKS_SCALE / milliHz;
}

static uint32_t Motor_MilliHzFromStepTicks(uint32_t stepTicks)
{
    if (stepTicks == 0u) {
        return 0u;
    }
    return MOTOR_STEP_TICKS_SCALE / stepTicks;
}

/* --------------------------------------------------------------------------
 * Public API
 * ----------------------------------------------------------------------- */
void Motor_Init(void)
{
    uint8_t i;
    stc_gpio_cfg_t gpio;

    s_state              = MOTOR_STATE_STOPPED;
    s_startRequest       = 0u;
    s_throttlePercent    = 0u;
    s_throttleRequestPercent = 0u;
    s_actualDuty         = 0u;
    s_fault              = MOTOR_FAULT_NONE;
    s_commOk             = 0u;
    s_commErr            = 0u;
    s_tickMs             = 0u;
    s_lastCommTick       = 0u;
    s_selftestElapsedMs  = 0u;
    s_selftestRunning    = FALSE;
    s_selftestDone       = FALSE;
    s_continuousRun      = FALSE;
    s_commRequired       = FALSE;
    s_prechargeApplied   = FALSE;
    s_alignStepApplied   = FALSE;
    s_electricalMilliHz  = 0u;
    s_rampAccumulatorMs  = 0u;
    s_stepIndex          = 0u;
    s_stepCount          = 0u;
    s_openLoopCommutationCount = 0u;
    s_pendingStep = 0u;
    s_stepPending = FALSE;

    s_lastCommutationTick = 0u;
    s_dutyPending = FALSE;
    s_lastStepTicks       = 0u;
    s_commutationScheduled = FALSE;

    s_bemfCounts = 0u;
    s_bemfThresholdCounts = 0u;
    s_zeroCrossCount = 0u;
    s_lockSteps = 0u;
    s_zeroCrossValid = FALSE;
    s_lastZeroCrossTick = 0u;
    s_closedDutyPermille = 0u;
    Speed_Reset(&s_speedControl, 0u, 0u);

    s_adcKind = MOTOR_ADC_NONE;
    s_adcPending = FALSE;
    s_pwmCycle = 0u;
    s_vbusCounts = 0u;
    s_vbusValid = FALSE;
    s_isenseCounts = 0u;
    s_isensePeakCounts = 0u;
    s_adcOverrunCount = 0u;
    s_currentSampleCycle = 0xFFFFFFFFu;

    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);

    DDL_ZERO_STRUCT(gpio);
    gpio.enDir = GpioDirOut;
    gpio.enDrv = GpioDrvH;
    gpio.enPu  = GpioPuDisable;
    gpio.enPd  = GpioPdDisable;
    gpio.enOD  = GpioOdDisable;

    for (i = 0u; i < MOTOR_PHASE_COUNT; i++) {
        (void)Gpio_Init(s_phase[i].highPort, s_phase[i].highPin, &gpio);
        (void)Gpio_Init(s_phase[i].lowPort,  s_phase[i].lowPin,  &gpio);
        (void)Gpio_SetAfMode(s_phase[i].highPort, s_phase[i].highPin, s_phase[i].highAf);
        (void)Gpio_SetAfMode(s_phase[i].lowPort,  s_phase[i].lowPin,  s_phase[i].lowAf);
    }

    (void)Gpio_SetAnalogMode(GpioPort2, GpioPin4);   /* AIN0 phase A */
    (void)Gpio_SetAnalogMode(GpioPort3, GpioPin3);   /* AIN3 phase B */
    (void)Gpio_SetAnalogMode(GpioPort0, GpioPin2);   /* AIN8 phase C */
    (void)Gpio_SetAnalogMode(GpioPort3, GpioPin5);   /* AIN5 current */
    (void)Gpio_SetAnalogMode(GpioPort0, GpioPin1);   /* AIN7 bus */
    (void)Gpio_SetAnalogMode(GpioPort3, GpioPin4);   /* AIN4，VN飞线 */

    Motor_AdcInit();
    Motor_TimeTimerInit();
    Motor_SysTickInit();
    Motor_CommTimerInit();
    Motor_AdtInit();
    Motor_AllOutputsOff();
}

void Motor_Service(void)
{
    /* ADC结果/过零只在ADC中断处理；主循环通信不能暂停观察器。 */
}

void Motor_SelfTestStart(void)
{
    if (s_state == MOTOR_STATE_FAULT) {
        return;
    }

    s_fault = MOTOR_FAULT_NONE;
    s_selftestElapsedMs = 0u;
    s_selftestRunning = TRUE;
    s_continuousRun = FALSE;
    s_commRequired = FALSE;
    s_selftestDone = FALSE;
    s_prechargeApplied = FALSE;
    s_alignStepApplied = FALSE;
    s_isensePeakCounts = 0u;
    s_stepCount = 0u;
    s_openLoopCommutationCount = 0u;
    s_pendingStep = 0u;
    s_stepPending = FALSE;
    s_stepIndex = 0u;
    s_state = MOTOR_STATE_HOLD;
    s_throttlePercent = MOTOR_ALIGN_DUTY_PERCENT;
    s_actualDuty = 0u;
    s_electricalMilliHz = MOTOR_OPEN_LOOP_START_MILLIHZ;
    s_rampAccumulatorMs = 0u;
    s_lastCommutationTick = Motor_NowTicks();
    s_lastStepTicks = Motor_StepTicksFromMilliHz(MOTOR_OPEN_LOOP_START_MILLIHZ);
    s_commutationScheduled = FALSE;

    Motor_StopCommutationTimer();
    Motor_AllOutputsOff();
}

boolean_t Motor_SelfTestFinished(void)
{
    return s_selftestDone;
}

void Motor_Tick1ms(void)
{
    uint32_t openLoopDuty;

    s_tickMs++;

    if (s_isensePeakCounts > 0u) {
        s_isensePeakCounts = (uint16_t)(s_isensePeakCounts -
                            (s_isensePeakCounts / 32u) - 1u);
    }

    if (!s_selftestRunning) {
        return;
    }

    if ((s_commRequired != 0u) &&
        ((s_tickMs - s_lastCommTick) > MOTOR_COMMAND_TIMEOUT_MS)) {
        Motor_FaultNow(MOTOR_FAULT_COMM_TIMEOUT);
        return;
    }

    s_selftestElapsedMs++;

    if ((s_continuousRun == 0u) &&
        (s_selftestElapsedMs >= (MOTOR_SELFTEST_TOTAL_MS - MOTOR_SELFTEST_COAST_MS))) {
        Motor_StopCommutationTimer();
        Motor_AllOutputsOff();
        s_state = MOTOR_STATE_STOPPED;
        s_selftestRunning = FALSE;
        s_selftestDone = TRUE;
        s_actualDuty = 0u;
        return;
    }

    if (s_state == MOTOR_STATE_HOLD) {
        Motor_AllOutputsOff();
        if (s_selftestElapsedMs >= MOTOR_HOLD_MS) {
            if (!s_vbusValid) {
                Motor_FaultNow(MOTOR_FAULT_UNDERVOLTAGE);
                return;
            }
            s_state = MOTOR_STATE_PRECHARGE;
        }
        return;
    }

    if (s_state == MOTOR_STATE_PRECHARGE) {
        if (!s_prechargeApplied) {
            Motor_AllLowSidesOn();
            s_prechargeApplied = TRUE;
        }
        if (s_selftestElapsedMs >= (MOTOR_HOLD_MS + MOTOR_PRECHARGE_MS)) {
            s_state = MOTOR_STATE_ALIGN;
        }
        return;
    }

    if (s_state == MOTOR_STATE_ALIGN) {
        if (!s_alignStepApplied) {
            s_throttlePercent = Motor_ThrottleToDutyPercent(s_throttleRequestPercent);
            if (s_throttlePercent > MOTOR_ALIGN_DUTY_PERCENT) {
                s_throttlePercent = MOTOR_ALIGN_DUTY_PERCENT;
            }
            s_stepIndex = 0u;
            Motor_RequestStep(s_stepIndex);
            s_alignStepApplied = TRUE;
            s_lastCommutationTick = Motor_NowTicks();
        }
        Motor_UpdateDuty();

        if (s_selftestElapsedMs >= (MOTOR_HOLD_MS + MOTOR_PRECHARGE_MS + MOTOR_ALIGN_MS)) {
            s_state = MOTOR_STATE_OPEN_LOOP;
            s_electricalMilliHz = MOTOR_OPEN_LOOP_START_MILLIHZ;
            s_openLoopCommutationCount = 0u;
            s_rampAccumulatorMs = 0u;
            s_lastCommutationTick = Motor_NowTicks();
            s_lastStepTicks = Motor_StepTicksFromMilliHz(s_electricalMilliHz);
            Motor_UpdateDuty();
            Motor_BemfReset();
            Motor_ArmCommutationDelay(s_lastStepTicks);
            s_commutationScheduled = TRUE;
        }
        return;
    }

    if (s_state == MOTOR_STATE_OPEN_LOOP) {
        if (s_selftestElapsedMs > MOTOR_HOLD_MS + MOTOR_PRECHARGE_MS +
                                 MOTOR_ALIGN_MS + MOTOR_STARTUP_TIMEOUT_MS) {
            Motor_FaultNow(MOTOR_FAULT_BEMF_LOST);
            return;
        }
        s_rampAccumulatorMs += 1u;
        if (s_rampAccumulatorMs >= 100u) {
            uint32_t targetHz = Speed_TargetMilliHz(s_throttleRequestPercent);
            s_rampAccumulatorMs -= 100u;
            if (targetHz > MOTOR_OPEN_LOOP_MAX_MILLIHZ) { targetHz = MOTOR_OPEN_LOOP_MAX_MILLIHZ; }

            if (s_electricalMilliHz < targetHz) {
                s_electricalMilliHz +=
                    MOTOR_OPEN_LOOP_ACCEL_MILLIHZ_PER_SECOND / 10u;
                if (s_electricalMilliHz > targetHz) {
                    s_electricalMilliHz = targetHz;
                }
            } else if (s_electricalMilliHz > targetHz) {
                uint32_t amount = MOTOR_OPEN_LOOP_ACCEL_MILLIHZ_PER_SECOND / 10u;
                s_electricalMilliHz = s_electricalMilliHz - targetHz > amount ?
                                     s_electricalMilliHz - amount : targetHz;
            }

            if (s_electricalMilliHz > MOTOR_OPEN_LOOP_START_MILLIHZ) {
                openLoopDuty = MOTOR_ALIGN_DUTY_PERCENT +
                    (((s_electricalMilliHz - MOTOR_OPEN_LOOP_START_MILLIHZ) * 15u) /
                     100000u);
                if (openLoopDuty > MOTOR_OPEN_LOOP_MAX_DUTY_PERCENT) {
                    openLoopDuty = MOTOR_OPEN_LOOP_MAX_DUTY_PERCENT;
                }
                if (openLoopDuty > Motor_ThrottleToDutyPercent(s_throttleRequestPercent)) {
                    openLoopDuty = Motor_ThrottleToDutyPercent(s_throttleRequestPercent);
                }
                s_throttlePercent = (uint16_t)openLoopDuty;
                Motor_UpdateDuty();
            }
        }
        return;
    }

    if (s_state == MOTOR_STATE_CLOSED_LOOP) {
        uint32_t timeoutTicks;
        if ((s_tickMs % 10u) == 0u) {
            s_closedDutyPermille = Speed_Update10ms(&s_speedControl,
                s_throttleRequestPercent, Motor_MilliHzFromStepTicks(s_lastStepTicks),
                MOTOR_MAX_DUTY_PERCENT * 10u);
        }
        Motor_UpdateDuty();

        timeoutTicks = s_lastStepTicks + (s_lastStepTicks / 2u) + 38u;
        if ((Motor_NowTicks() - s_lastCommutationTick) > timeoutTicks) {
            Motor_FaultNow(MOTOR_FAULT_BEMF_LOST);
        }
        return;
    }
}

void Motor_CommandStart(void)
{
    if (s_state == MOTOR_STATE_FAULT) { return; }
    s_startRequest = 1u;
    if (s_throttleRequestPercent != 0u && s_state == MOTOR_STATE_STOPPED) {
        Motor_BeginStartup();
    }
}

void Motor_CommandStop(void)
{
    s_state = MOTOR_STATE_STOPPED;
    Motor_StopCommutationTimer();
    s_stepPending = FALSE;
    s_dutyPending = FALSE;
    s_startRequest = 0u;
    s_actualDuty = 0u;
    s_electricalMilliHz = 0u;
    s_throttleRequestPercent = 0u;
    s_throttlePercent = 0u;
    s_selftestRunning = FALSE;
    s_selftestDone = TRUE;
    s_continuousRun = FALSE;
    s_commRequired = FALSE;
    s_lockSteps = 0u;
    s_zeroCrossValid = FALSE;
    Motor_AllOutputsOff();
}

void Motor_SetThrottle(uint16_t percent)
{
    if (percent > 100u) { percent = 100u; }
    s_throttleRequestPercent = percent;
    if (percent == 0u) { Motor_CommandStop(); return; }
    if (s_state == MOTOR_STATE_FAULT) { return; }
    if (s_startRequest && s_state == MOTOR_STATE_STOPPED) {
        Motor_BeginStartup();
    }
    /* 非零油门只设目标；必须显式启动，闭环运行在1ms时基更新功率。 */
}

void Motor_CommHeartbeat(void)
{
    s_lastCommTick = s_tickMs;
}

uint16_t Motor_GetRunState(void)
{
    if ((s_state == MOTOR_STATE_PRECHARGE) ||
        (s_state == MOTOR_STATE_ALIGN) ||
        (s_state == MOTOR_STATE_OPEN_LOOP) ||
        (s_state == MOTOR_STATE_CLOSED_LOOP)) {
        return 1u;
    }
    return 0u;
}

uint16_t Motor_GetStartRequest(void)       { return s_startRequest; }
uint16_t Motor_GetThrottlePercent(void) { return s_throttleRequestPercent; }
uint16_t Motor_GetActualDuty(void)         { return s_actualDuty; }

uint16_t Motor_GetElectricalHz(void)
{
    /* 启动强制节拍不等于转子转速；仅闭环返回BEMF估计电频率。 */
    if (s_state != MOTOR_STATE_CLOSED_LOOP || !s_zeroCrossValid) { return 0u; }
    return (uint16_t)(Motor_MilliHzFromStepTicks(s_lastStepTicks) / 1000u);
}

uint16_t Motor_GetFault(void)              { return s_fault; }
uint16_t Motor_GetCommOkCount(void)        { return s_commOk; }
uint16_t Motor_GetCommErrCount(void)       { return s_commErr; }
uint32_t Motor_GetTickMs(void)             { return s_tickMs; }
uint16_t Motor_GetVbusCounts(void)         { return s_vbusCounts; }
uint16_t Motor_GetIsensePeakCounts(void)   { return s_isensePeakCounts; }
uint32_t Motor_GetStepCount(void)          { return s_stepCount; }

uint16_t Motor_GetFirmwareMode(void)
{
    if (s_state == MOTOR_STATE_CLOSED_LOOP) {
        return 2u;
    }
    if (s_state == MOTOR_STATE_OPEN_LOOP) {
        return 1u;
    }
    return 0u;
}

uint16_t Motor_GetBemfCounts(void)         { return s_bemfCounts; }
uint16_t Motor_GetBemfThresholdCounts(void){ return s_bemfThresholdCounts; }
uint32_t Motor_GetZeroCrossCount(void)     { return s_zeroCrossCount; }

void Motor_SetCommRequired(boolean_t required)
{
    s_commRequired = (required != FALSE) ? TRUE : FALSE;
}

boolean_t Motor_IsCommRequired(void)
{
    return s_commRequired;
}

uint16_t Motor_GetPwmFrequency(void)
{
    return (uint16_t)MOTOR_PWM_DEFAULT_HZ;
}

boolean_t Motor_SetPwmFrequency(uint16_t hz)
{
    /* The power stage is fixed at 20 kHz until the timer/dead-time schedule is
     * revalidated.  Return FALSE for other values so the Modbus layer can send
     * an illegal-value exception instead of silently changing the carrier. */
    if (hz != (uint16_t)MOTOR_PWM_DEFAULT_HZ) {
        return FALSE;
    }
    return TRUE;
}

void Motor_RecordCommOk(void)    { s_commOk++; }
void Motor_RecordCommError(void) { s_commErr++; }

void Motor_SetFault(uint16_t fault)
{
    Motor_FaultNow(fault);
}
