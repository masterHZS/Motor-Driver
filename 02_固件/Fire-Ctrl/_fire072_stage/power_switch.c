/**
  ******************************************************************************
  * @file    power_switch.c
  * @brief   MOS 直驱 + 半桥推挽控制 —— 逐函数对应原 Core/Src/power_switch.c
  *
  * 【原工程的两个引脚冲突，这里已修掉】
  *  1) 原 HB1_Set() 用 PA8 当高边电平输出，但 PA8 在 .ioc 里是 TIM1_CH1，
  *     HAL_TIM_MspPostInit 已把它配成 AF_PP，之后 HAL_GPIO_WritePin 改的
  *     是复用功能引脚的数据寄存器 —— PWM 参考和 HB1 门极抢同一个脚。
  *     F072 上 HB1 高边改到 PB13（纯 GPIO，无复用冲突）。
  *  2) 原 HB2_Set() 用 PA9，而 PA9/PA10 在 F072 上是调试串口 UART0。
  *     F072 上 HB2 高边改到 PB14。
  *  3) 原 HB3_Set() 用 PA10（同样是串口 RX），F072 上改到 PB15。
  ******************************************************************************
  */

#include "app_power_switch.h"
#include "board.h"
#include "gpio.h"

/* ================= 内部状态寄存器 ================= */

typedef struct {
    MosState_t mos1;
    MosState_t mos2;
    MosState_t mos3;
} MosReg_t;

typedef struct {
    PushPullState_t hb1;
    PushPullState_t hb2;
    PushPullState_t hb3;
} PushPullReg_t;

static MosReg_t mos_reg = {
    .mos1 = MOS_OFF,
    .mos2 = MOS_OFF,
    .mos3 = MOS_OFF,
};

static PushPullReg_t pp_reg = {
    .hb1 = PP_HIZ,
    .hb2 = PP_HIZ,
    .hb3 = PP_HIZ,
};

/* ================= MOS ================= */

static void MOS_Write(en_gpio_port_t port, en_gpio_pin_t pin, MosState_t state)
{
    if (state == MOS_ON) {
        /* MOSFET 门极拉高，导通 */
        (void)Gpio_SetIO(port, pin);
    } else {
        /* MOSFET 门极拉低，关断 */
        (void)Gpio_ClrIO(port, pin);
    }
}

void MOS1_Set(MosState_t state)
{
    mos_reg.mos1 = state;
    MOS_Write(BOARD_MOS1_PORT, BOARD_MOS1_PIN, state);
}

void MOS2_Set(MosState_t state)
{
    mos_reg.mos2 = state;
    MOS_Write(BOARD_MOS2_PORT, BOARD_MOS2_PIN, state);
}

void MOS3_Set(MosState_t state)
{
    mos_reg.mos3 = state;
    MOS_Write(BOARD_MOS3_PORT, BOARD_MOS3_PIN, state);
}

void MOS1_Toggle(void) { MOS1_Set((MosState_t)!mos_reg.mos1); }
void MOS2_Toggle(void) { MOS2_Set((MosState_t)!mos_reg.mos2); }
void MOS3_Toggle(void) { MOS3_Set((MosState_t)!mos_reg.mos3); }

MosState_t MOS1_Get(void) { return mos_reg.mos1; }
MosState_t MOS2_Get(void) { return mos_reg.mos2; }
MosState_t MOS3_Get(void) { return mos_reg.mos3; }

/* ================= 半桥（推挽） ================= */

static void HB_Write(en_gpio_port_t ho_port, en_gpio_pin_t ho_pin,
                     en_gpio_port_t en_port, en_gpio_pin_t en_pin,
                     PushPullState_t state)
{
    switch (state) {
    case PP_HIZ:
        (void)Gpio_ClrIO(en_port, en_pin);
        break;

    case PP_LOW:
        (void)Gpio_ClrIO(ho_port, ho_pin);
        (void)Gpio_SetIO(en_port, en_pin);
        break;

    case PP_HIGH:
        (void)Gpio_SetIO(ho_port, ho_pin);
        (void)Gpio_SetIO(en_port, en_pin);
        break;

    default:
        (void)Gpio_ClrIO(en_port, en_pin);
        break;
    }
}

void HB1_Set(PushPullState_t state)
{
    pp_reg.hb1 = state;
    HB_Write(BOARD_HB1_HO_PORT, BOARD_HB1_HO_PIN,
             BOARD_HB1_EN_PORT, BOARD_HB1_EN_PIN, state);
}

PushPullState_t HB1_Get(void)
{
    return pp_reg.hb1;
}

void HB2_Set(PushPullState_t state)
{
    pp_reg.hb2 = state;
    HB_Write(BOARD_HB2_HO_PORT, BOARD_HB2_HO_PIN,
             BOARD_HB2_EN_PORT, BOARD_HB2_EN_PIN, state);
}

PushPullState_t HB2_Get(void)
{
    return pp_reg.hb2;
}

void HB3_Set(PushPullState_t state)
{
    pp_reg.hb3 = state;
    HB_Write(BOARD_HB3_HO_PORT, BOARD_HB3_HO_PIN,
             BOARD_HB3_EN_PORT, BOARD_HB3_EN_PIN, state);
}

PushPullState_t HB3_Get(void)
{
    return pp_reg.hb3;
}
