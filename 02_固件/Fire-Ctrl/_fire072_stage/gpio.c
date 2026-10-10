/**
  ******************************************************************************
  * @file    gpio.c
  * @brief   GPIO / EXTI 初始化 —— 替代原 STM32CubeMX 生成的 gpio.c
  *
  * 原 F103 用 HAL_GPIO_Init + HAL_NVIC_EnableIRQ(EXTIx_IRQn) 给 5 个按键
  * 配上升/下降沿中断；F072 用 Gpio_Init + Gpio_EnableIrq + EnableNvic，
  * 中断向量按 PORT 分组（PORTA / PORTB / PORTC_E），一个 PORT 共用一个中断。
  *
  * 按键分布：UP=PC13, DOWN=PA15, LEFT=PA11, RIGHT=PB9, MID=PA12
  *   -> 需要开 PORTA、PORTB、PORTC_E 三个中断
  ******************************************************************************
  */

#include "gpio.h"
#include "board.h"
#include "app_tim.h"      /* Error_Handler */
#include "os_api.h"
#include "app_shared_data.h"
#include "sysctrl.h"      /* Sysctrl_SetPeripheralGate */
#include "interrupts_hc32f072.h"   /* EnableNvic */

/* 按键表：顺序必须与 ButtonTask 的 key_id 一致 */
static const en_gpio_port_t s_key_port[BOARD_KEY_COUNT] = {
    BOARD_KEY0_PORT, BOARD_KEY1_PORT, BOARD_KEY2_PORT,
    BOARD_KEY3_PORT, BOARD_KEY4_PORT
};
static const en_gpio_pin_t s_key_pin[BOARD_KEY_COUNT] = {
    BOARD_KEY0_PIN, BOARD_KEY1_PIN, BOARD_KEY2_PIN,
    BOARD_KEY3_PIN, BOARD_KEY4_PIN
};

/* 按键队列句柄（在 freertos.c 里创建，这里 extern 用于中断投递） */
extern osMessageQueueId_t buttonQueueHandle;

/* ==========================================================================
 * 初始化
 * ========================================================================== */
void MX_GPIO_Init(void)
{
    stc_gpio_cfg_t stcGpio;
    uint8_t        i;

    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);
    DDL_ZERO_STRUCT(stcGpio);

    /* ---------------- 数字输出：MOS 驱动 ---------------- */
    stcGpio.enDir = GpioDirOut;
    stcGpio.enDrv = GpioDrvH;
    stcGpio.enOD  = GpioOdDisable;
    stcGpio.enPu  = GpioPuDisable;
    stcGpio.enPd  = GpioPdDisable;

    (void)Gpio_Init(BOARD_MOS1_PORT, BOARD_MOS1_PIN, &stcGpio);
    (void)Gpio_Init(BOARD_MOS2_PORT, BOARD_MOS2_PIN, &stcGpio);
    (void)Gpio_Init(BOARD_MOS3_PORT, BOARD_MOS3_PIN, &stcGpio);
    /* 上电全部关断 */
    (void)Gpio_ClrIO(BOARD_MOS1_PORT, BOARD_MOS1_PIN);
    (void)Gpio_ClrIO(BOARD_MOS2_PORT, BOARD_MOS2_PIN);
    (void)Gpio_ClrIO(BOARD_MOS3_PORT, BOARD_MOS3_PIN);

    /* ---------------- 数字输出：半桥 高边电平 + 使能 ---------------- */
    (void)Gpio_Init(BOARD_HB1_HO_PORT, BOARD_HB1_HO_PIN, &stcGpio);
    (void)Gpio_Init(BOARD_HB1_EN_PORT, BOARD_HB1_EN_PIN, &stcGpio);
    (void)Gpio_Init(BOARD_HB2_HO_PORT, BOARD_HB2_HO_PIN, &stcGpio);
    (void)Gpio_Init(BOARD_HB2_EN_PORT, BOARD_HB2_EN_PIN, &stcGpio);
    (void)Gpio_Init(BOARD_HB3_HO_PORT, BOARD_HB3_HO_PIN, &stcGpio);
    (void)Gpio_Init(BOARD_HB3_EN_PORT, BOARD_HB3_EN_PIN, &stcGpio);
    /* 上电全部高阻：EN=0 */
    (void)Gpio_ClrIO(BOARD_HB1_EN_PORT, BOARD_HB1_EN_PIN);
    (void)Gpio_ClrIO(BOARD_HB2_EN_PORT, BOARD_HB2_EN_PIN);
    (void)Gpio_ClrIO(BOARD_HB3_EN_PORT, BOARD_HB3_EN_PIN);
    (void)Gpio_ClrIO(BOARD_HB1_HO_PORT, BOARD_HB1_HO_PIN);
    (void)Gpio_ClrIO(BOARD_HB2_HO_PORT, BOARD_HB2_HO_PIN);
    (void)Gpio_ClrIO(BOARD_HB3_HO_PORT, BOARD_HB3_HO_PIN);

    /* ---------------- 数字输出：LED ---------------- */
    (void)Gpio_Init(BOARD_LED1_PORT, BOARD_LED1_PIN, &stcGpio);
    (void)Gpio_Init(BOARD_LED2_PORT, BOARD_LED2_PIN, &stcGpio);
    (void)Gpio_Init(BOARD_LED3_PORT, BOARD_LED3_PIN, &stcGpio);
    (void)Gpio_Init(BOARD_LED4_PORT, BOARD_LED4_PIN, &stcGpio);
    (void)Gpio_SetIO(BOARD_LED1_PORT, BOARD_LED1_PIN);
    (void)Gpio_SetIO(BOARD_LED2_PORT, BOARD_LED2_PIN);
    (void)Gpio_SetIO(BOARD_LED3_PORT, BOARD_LED3_PIN);
    (void)Gpio_SetIO(BOARD_LED4_PORT, BOARD_LED4_PIN);

    /* ---------------- 按键输入：上拉 + 双沿中断 ---------------- */
    DDL_ZERO_STRUCT(stcGpio);
    stcGpio.enDir = GpioDirIn;
    stcGpio.enPu  = GpioPuEnable;
    stcGpio.enPd  = GpioPdDisable;

    for (i = 0u; i < BOARD_KEY_COUNT; i++) {
        (void)Gpio_Init(s_key_port[i], s_key_pin[i], &stcGpio);
        (void)Gpio_EnableIrq(s_key_port[i], s_key_pin[i], GpioIrqRising);
        (void)Gpio_EnableIrq(s_key_port[i], s_key_pin[i], GpioIrqFalling);
    }

    /* 三个 PORT 中断都要开（按键跨了 A/B/C 三个口）*/
    EnableNvic(PORTA_IRQn, IrqLevel3, TRUE);
    EnableNvic(PORTB_IRQn, IrqLevel3, TRUE);
    EnableNvic(PORTC_E_IRQn, IrqLevel3, TRUE);
}

/* ==========================================================================
 * PORT 中断服务：扫描本 PORT 上所有按键，投递按下/松开事件
 * ========================================================================== */

/** 读某个按键当前电平：低 = 按下 */
static uint8_t key_is_down(uint8_t idx)
{
    uint16_t data = Gpio_GetInputData(s_key_port[idx]);
    return (((data & (1u << s_key_pin[idx])) == 0u) ? 1u : 0u);
}

static void key_port_irq_scan(en_gpio_port_t port)
{
    uint8_t i;

    for (i = 0u; i < BOARD_KEY_COUNT; i++) {
        if (s_key_port[i] != port) {
            continue;
        }
        (void)Gpio_ClearIrq(port, s_key_pin[i]);

        if (buttonQueueHandle != 0) {
            BtnEvent_t evt;
            evt.key_id  = i;
            evt.type    = key_is_down(i) ? (uint8_t)BTN_EVENT_PRESS
                                         : (uint8_t)BTN_EVENT_RELEASE;
            evt.reserved = 0u;
            evt.tick    = osKernelGetTickCount();
            (void)osMessageQueuePutISR(buttonQueueHandle, &evt);
        }
    }
}

void PortA_IRQHandler(void)
{
    key_port_irq_scan(GpioPortA);
}

void PortB_IRQHandler(void)
{
    key_port_irq_scan(GpioPortB);
}

void PortC_IRQHandler(void)
{
    key_port_irq_scan(GpioPortC);
}

/******************************************************************************
 * EOF
 ******************************************************************************/
