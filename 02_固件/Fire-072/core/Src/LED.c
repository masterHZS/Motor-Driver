/**
  ******************************************************************************
  * @file    LED.c
  * @brief   LED 控制 —— 逐函数对应原 Core/Src/LED.c
  *
  * 原工程：HAL_GPIO_WritePin(LEDn_GPIO_Port, LEDn_Pin, SET/RESET)
  *         HAL_GPIO_TogglePin(...)
  * F072  ：Gpio_SetIO / Gpio_ClrIO，翻转用 Gpio_GetInputData 读回输出寄存器
  *         再取反写回（F072 没有单独的 ODR 读接口，输入寄存器即输出回读）。
  ******************************************************************************
  */

#include "app_led.h"
#include "gpio.h"

static void led_write(en_gpio_port_t port, en_gpio_pin_t pin, boolean_t on)
{
    if (on != 0u) {
        (void)Gpio_SetIO(port, pin);
    } else {
        (void)Gpio_ClrIO(port, pin);
    }
}

static void led_toggle(en_gpio_port_t port, en_gpio_pin_t pin)
{
    uint16_t data = Gpio_GetInputData(port);

    if ((data & (1u << pin)) != 0u) {
        (void)Gpio_ClrIO(port, pin);
    } else {
        (void)Gpio_SetIO(port, pin);
    }
}

void LED1_ON(void)   { led_write(BOARD_LED1_PORT, BOARD_LED1_PIN, TRUE);  }
void LED1_OFF(void)  { led_write(BOARD_LED1_PORT, BOARD_LED1_PIN, FALSE); }
void LED1_TURN(void) { led_toggle(BOARD_LED1_PORT, BOARD_LED1_PIN);       }

void LED2_ON(void)   { led_write(BOARD_LED2_PORT, BOARD_LED2_PIN, TRUE);  }
void LED2_OFF(void)  { led_write(BOARD_LED2_PORT, BOARD_LED2_PIN, FALSE); }
void LED2_TURN(void) { led_toggle(BOARD_LED2_PORT, BOARD_LED2_PIN);       }

void LED3_ON(void)   { led_write(BOARD_LED3_PORT, BOARD_LED3_PIN, TRUE);  }
void LED3_OFF(void)  { led_write(BOARD_LED3_PORT, BOARD_LED3_PIN, FALSE); }
void LED3_TURN(void) { led_toggle(BOARD_LED3_PORT, BOARD_LED3_PIN);       }

void LED4_ON(void)   { led_write(BOARD_LED4_PORT, BOARD_LED4_PIN, TRUE);  }
void LED4_OFF(void)  { led_write(BOARD_LED4_PORT, BOARD_LED4_PIN, FALSE); }
void LED4_TURN(void) { led_toggle(BOARD_LED4_PORT, BOARD_LED4_PIN);       }

/************************ (C) COPYRIGHT STMicroelectronics *****END OF FILE****/
