#define DELAY_C
#include "delay.h"

Timer_t main_timer;

void TimeOutSet(Timer_t *timer, uint32_t nms)
{
	timer->current_time = delay_count;
	timer->expired_time = nms;
	timer->free_timer_flag = true;
}

void TimeOutFree(Timer_t *timer)
{
	timer->free_timer_flag = false;
}

/**
  * @brief  Waitting for delay timeout.
  * @param  Init in the function TimeOutSet()
  * @retval None
  */
bool IsTimeOut(Timer_t *timer)
{
	if(timer->free_timer_flag)
	{
		if ((delay_count - timer->current_time) >= timer->expired_time)
		{
			return TRUE;
		}
	}
	return FALSE;
}

void TimeDelayMs(uint32_t nms)
{
	Timer_t wait_timer;
	TimeOutSet(&(wait_timer), nms);
	while(!IsTimeOut(&wait_timer));
}

void TimeStart(Timer_t *timer)
{
	timer->current_time = delay_count;
}

void TimeStop(Timer_t *timer)
{
	timer->expired_time = delay_count - timer->current_time;
}

void nrf_delay_us(uint32_t nus)
{
//	while(nus--); // 7uS
//	for(;nus>0;nus--); //3us
}


void nrf_delay_ms(uint32_t nms)
{
	delay1ms(nms);
}

void nrf_delay_10us(uint32_t nus)
{
	for(;nus>0;nus--)
	{
//		__asm("nop");
#if 0	// 24M
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
#else
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
		asm("nop");asm("nop");asm("nop");asm("nop");asm("nop");
#endif
	}
}


void public_delay_init(void)
{
    stc_gpio_cfg_t stcGpioCfg;
    
    ///< 打开GPIO外设时钟门控
    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE); 
    
    ///< 端口方向配置->输出(其它参数与以上（输入）配置参数一致)
    stcGpioCfg.enDir = GpioDirOut;
    ///< 端口上下拉配置->下拉
    stcGpioCfg.enPu = GpioPuDisable;
    stcGpioCfg.enPd = GpioPdEnable;
    
    ///< GPIO初始化
    Gpio_Init(DELAY_PORT, DELAY_PIN, &stcGpioCfg);
}

void public_delay_test(void)
{
	// us级测试，主频24MHz，只看高电平
	
//	uint32_t timcnt = 10;

#if 0 // tu1
	// 1.8us
	Gpio_WriteOutputIO(DELAY_PORT, DELAY_PIN, TRUE);
	Gpio_WriteOutputIO(DELAY_PORT, DELAY_PIN, FALSE);
#endif

#if 0 // tu2
	// 450ns
	*((volatile uint32_t *)((uint32_t)&M0P_GPIO->P0OUT + DELAY_PORT))|= ((1UL)<<(DELAY_PIN));
	*((volatile uint32_t *)((uint32_t)&M0P_GPIO->P0OUT + DELAY_PORT))&= (~(1UL<<(DELAY_PIN)));
#endif

	
#if 0 // tu3
	// timcnt = 1 	, 13  us;
	// timcnt = 5 	, 57  us;
	// timcnt = 10 	, 111 us;
	// timcnt = 50	, 540 us;
	*((volatile uint32_t *)((uint32_t)&M0P_GPIO->P0OUT + DELAY_PORT))|= ((1UL)<<(DELAY_PIN));
	delay10us(timcnt);
	*((volatile uint32_t *)((uint32_t)&M0P_GPIO->P0OUT + DELAY_PORT))&= (~(1UL<<(DELAY_PIN)));
	delay10us(timcnt);
#endif


#if 0 // tu4
		// 900ns
		GPIO_WriteHigh(DELAY_PORT, DELAY_PIN);
		GPIO_WriteLow(DELAY_PORT, DELAY_PIN);
#endif


#if 0
	// timcnt = 1 	, 13  us;
	// timcnt = 5 	, 57  us;
	// timcnt = 10 	, 111 us;
	// timcnt = 50	, 540 us;
	GPIO_WriteHigh(DELAY_PORT, DELAY_PIN);
	delay10us(timcnt);
	GPIO_WriteLow(DELAY_PORT, DELAY_PIN);
	delay10us(timcnt);
#endif

	

#if 0
	// timcnt = 1 	, 15  us;
	// timcnt = 5 	, 58  us;
	// timcnt = 10 	, 101 us;
	// timcnt = 50	, 492 us;
	GPIO_WriteHigh(DELAY_PORT, DELAY_PIN);
	delay10us(timcnt - (timcnt/10));
	GPIO_WriteLow(DELAY_PORT, DELAY_PIN);
	delay10us(timcnt - (timcnt/10));
#endif


#if 1 // tu5, tu6
	// timcnt = 1 	, 11  us;
	// timcnt = 5 	, 51  us;
	// timcnt = 10 	, 100 us;
	// timcnt = 50	, 502 us;
	// timcnt = 80	, 800 us;
	GPIO_WriteHigh(DELAY_PORT, DELAY_PIN);
	nrf_delay_10us(10);
	GPIO_WriteLow(DELAY_PORT, DELAY_PIN);
	nrf_delay_10us(50);
#endif
}

