/******************************************************************************
 * Copyright (C) 2021, Xiaohua Semiconductor Co., Ltd. All rights reserved.
 *
 * This software component is licensed by XHSC under BSD 3-Clause license
 * (the "License"); You may not use this file except in compliance with the
 * License. You may obtain a copy of the License at:
 *                    opensource.org/licenses/BSD-3-Clause
 *
 ******************************************************************************/

/******************************************************************************
 * @file   system_hc32f072.c
 *
 * @brief  Source file for SYSTEM functions
 *
 * @author MADS Team 
 *
 ******************************************************************************/

/******************************************************************************/
/* Include files                                                              */
/******************************************************************************/
#include "base_types.h"
#include "hc32f072.h"
#include "system_hc32f072.h"
#include "sysctrl.h"

/**
 ******************************************************************************
 ** System Clock Frequency (Core Clock) Variable according CMSIS
 ******************************************************************************/
uint32_t SystemCoreClock = 4000000;


//add clock source.
void SystemCoreClockUpdate (void) // Update SystemCoreClock variable
{
    SystemCoreClock = Sysctrl_GetHClkFreq();
}

/**
 ******************************************************************************
 ** \brief  对MCU未引出IO端口进行默认配置.
 **
 ** \param  none
 ** \return none
 ******************************************************************************/
static void _InitHidePin(void)
{
    uint32_t tmpReg = M0P_SYSCTRL->PERI_CLKEN0;
	
	M0P_SYSCTRL->PERI_CLKEN0_f.GPIO = 1;
	
#if defined(HC32F072Pxxx)	    //100PIN MCU	  
	M0P_GPIO->PFADS &= 0xFF4F;  ///< PF04/PF05/PF07配置为数字端口    
	
    M0P_GPIO->PFDIR	|= 0x00B0;  ///< PF04/PF05/PF07配置为端口输入	
	  
	M0P_GPIO->PFPU  |= 0x00B0;  ///< PF04/PF05/PF07配置为上拉
	
#elif defined(HC32F072Kxxx)     //64PIN MCU	  
	M0P_GPIO->PDADS &= 0x0004;  ///< PD00/PD01/PD03~15配置为数字端口	  
	M0P_GPIO->PEADS &= 0x0000;  ///< PE00~15配置为数字端口	  
	M0P_GPIO->PFADS &= 0xF903;  ///< PF02~07/PF09~10配置为数字端口	
    
	M0P_GPIO->PDDIR	|= 0xFFFB;  ///< PD00/PD01/PD03~15配置为端口输入    
	M0P_GPIO->PEDIR	|= 0xFFFF;  ///< PE00~15配置为端口输入	  
	M0P_GPIO->PFDIR	|= 0x06FC;  ///< PF02~07/PF09~10配置为数字端口	
	  
	M0P_GPIO->PDPU  |= 0xFFFB;  ///< PD00/PD01/PD03~15配置为上拉	  
	M0P_GPIO->PEPU  |= 0xFFFF;  ///< PE00~15配置为上拉	  
	M0P_GPIO->PFPU  |= 0x06FC;  ///< PF02~07/PF09~10配置为数字端口
		
#elif defined(HC32F072Jxxx)     //48PIN MCU	  
	M0P_GPIO->PCADS &= 0xE000;  ///< PC00~12配置为数字端口	  
	M0P_GPIO->PDADS &= 0x0000;  ///< PD00~15配置为数字端口	  
	M0P_GPIO->PEADS &= 0x0000;  ///< PE00~15配置为数字端口	  
	M0P_GPIO->PFADS &= 0xF903;  ///< PF02~07/PF09~10配置为数字端口	
    
	M0P_GPIO->PCDIR	|= 0x1FFF;  ///< PC00~12配置为端口输入    
	M0P_GPIO->PDDIR	|= 0xFFFF;  ///< PD00~15配置为端口输入    
	M0P_GPIO->PEDIR	|= 0xFFFF;  ///< PE00~15配置为端口输入	  
	M0P_GPIO->PFDIR	|= 0x06FC;  ///< PF02~07/PF09~10配置为数字端口
	
	  
	M0P_GPIO->PCPU  |= 0x1FFF;  ///< PC00~12配置为上拉	  
	M0P_GPIO->PDPU  |= 0xFFFF;  ///< PD00~15配置为上拉	  
    M0P_GPIO->PEPU  |= 0xFFFF;  ///< PE00~15配置为上拉	  
	M0P_GPIO->PFPU  |= 0x06FC;  ///< PF02~07/PF09~10配置为数字端口
		
#endif
	
	M0P_SYSCTRL->PERI_CLKEN0 = tmpReg;
}
/**
 ******************************************************************************
 ** \brief  Setup the microcontroller system. Initialize the System and update
 ** the SystemCoreClock variable.
 **
 ** \param  none
 ** \return none
 ******************************************************************************/
void SystemInit(void)
{
    M0P_SYSCTRL->RCL_CR_f.TRIM = (*((volatile uint16_t*) (0x00100C22ul)));
    M0P_SYSCTRL->RCH_CR_f.TRIM = (*((volatile uint16_t*) (0x00100C08ul)));
    SystemCoreClockUpdate();
    _InitHidePin();
}


#if defined (__CC_ARM)
extern int32_t $Super$$main(void);
/* re-define main function */
int $Sub$$main(void)
{
    SystemInit();
    $Super$$main();
    return 0;
}
#elif defined (__ARMCC_VERSION) && (__ARMCC_VERSION >= 6010050)
extern int32_t $Super$$main(void);
/* re-define main function */
int $Sub$$main(void)
{
    SystemInit();
    $Super$$main();
    return 0;
}
#elif defined(__ICCARM__)
extern int32_t main(void);
/* __low_level_init will auto called by IAR cstartup */
extern void __iar_data_init3(void);
int __low_level_init(void)
{
    // call IAR table copy function.
    __iar_data_init3();
    SystemInit();
    main();
    return 0;
}
#endif

