#ifndef F005_BEMF_OBSERVER_H
#define F005_BEMF_OBSERVER_H

#include <stdint.h>

/* 独立于MCU的过零事件资格判断；时间均为TIM2的375 kHz ticks。 */
typedef struct {
    uint32_t comm_tick;
    uint32_t period;
    uint32_t blank;
    uint32_t before_tick;
    uint32_t crossing_tick;
    int16_t before_delta;
    uint16_t hysteresis;
    int8_t expected;
    uint8_t step;
    uint8_t before_count;
    uint8_t after_count;
    uint8_t emitted;
} bemf_observer_t;

void Bemf_Reset(bemf_observer_t *o, uint8_t step, uint32_t tick,
                uint32_t period, uint32_t blank, int8_t expected,
                uint16_t hysteresis);
uint8_t Bemf_Sample(bemf_observer_t *o, uint8_t step, uint32_t tick,
                    int16_t phase_minus_neutral, uint32_t *crossing_tick);
/* 三次采样顺序：VN(t0)、浮空相(t1)、VN(t2)，插值到浮空相的采样时刻。 */
uint16_t Bemf_InterpolateNeutral(uint16_t v0, uint16_t v2,
                                uint32_t t0, uint32_t t1, uint32_t t2);

#endif
