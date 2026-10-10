/**
  ******************************************************************************
  * @file    adc.c
  * @brief   ADC 顺序扫描 + DMAC 循环搬运 —— 替代原 STM32F103 的 ADC1+DMA1
  *
  * 【与原工程的对应】
  *   F103: ADC1 规则组 7 个 Rank，ContinuousConv + 循环 DMA，每次序列
  *         结束产生 DMA 传输完成中断，中断里 osSemaphoreRelease。
  *   F072: ADC 顺序扫描模式(SQR) 7 个通道 + DMAC 通道0，
  *         传输源固定为 SQR 结果寄存器，目的自增到 adc_buffer，
  *         连续传输模式循环覆盖缓冲。
  *
  * 【通道顺序】必须与 board.h 的 BOARD_ADC_IDX_* 一致：
  *   SQR0 = AIN0 (PA0) HVSE
  *   SQR1 = AIN1 (PA1) HVDF1
  *   SQR2 = AIN2 (PA2) HVDF2
  *   SQR3 = AIN3 (PA3) V2.5 标定
  *   SQR4 = AIN4 (PA4) ADJ1_FB
  *   SQR5 = AIN5 (PA5) ADJ2_FB
  *   SQR6 = AIN9 (PB1) VCC_MONITOR
  *
  * 【采样时机】ADC 由软件启动后连续扫描，FreeRTOS 侧用 1ms tick 轮询
  *   缓冲即可；原工程的 DMA 完成中断信号量在这里改由 ADCTask 定时读取，
  *   因为 7 通道扫描只要 ~25us，远快于 10ms 的控制周期。
  ******************************************************************************
  */

#include "app_adc.h"
#include "app_tim.h"  /* Error_Handler 声明 */
#include "sysctrl.h"    /* Sysctrl_SetPeripheralGate */
#include <string.h>

/* DMA 目标缓冲：volatile，因为被 DMAC 硬件写入 */
volatile uint16_t adc_buffer[ADC_CH_COUNT];

/* ==========================================================================
 * DMAC 模块使能
 * ========================================================================== */
void MX_DMA_Init(void)
{
    Sysctrl_SetPeripheralGate(SysctrlPeripheralDma, TRUE);
}

/* ==========================================================================
 * ADC 初始化
 * ========================================================================== */
void MX_ADC1_Init(void)
{
    stc_adc_cfg_t      stcAdcCfg;
    stc_adc_sqr_cfg_t  stcSqrCfg;
    stc_dma_cfg_t      stcDmaCfg;

    /* --- 外设时钟：ADC/BGR 与 GPIO --- */
    Sysctrl_SetPeripheralGate(SysctrlPeripheralAdcBgr, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralDma, TRUE);

    /* --- 模拟输入引脚：不要 AF，走 Gpio_SetAnalogMode ---
     * 原 F103 是把 PA0..PA5 / PB1 配成 GPIO_MODE_ANALOG，
     * F072 对应 Gpio_SetAnalogMode()。
     * AIN0..AIN5 正好是 PA0..PA5，模拟前端可以照抄原板接法。 */
    Gpio_SetAnalogMode(GpioPortA, GpioPin0);   /* AIN0 HVSE       */
    Gpio_SetAnalogMode(GpioPortA, GpioPin1);   /* AIN1 HVDF1      */
    Gpio_SetAnalogMode(GpioPortA, GpioPin2);   /* AIN2 HVDF2      */
    Gpio_SetAnalogMode(GpioPortA, GpioPin3);   /* AIN3 V2.5 标定  */
    Gpio_SetAnalogMode(GpioPortA, GpioPin4);   /* AIN4 ADJ1_FB    */
    Gpio_SetAnalogMode(GpioPortA, GpioPin5);   /* AIN5 ADJ2_FB    */
    Gpio_SetAnalogMode(GpioPortB, GpioPin1);   /* AIN9 VCC_MONITOR*/

    /* --- ADC 基本配置 ---
     * PCLK = 24MHz，Div4 -> ADC 时钟 6MHz（手册上限 24MHz）    */
    DDL_ZERO_STRUCT(stcAdcCfg);
    stcAdcCfg.enAdcMode         = AdcScanMode;          /* 顺序扫描 */
    stcAdcCfg.enAdcClkDiv       = AdcMskClkDiv4;        /* 24/4 = 6MHz */
    stcAdcCfg.enAdcSampCycleSel = AdcMskSampCycle12Clk; /* 12 个采样周期 */
    stcAdcCfg.enAdcRefVolSel    = AdcMskRefVolSelAVDD;  /* 参考 = AVDD(3.3V) */
    stcAdcCfg.enAdcOpBuf        = AdcMskBufDisable;     /* 不用内部放大器 */
    stcAdcCfg.enInRef           = AdcMskInRefDisable;
    stcAdcCfg.enAdcAlign        = AdcAlignRight;        /* 与原工程一致 */
    if (Adc_Init(&stcAdcCfg) != Ok) {
        Error_Handler();
    }

    /* --- 顺序扫描通道表 --- */
    (void)Adc_CfgSqrChannel(AdcSQRCH0MUX, AdcExInputCH0);   /* PA0  HVSE   */
    (void)Adc_CfgSqrChannel(AdcSQRCH1MUX, AdcExInputCH1);   /* PA1  HVDF1  */
    (void)Adc_CfgSqrChannel(AdcSQRCH2MUX, AdcExInputCH2);   /* PA2  HVDF2  */
    (void)Adc_CfgSqrChannel(AdcSQRCH3MUX, AdcExInputCH3);   /* PA3  V2.5   */
    (void)Adc_CfgSqrChannel(AdcSQRCH4MUX, AdcExInputCH4);   /* PA4  ADJ1_FB*/
    (void)Adc_CfgSqrChannel(AdcSQRCH5MUX, AdcExInputCH5);   /* PA5  ADJ2_FB*/
    (void)Adc_CfgSqrChannel(AdcSQRCH6MUX, AdcExInputCH9);   /* PB1  VCC_MON*/

    /* --- 顺序扫描参数：7 个通道，使能 DMA 触发 --- */
    DDL_ZERO_STRUCT(stcSqrCfg);
    stcSqrCfg.u8SqrCnt      = (uint8_t)ADC_CH_COUNT;
    stcSqrCfg.enResultAcc   = AdcResultAccDisable;
    stcSqrCfg.bSqrDmaTrig   = TRUE;
    if (Adc_SqrModeCfg(&stcSqrCfg) != Ok) {
        Error_Handler();
    }

    /* --- DMAC 通道0：SQR 结果寄存器 -> adc_buffer，循环搬运 ---
     * 块大小 = 7，传输块次数 = 1，使能连续传输(不清 ENS)，
     * 配合 ADC 连续扫描即可无限循环刷新缓冲。            */
    DDL_ZERO_STRUCT(stcDmaCfg);
    stcDmaCfg.enMode              = DmaMskBlock;
    stcDmaCfg.u16BlockSize        = (uint16_t)ADC_CH_COUNT;
    stcDmaCfg.u16TransferCnt      = 1u;
    stcDmaCfg.enTransferWidth     = DmaMsk16Bit;
    stcDmaCfg.enSrcAddrMode       = DmaMskSrcAddrFix;   /* 固定结果寄存器 */
    stcDmaCfg.enDstAddrMode       = DmaMskDstAddrInc;   /* 缓冲递增 */
    stcDmaCfg.enSrcAddrReloadCtl  = DmaMskSrcAddrReloadDisable;
    stcDmaCfg.enDestAddrReloadCtl = DmaMskDstAddrReloadEnable;
    stcDmaCfg.enSrcBcTcReloadCtl  = DmaMskBcTcReloadDisable;
    stcDmaCfg.u32SrcAddress       = (uint32_t)&(M0P_ADC->SQRRESULT0);
    stcDmaCfg.u32DstAddress       = (uint32_t)&adc_buffer[0];
    /* 连续传输：DMAC 传完一个块不清 CONFA:ENS，配合 ADC 连续扫描
     * 即可无限循环刷新缓冲（对应原工程 F103 的 DMA_CIRCULAR）。   */
    stcDmaCfg.enTransferMode      = DmaMskContinuousTransfer;
    stcDmaCfg.enPriority          = DmaMskPriorityFix;
    stcDmaCfg.enRequestNum        = DmaADCSQRTrig;
    if (Dma_InitChannel(DmaCh0, &stcDmaCfg) != Ok) {
        Error_Handler();
    }
    Dma_EnableChannel(DmaCh0);
    Dma_Enable();

    /* --- 启动 ADC：一直转换模式（对应 F103 的 ContinuousConvMode）--- */
    Adc_Enable();
    Adc_SGL_Always_Start();
}

/******************************************************************************
 * EOF
 ******************************************************************************/
