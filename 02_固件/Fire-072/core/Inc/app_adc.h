#ifndef APP_ADC_H
#define APP_ADC_H

#include "ddl.h"
#include "gpio.h"      /* Gpio_SetAnalogMode */
#include "adc.h"       /* DDL 的 ADC 驱动（stc_adc_cfg_t 等）*/
#include "dmac.h"      /* DDL 的 DMAC 驱动（stc_dma_cfg_t 等）*/
#include <stdint.h>
#include "board.h"

/* 对应原 Core/Inc/adc.h + dma.h
 * 注意: 本文件名加了 app_ 前缀，因为 DDL 自己也有 drivers/inc/adc.h */
void MX_DMA_Init(void);       /* 使能 DMAC 模块时钟 */
void MX_ADC1_Init(void);      /* ADC 顺序扫描 + DMAC 循环搬运 */

/* DMA 目标缓冲：7 个通道，按 BOARD_ADC_IDX_* 下标排列 */
#define ADC_CH_COUNT   BOARD_ADC_CH_COUNT
extern volatile uint16_t adc_buffer[ADC_CH_COUNT];

#endif /* APP_ADC_H */
