/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    main.c
  * @brief   Fire-072 主程序 —— 对应原 Core/Src/main.c
  *
  * 原工程走 STM32CubeMX 生成流程：
  *   HAL_Init() -> SystemClock_Config() -> MX_xxx_Init() -> osKernelStart()
  * 这里保留同样的骨架，只把 HAL 换成 HC32F072 的 DDL。
  ******************************************************************************
  */
/* USER CODE END Header */

/* Includes ------------------------------------------------------------------*/
#include "ddl.h"
#include "board.h"
#include "app_adc.h"
#include "app_tim.h"
#include "app_i2c.h"
#include "app_led.h"   /* 同时声明 MX_GPIO_Init() */
#include "gpio.h"
#include "os_api.h"

/* 在 freertos.c 里定义 */
void MX_FREERTOS_Init(void);

/* ==========================================================================
 * 时钟配置
 * 原 F103：HSE 8MHz x PLL9 = 72MHz，ADC = PCLK2/6 = 12MHz
 * F072   ：RCH 24MHz 直出，ADC = PCLK/4 = 6MHz
 * ========================================================================== */
void SystemClock_Config(void)
{
    stc_sysctrl_clk_cfg_t clkCfg;

    Sysctrl_SetRCHTrim(BOARD_RCH_FREQ);

    DDL_ZERO_STRUCT(clkCfg);
    clkCfg.enClkSrc  = SysctrlClkRCH;
    clkCfg.enHClkDiv = SysctrlHclkDiv1;
    clkCfg.enPClkDiv = SysctrlPclkDiv1;
    Sysctrl_ClkInit(&clkCfg);
    SystemCoreClockUpdate();
}

/* ==========================================================================
 * 出错处理：与原工程一致，关中断死循环等看门狗/复位
 * ========================================================================== */
void Error_Handler(void)
{
    __disable_irq();
    for (;;) {
    }
}

/* ==========================================================================
 * 入口
 * ========================================================================== */
int32_t main(void)
{
    /* --- 时钟 --- */
    SystemClock_Config();

    /* --- 外设 ---
     * 顺序与原工程一致：GPIO -> DMA -> I2C -> ADC -> TIM
     * 注意 GPIO 要在 I2C/ADC/TIM 之前，因为它们的引脚配置
     * 会覆盖 GPIO 的默认状态。                                  */
    MX_GPIO_Init();
    MX_DMA_Init();
    MX_I2C0_Init();
    MX_ADC1_Init();
    MX_TIM3_Init();

    /* --- 内核对象与任务 --- */
    MX_FREERTOS_Init();

    /* --- 1ms 系统节拍 ---
     * 原工程由 CubeMX 的 FreeRTOS 端口配置 SysTick；
     * 这里手配：24MHz 时钟，1ms 周期，开中断，使能计数。        */
    SysTick->LOAD = (SystemCoreClock / 1000u) - 1u;
    SysTick->VAL  = 0u;
    SysTick->CTRL = 0x07u;    /* ENABLE | TICKINT | CLKSOURCE(HCLK) */

    /* --- 内核中断优先级 ---
     * Cortex-M0+ 只有 2 个优先级位(0~3，数值越大优先级越低)。
     * SysTick/PendSV 都设为最低(3)，PendSV 与其它 IRQ 同级即可，
     * 因为上下文切换只在 SysTick 和显式阻塞处发生。             */
    NVIC_SetPriority(PendSV_IRQn, 3u);
    NVIC_SetPriority(SysTick_IRQn, 3u);

    /* --- 启动调度器，不返回 --- */
    osKernelStart();

    /* 不会走到这里 */
    for (;;) {
    }
}
