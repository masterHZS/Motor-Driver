#ifndef __HC_TIMER_H
#define __HC_TIMER_H

#include "common.h"
#include "wdt.h"

#ifdef TIMER_C
#define TIMER_EXT
#else
#define TIMER_EXT extern
#endif


#define ADT_CAPA_PORT		GpioPort2
#define ADT_CAPA_PIN		GpioPin3
#define ADT_CAPB_PORT		GpioPort2
#define ADT_CAPB_PIN		GpioPin4

#define Falling		0
#define Rising		1

typedef struct {
	uint8_t	 edge;
	uint16_t valeRise;
	uint16_t valeFall;
	uint16_t periodHigh;
	uint16_t periodLow;
}Timer_IC_t;

TIMER_EXT Timer_IC_t timerCapA;
TIMER_EXT Timer_IC_t timerCapB;

TIMER_EXT void hc_timer_init(void);

#endif /* __HC_TIMER_H */

