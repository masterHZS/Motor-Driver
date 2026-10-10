#ifndef __GPIO_H
#define __GPIO_H

#include "common.h"

#ifdef GPIO_C
#define GPIO_EXT
#else
#define GPIO_EXT extern
#endif


GPIO_EXT void GPIO_WriteHigh(en_gpio_port_t enPort, en_gpio_pin_t enPin);
GPIO_EXT void GPIO_WriteLow(en_gpio_port_t enPort, en_gpio_pin_t enPin);

#endif /* __GPIO_H */

