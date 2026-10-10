/**
  ******************************************************************************
  * @file    board.h
  * @brief   Fire-072 板级定义 —— 取代原 STM32CubeMX 的 main.h + .ioc
  *
  * 本文件是 Fire-Ctrl/Simple_DCDC（STM32F103C8T6）-> HC32F072JATA 复刻工程
  * 的【唯一引脚与标定出处】。原工程的引脚信息散落在 STM32PwmCtl.ioc 和
  * main.h 的宏里，这里全部集中过来，改引脚只改这一个文件。
  ******************************************************************************
  */

#ifndef FIRE072_BOARD_H
#define FIRE072_BOARD_H

#include "ddl.h"
#include "gpio.h"   /* 引脚表用的是 en_gpio_port_t / en_gpio_pin_t / en_gpio_af_t */

/* ==========================================================================
 * 一、时钟
 * --------------------------------------------------------------------------
 * 原 F103：HSE 8MHz -> PLL x9 = 72MHz，ADC = PCLK2/6 = 12MHz。
 * F072   ：RCH 内部 24MHz 直接做 HCLK/PCLK（与 F072_MotorCtrl 一致）。
 *          ADC 时钟 = PCLK/4 = 6MHz，满足手册 <= 24MHz 的要求。
 * 24MHz 对这套应用绰绰有余：控制环 100Hz，ADC 顺序扫描 7 通道 < 30us。
 * ========================================================================== */
#define BOARD_RCH_FREQ          SysctrlRchFreq24MHz

/* ==========================================================================
 * 二、引脚表
 * ========================================================================== */

/* --- PWMIN：模拟 DAC 参考输出（原 PA8 / TIM1_CH1）------------------------
 * 对板上 10k(R1) -> 节点 -> 22nF(C11) 到地，再经 10k(R2) 送 LM358。
 * 注意：本板上该节点没有接 MCU（原工程的 OFB 网络只连 U2.1.6/7），
 *       所以这是【纯输出】引脚，不能兼作半桥门极 —— 原代码把 PA8 同时
 *       当 TIM1_CH1 和 HB1 高边用，是个必须在此修掉的冲突。
 * F072 上 TIM3_CH0A 的候选脚：PA6(AF2) / PB8(AF7) / PA9(AF5) / PE9(AF3)。
 * 选 PA6：不与 I2C0(PB6/PB7)、按键、MOS、半桥占用的脚冲突。          */
#define BOARD_PWMIN_PORT        GpioPortA
#define BOARD_PWMIN_PIN         GpioPin6
#define BOARD_PWMIN_AF          GpioAf2      /* PA6 = TIM3_CH0A */

/* --- ADJ2 参考输出（原 PA7 / TIM3_CH2）--------------------------------- */
#define BOARD_PWMIN2_PORT       GpioPortA
#define BOARD_PWMIN2_PIN        GpioPin7
#define BOARD_PWMIN2_AF         GpioAf2      /* PA7 = TIM3_CH1A */

/* --- OLED：I2C0，SH1106 128x64（原 PB6/PB7 / I2C1）----------------------
 * F072 的 I2C0 复用脚固定：PB6=SCL(AF1)、PB7=SDA(AF1)。
 * 另有 PB8/PB9 也可作 I2C0_SCL/SDA(AF1)，已留作备用。                */
#define BOARD_I2C_PORT          M0P_I2C0
#define BOARD_I2C_SCL_PORT      GpioPortB
#define BOARD_I2C_SCL_PIN       GpioPin6
#define BOARD_I2C_SCL_AF        GpioAf1
#define BOARD_I2C_SDA_PORT      GpioPortB
#define BOARD_I2C_SDA_PIN       GpioPin7
#define BOARD_I2C_SDA_AF        GpioAf1
#define BOARD_I2C_BAUD          100000u      /* SH1106 稳跑 100kHz */

/* --- 5 个按键：低有效，内部上拉（原 PC13/PA15/PA11/PB9/PA12）-----------
 * 引脚顺序必须与 ButtonTask 的 key_id 一致：
 *   0=UP 1=DOWN 2=LEFT 3=RIGHT 4=MID
 * 分布在三个 PORT 上，因此要开 PORTA / PORTB / PORTC_E 三个中断。      */
#define BOARD_KEY_COUNT         5u
#define BOARD_KEY0_PORT         GpioPortC    /* UP    */
#define BOARD_KEY0_PIN          GpioPin13
#define BOARD_KEY1_PORT         GpioPortA    /* DOWN  */
#define BOARD_KEY1_PIN          GpioPin15
#define BOARD_KEY2_PORT         GpioPortA    /* LEFT  */
#define BOARD_KEY2_PIN          GpioPin11
#define BOARD_KEY3_PORT         GpioPortB    /* RIGHT */
#define BOARD_KEY3_PIN          GpioPin9
#define BOARD_KEY4_PORT         GpioPortA    /* MID   */
#define BOARD_KEY4_PIN          GpioPin12

/* --- MOS 直驱（原 PB10/PB11/PB12）------------------------------------- */
#define BOARD_MOS1_PORT         GpioPortB
#define BOARD_MOS1_PIN          GpioPin10
#define BOARD_MOS2_PORT         GpioPortB
#define BOARD_MOS2_PIN          GpioPin11
#define BOARD_MOS3_PORT         GpioPortB
#define BOARD_MOS3_PIN          GpioPin12

/* --- 半桥 / 推挽（原 HB1: PA8+PB13, HB2: PA9+PB14, HB3: PA10+PB15）-----
 * 原工程 HB1 占用 PA8（与 PWM 冲突）、HB2 占用 PA9（与调试串口冲突），
 * 这里重新分配到自由引脚。注意 F072 的 PC13 只有 GPIO 功能，
 * 正好适合做纯开关量。                                               */
#define BOARD_HB1_HO_PORT       GpioPortB    /* 高边电平 */
#define BOARD_HB1_HO_PIN        GpioPin13
#define BOARD_HB1_EN_PORT       GpioPortC    /* 使能     */
#define BOARD_HB1_EN_PIN        GpioPin0
#define BOARD_HB2_HO_PORT       GpioPortB
#define BOARD_HB2_HO_PIN        GpioPin14
#define BOARD_HB2_EN_PORT       GpioPortC
#define BOARD_HB2_EN_PIN        GpioPin1
#define BOARD_HB3_HO_PORT       GpioPortB
#define BOARD_HB3_HO_PIN        GpioPin15
#define BOARD_HB3_EN_PORT       GpioPortC
#define BOARD_HB3_EN_PIN        GpioPin2

/* --- 状态 LED（原 PB3/PB4/PB5/PB8）------------------------------------ */
#define BOARD_LED1_PORT         GpioPortC
#define BOARD_LED1_PIN          GpioPin3
#define BOARD_LED2_PORT         GpioPortC
#define BOARD_LED2_PIN          GpioPin4
#define BOARD_LED3_PORT         GpioPortC
#define BOARD_LED3_PIN          GpioPin5
#define BOARD_LED4_PORT         GpioPortC
#define BOARD_LED4_PIN          GpioPin6

/* --- 调试串口 UART0：PA9=TX(AF1) / PA10=RX(AF1) -----------------------
 * 接 DAPLink 虚拟串口，与 F072_MotorCtrl 的接线习惯保持一致。          */
#define BOARD_UART_PORT         M0P_UART0
#define BOARD_UART_TX_PORT      GpioPortA
#define BOARD_UART_TX_PIN       GpioPin9
#define BOARD_UART_RX_PORT      GpioPortA
#define BOARD_UART_RX_PIN       GpioPin10
#define BOARD_UART_BAUD         115200u

/* ==========================================================================
 * 三、ADC 通道表
 * --------------------------------------------------------------------------
 * 原 F103 用 ADC1 规则组 7 个 Rank，顺序 = DMA 缓冲区下标：
 *   [0]PA0 HVSE  [1]PA1 HVDF1  [2]PA2 HVDF2  [3]PA3 V2.5
 *   [4]PA4 ADJ1_FB [5]PA5 ADJ2_FB [6]PB1 VCC_MONITOR
 *
 * 说明：AIN0~AIN7 与 F103 的 PA0~PA7 恰好一一对应。
 *
 * ⚠️ 与 BOM_可调电压板V0.6 核对后的两处修改：
 *   1) 板上【没有 2.5V 标定芯片】，PA3 的 V2.5 通道在这块板上不存在，
 *      所以改用 F072 自带的内部 BGR 1.2V 基准来自标定 VDDA
 *      （自参考法，见 freertos.c 里 VDDA 的计算）。
 *   2) 板上【没有任何 MCU 相关器件】也没有 MCU 连接器，除 PWMIN 之外的
 *      模拟通道（HVSE/HVDF1/HVDF2/VCC_MONITOR）在这块板上都是悬空的。
 *      保留在扫描表里是为了引脚表与原工程对齐、方便以后扩展接线，
 *      读回来的值无意义，不要拿去做保护判断。
 * ========================================================================== */
#define BOARD_ADC_CH_COUNT      7u

#define BOARD_ADC_IDX_HVSE      0u   /* AIN0 = PA0  悬空(本板无此网络) */
#define BOARD_ADC_IDX_HVDF1     1u   /* AIN1 = PA1  悬空 */
#define BOARD_ADC_IDX_HVDF2     2u   /* AIN2 = PA2  悬空 */
#define BOARD_ADC_IDX_VREF_INT  3u   /* 内部 BGR 1.2V，用于标定 VDDA */
#define BOARD_ADC_IDX_ADJ1_FB   4u   /* AIN4 = PA4  ADJ1_FB（本板未引出）*/
#define BOARD_ADC_IDX_ADJ2_FB   5u   /* AIN5 = PA5  ADJ2_FB（本板未引出）*/
#define BOARD_ADC_IDX_VCC_MON   6u   /* AIN9 = PB1  悬空 */

/* 内部基准电压值（BGR，手册标称 1.2V）*/
#define ADC_INT_VREF_VOLT       (1.200f)

/* ==========================================================================
 * 四、标定参数（原 freertos.c 顶部 #define，原样搬过来）
 * ========================================================================== */

/* 输出级：Vout = PSU_GAIN_OUT * Vref_equiv */
#define PSU_GAIN_OUT            (8.0f)

/* 反馈分压：Vfb = Vout * (R_BOT / (R_TOP + R_BOT)) */
#define FB_R_TOP_OHM            (30000.0f)
#define FB_R_BOT_OHM            (1800.0f)

/* ADC 量化：12bit -> 4096 码 */
#define ADC_FULL_SCALE_F        (4096.0f)

/* VDDA 标定：原工程用板上 2.5V 基准芯片接 PA3 来反推 VDDA。
 * 本板 BOM 里没有这个器件，改用 F072 内部 BGR 1.2V 自参考：
 *     VDDA = ADC_INT_VREF_VOLT × 4096 / code(BGR)
 * 内部基准本身有初始误差，但它的温漂很小，足以把 VDDA 估到 ~1%以内；
 * 而且前馈通道是比例于 VDDA 的，这一路的误差本来就会自相抵消。 */
#define VREF_CAL_VOLT           ADC_INT_VREF_VOLT
#define VDDA_MIN_V              (2.8f)
#define VDDA_MAX_V              (3.6f)

/* ADC 参考建立时间：手册要求 BGR/内部基准稳定需 20us 以上，
 * 这里给 5ms 的富余（ADC 上电后第一次读要留够时间）。 */
#define ADC_REF_SETTLE_MS       (5U)

/* 输出电压设定范围 */
#define VSET_MIN_V              (0.0f)
#define VSET_MAX_V              (24.0f)

/* 控制周期 */
#define CTRL_PERIOD_MS          (10U)
#define CTRL_DT_S               (0.010f)

/* 前馈 + 慢积分 */
#define CTRL_KI                 (0.25f)
#define INTEG_LIMIT             (0.25f)

/* Duty 限幅 */
#define DUTY_MIN                (0.0f)
#define DUTY_MAX                (1.0f)

/* ADC 低通滤波 EMA alpha */
#define ADC_EMA_ALPHA           (0.05f)

/* PWM 定时器：24MHz / (0+1) / (719+1) = 33.3kHz
 * 原 F103 是 72MHz/720 = 100kHz，对 10k+22nF（tau=220us）来说
 * 33kHz 的纹波仍然可以忽略，但把频率降到 33kHz 后计数分辨率不变。 */
#define PWM_ARR                 (719U)

/* 电源硬件换算（本板实测标定用，见 README「硬件对照」一节）
 * 本板 RT8289 反馈分压是 30k/1.8k，即 Vout = 17.667 * Vfb。
 * 外部 LM358 参考通道把 PWMIN 直流分量按约 2 倍放大后注入 FB。
 * Vout ≈ 35.3 * V(PWMIN) + 失调，所以 PWM 占空比与输出电压是【反向】的：
 *      占空比 ↑ -> V(PWMIN) ↑ -> FB 抬高 -> 输出 ↓
 * 控制环必须按这个方向收敛，否则会正反馈跑飞。
 * 调试时若发现电压朝反方向跑，把下面这个宏取反即可。              */
#define PWM_DIRECTION_INVERTED  (1)

#endif /* FIRE072_BOARD_H */

/******************************************************************************
 * EOF
 ******************************************************************************/
