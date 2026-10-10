#define GPIO_C
#include "hc_gpio.h"

void GPIO_WriteHigh(en_gpio_port_t enPort, en_gpio_pin_t enPin)
{
  *((volatile uint32_t *)((uint32_t)&M0P_GPIO->P0OUT + enPort))|= ((1UL)<<(enPin));
}

void GPIO_WriteLow(en_gpio_port_t enPort, en_gpio_pin_t enPin)
{
  *((volatile uint32_t *)((uint32_t)&M0P_GPIO->P0OUT + enPort))&= (~(1UL<<(DELAY_PIN)));
}

