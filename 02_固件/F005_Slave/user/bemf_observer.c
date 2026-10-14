#include "bemf_observer.h"

/* 自主实现。事件资格、一次过零一次换相定时的对照来源与固定commit
 * 见06_参考资料/开源参考工程/AM32_算法对照/对照说明.md；未移植其HAL。 */
void Bemf_Reset(bemf_observer_t *o, uint8_t step, uint32_t tick,
                uint32_t period, uint32_t blank, int8_t expected,
                uint16_t hysteresis)
{
    o->comm_tick = tick;
    o->period = period;
    o->blank = blank;
    o->before_tick = tick;
    o->crossing_tick = tick;
    o->before_delta = 0;
    o->hysteresis = hysteresis;
    o->expected = expected;
    o->step = step;
    o->before_count = 0;
    o->after_count = 0;
    o->emitted = 0;
}

uint16_t Bemf_InterpolateNeutral(uint16_t v0, uint16_t v2,
                                uint32_t t0, uint32_t t1, uint32_t t2)
{
    uint32_t span = t2 - t0;
    uint32_t offset = t1 - t0;
    int32_t result;
    if (span == 0u || offset > span || span > 65535u) {
        return v0;
    }
    result = (int32_t)v0 + (((int32_t)v2 - v0) * (int32_t)offset) /
                              (int32_t)span;
    return (uint16_t)result;
}

uint8_t Bemf_Sample(bemf_observer_t *o, uint8_t step, uint32_t tick,
                    int16_t delta, uint32_t *crossing_tick)
{
    uint32_t elapsed = tick - o->comm_tick;
    int32_t signed_delta = (int32_t)delta * o->expected;
    if (step != o->step || o->emitted || o->period == 0u ||
        elapsed < o->blank || elapsed < o->period / 8u ||
        elapsed > o->period - o->period / 8u) {
        return 0;
    }
    if (signed_delta >= (int32_t)o->hysteresis) {
        if (o->before_count < 2u) { o->before_count++; }
        o->before_tick = tick;
        o->before_delta = delta;
        o->after_count = 0;
        return 0;
    }
    if (signed_delta > -(int32_t)o->hysteresis || o->before_count < 2u) {
        if (o->before_count < 2u) { o->before_count = 0u; }
        o->after_count = 0;
        return 0;
    }
    if (o->after_count == 0u) {
        uint32_t before = (uint32_t)((int32_t)o->before_delta * o->expected);
        uint32_t after = (uint32_t)(-signed_delta);
        uint32_t span = tick - o->before_tick;
        /* ADC差值限制在±4095；有效跨度不超过一个16 bit换相周期。 */
        if (span > 65535u || span > o->period / 4u ||
            before > 4095u || after > 4095u) {
            o->before_count = 0u;
            return 0;
        }
        o->crossing_tick = o->before_tick + (span * before) / (before + after);
        if (o->crossing_tick - o->comm_tick < o->period / 4u ||
            o->crossing_tick - o->comm_tick > o->period - o->period / 4u) {
            return 0;
        }
    }
    if (++o->after_count < 2u) { return 0; }
    o->emitted = 1;
    *crossing_tick = o->crossing_tick;
    return 1;
}
