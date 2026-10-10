/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    LED.h
  * @brief   Header file for LED control functions
  ******************************************************************************
  */
/* USER CODE END Header */

#ifndef __LED_H
#define __LED_H

#ifdef __cplusplus
extern "C" {
#endif

/* 原工程这里 include "main.h"（CubeMX 的引脚宏），
 * F072 上换成 board.h（引脚表集中地）+ gpio.h */
#include "board.h"
#include "gpio.h"

/* 原来由 CubeMX 的 gpio.h 声明，F072 上放在这里，避免 main.c 再引一个头 */
void MX_GPIO_Init(void);

void LED1_ON(void);
void LED1_OFF(void);
void LED1_TURN(void);

void LED2_ON(void);
void LED2_OFF(void);
void LED2_TURN(void);

void LED3_ON(void);
void LED3_OFF(void);
void LED3_TURN(void);

void LED4_ON(void);
void LED4_OFF(void);
void LED4_TURN(void);

#ifdef __cplusplus
}
#endif

#endif /* __LED_H */
