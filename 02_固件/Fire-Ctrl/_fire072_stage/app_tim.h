#ifndef APP_TIM_H
#define APP_TIM_H

#include "ddl.h"
#include "timer3.h"    /* DDL 的 TIM3 驱动（stc_tim3_mode23_cfg_t 等）*/
#include <stdint.h>

/* 对应原 Core/Inc/tim.h 的 MX_TIM1_Init / MX_TIM3_Init
 * 注意: 本文件名加了 app_ 前缀，因为 DDL 自己也有 drivers/inc/timer3.h */
void MX_TIM3_Init(void);

/* 运行期写占空比（替代 __HAL_TIM_SET_COMPARE）*/
void TIM_SetPWMIN(float duty);    /* PWMIN  -> PA6 / TIM3_CH0A */
void TIM_SetPWMIN2(float duty);   /* PWM_ADJ2 -> PA7 / TIM3_CH1A */
uint16_t TIM_GetARR(void);

void Error_Handler(void);

#endif /* APP_TIM_H */
