#ifndef __USART_H
#define __USART_H

#include "common.h"
#include "uart.h"

#ifdef USART_C
#define USART_EXT
#else
#define USART_EXT extern
#endif


#define UART_TX_PORT	GpioPort3
#define UART_TX_PIN		GpioPin5
#define UART_RX_PORT	GpioPort3
#define UART_RX_PIN		GpioPin6


void hc_uart_init(void);

#endif /* __USART_H */


