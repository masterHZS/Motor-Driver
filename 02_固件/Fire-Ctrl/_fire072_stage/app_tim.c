/**
  ******************************************************************************
  * @file    tim.c
  * @brief   TIM3 PWM —— 替代原 STM32F103 的 TIM1_CH1 / TIM3_CH1+CH2
  *
  * 对应关系：
  *   F103  TIM1_CH1  PA8  -> PWMIN   （模拟 DAC 参考）
  *   F103  TIM3_CH1  PA6  -> PWM_ADJ1
  *   F103  TIM3_CH2  PA7  -> PWM_ADJ2
  *   F072  TIM3_CH0A PA6  -> PWMIN   （同一引脚，功能不变）
  *   F072  TIM3_CH1A PA7  -> PWM_ADJ2
  *   F072  TIM3_CH2A PC2  -> 备用第三路
  *
  * HC32F072 的 TIM3 是唯一能一次给 3 组 PWM 的定时器，正好覆盖原工程
  * 用两个定时器( TIM1 + TIM3 )做的事，顺带省下一路。
  *
  * 频率：24MHz / (0+1) / (ARR+1) = 24MHz/720 = 33.3kHz
  *       （F103 是 72MHz/720 = 100kHz；33kHz 对 10k+22nF 的 RC 仍然够）
  ******************************************************************************
  */

#include "app_tim.h"
#include "board.h"
#include "sysctrl.h"    /* Sysctrl_SetPeripheralGate */

/* ==========================================================================
 * 初始化
 * ========================================================================== */
void MX_TIM3_Init(void)
{
    stc_tim3_mode23_cfg_t       stcModeCfg;
    stc_tim3_m23_compare_cfg_t  stcCmpCfg;
    stc_gpio_cfg_t              stcGpio;

    /* --- 外设时钟 --- */
    Sysctrl_SetPeripheralGate(SysctrlPeripheralTim3, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);

    /* --- 引脚：PWMIN = PA6 (TIM3_CH0A, AF2) --- */
    DDL_ZERO_STRUCT(stcGpio);
    stcGpio.enDir = GpioDirOut;
    stcGpio.enDrv = GpioDrvH;
    (void)Gpio_Init(BOARD_PWMIN_PORT, BOARD_PWMIN_PIN, &stcGpio);
    (void)Gpio_SetAfMode(BOARD_PWMIN_PORT, BOARD_PWMIN_PIN, BOARD_PWMIN_AF);

    /* --- 引脚：PWM_ADJ2 = PA7 (TIM3_CH1A, AF2) --- */
    (void)Gpio_Init(BOARD_PWMIN2_PORT, BOARD_PWMIN2_PIN, &stcGpio);
    (void)Gpio_SetAfMode(BOARD_PWMIN2_PORT, BOARD_PWMIN2_PIN, BOARD_PWMIN2_AF);

    /* --- 时基：锯齿波(模式2)、PCLK 不分频、内部时钟 --- */
    DDL_ZERO_STRUCT(stcModeCfg);
    stcModeCfg.enWorkMode   = Tim3WorkMode2;            /* 锯齿波 */
    stcModeCfg.enCntDir     = Tim3CntUp;                /* 向上计数 */
    stcModeCfg.enPRS        = Tim3PCLKDiv1;             /* 24MHz */
    stcModeCfg.enCT         = Tim3Timer;                /* 内部 PCLK 计数 */
    stcModeCfg.enPWMTypeSel = Tim3IndependentPWM;       /* 独立输出，非互补 */
    stcModeCfg.enPWM2sSel   = Tim3SinglePointCmp;       /* 单点比较 */
    stcModeCfg.bOneShot     = FALSE;
    stcModeCfg.bURSSel      = FALSE;
    if (Tim3_Mode23_Init(&stcModeCfg) != Ok) {
        Error_Handler();
    }

    /* --- 周期：ARR = 719 -> 720 个计数 = 33.3kHz --- */
    if (Tim3_M23_ARRSet(PWM_ARR, TRUE) != Ok) {
        Error_Handler();
    }

    /* --- 通道：PWM mode 1，正极性，比较值缓存打开 ---
     * PWM mode 1：计数值 < CCR 时输出有效电平（高）。
     * 与原 F103 的 TIM_OCMODE_PWM1 / TIM_OCPOLARITY_HIGH 一致，
     * 即 duty = CCR / (ARR+1)。                                    */
    DDL_ZERO_STRUCT(stcCmpCfg);
    stcCmpCfg.enCHxACmpCap      = Tim3CHxCmpMode;
    stcCmpCfg.enCHxACmpCtrl     = Tim3PWMMode1;
    stcCmpCfg.enCHxAPolarity    = Tim3PortPositive;
    stcCmpCfg.bCHxACmpBufEn     = TRUE;
    stcCmpCfg.enCHxACmpIntSel   = Tim3CmpIntNone;

    stcCmpCfg.enCHxBCmpCap      = Tim3CHxCmpMode;
    stcCmpCfg.enCHxBCmpCtrl     = Tim3PWMMode1;
    stcCmpCfg.enCHxBPolarity    = Tim3PortPositive;
    stcCmpCfg.bCHxBCmpBufEn     = TRUE;
    stcCmpCfg.enCHxBCmpIntSel   = Tim3CmpIntNone;

    if (Tim3_M23_PortOutput_Cfg(Tim3CH0, &stcCmpCfg) != Ok) {
        Error_Handler();
    }
    if (Tim3_M23_PortOutput_Cfg(Tim3CH1, &stcCmpCfg) != Ok) {
        Error_Handler();
    }

    /* --- 计数清 0，比较值先给 0（上电输出恒低，最安全）--- */
    (void)Tim3_M23_Cnt16Set(0u);
    (void)Tim3_M23_CCR_Set(Tim3CCR0A, 0u);
    (void)Tim3_M23_CCR_Set(Tim3CCR1A, 0u);

    /* --- 启动计数 --- */
    (void)Tim3_M23_Run();
    (void)Tim3_M23_EnPWM_Output(TRUE, FALSE);
}

/* ==========================================================================
 * 运行期接口
 * ========================================================================== */

/** 写 PWMIN 占空比：duty 为 0.0~1.0 */
void TIM_SetPWMIN(float duty)
{
    uint32_t cmp;

    if (duty <= 0.0f) {
        cmp = 0u;
    } else if (duty >= 1.0f) {
        cmp = PWM_ARR;
    } else {
        cmp = (uint32_t)(duty * (float)(PWM_ARR + 1u));
        if (cmp > PWM_ARR) {
            cmp = PWM_ARR;
        }
    }

    (void)Tim3_M23_CCR_Set(Tim3CCR0A, (uint16_t)cmp);
}

/** 写 ADJ2 占空比 */
void TIM_SetPWMIN2(float duty)
{
    uint32_t cmp;

    if (duty <= 0.0f) {
        cmp = 0u;
    } else if (duty >= 1.0f) {
        cmp = PWM_ARR;
    } else {
        cmp = (uint32_t)(duty * (float)(PWM_ARR + 1u));
        if (cmp > PWM_ARR) {
            cmp = PWM_ARR;
        }
    }

    (void)Tim3_M23_CCR_Set(Tim3CCR1A, (uint16_t)cmp);
}

uint16_t TIM_GetARR(void)
{
    return (uint16_t)PWM_ARR;
}

/******************************************************************************
 * EOF
 ******************************************************************************/
