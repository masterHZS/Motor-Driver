#ifndef __DELAY_H
#define __DELAY_H

#include "common.h"

#ifdef DELAY_C
#define DELAY_EXT
#else
#define DELAY_EXT extern
#endif

#define delay_ms(x)			nrf_delay_ms(x)
#define delay_us(x)			nrf_delay_us(x)

typedef struct
{
	uint32_t current_time;
	uint32_t expired_time;
	bool free_timer_flag;
}Timer_t;

DELAY_EXT volatile uint32_t delay_count;

DELAY_EXT void TimeOutSet(Timer_t *timer, uint32_t nms);
DELAY_EXT bool IsTimeOut(Timer_t *timer);
DELAY_EXT void TimeOutFree(Timer_t *timer);
DELAY_EXT void TimeDelayMs(uint32_t nms);

DELAY_EXT void TimeStart(Timer_t *timer);
DELAY_EXT void TimeStop(Timer_t *timer);

DELAY_EXT void public_delay_init(void);
DELAY_EXT void public_delay_test(void);

DELAY_EXT void nrf_delay_us(uint32_t nus);
DELAY_EXT void nrf_delay_ms(uint32_t nms);
DELAY_EXT void nrf_delay_10us(uint32_t nus);


#endif /* __DELAY_H */

