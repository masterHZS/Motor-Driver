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
 * @file   opa.c
 *
 * @brief  Source file for OPA functions
 *
 * @author MADS Team 
 *
 ******************************************************************************/

/******************************************************************************
 * Include files
 ******************************************************************************/
#include "opa.h"

/**
 ******************************************************************************
 ** \addtogroup OPAGroup
 ******************************************************************************/
//@{

/******************************************************************************
 * Local pre-processor symbols/macros ('#define')
 ******************************************************************************/


/******************************************************************************
 * Global variable definitions (declared in header file with 'extern')
 ******************************************************************************/


/******************************************************************************
 * Local type definitions ('typedef')
 ******************************************************************************/

/******************************************************************************
 * Local function prototypes ('static')
 ******************************************************************************/

/******************************************************************************
 * Local variable definitions ('static')
 ******************************************************************************/

/*****************************************************************************
 * Function implementation - global ('extern') and local ('static')
 *****************************************************************************/
 
/**
******************************************************************************
	** \brief   OPA 输出通道设置
	**
	** \param   Opax:       指定使用哪个OPA，共3个OPA，取值:Opa0,Opa1,Opa2
	**          OutChs:     OPA输出通道配置，可配置多个通道使能
	** \retval  无
	**
******************************************************************************/
void Opa_OutChannelConfig(en_opa_t Opax, stc_opa_oenx_config_t OutChs)
{
	if ((Opax==Opa0)||(Opax==Opa1)||(Opax==Opa2))
	{
		SetBit((uint32_t)(&(M0P_OPA->CR0)), OPA_CHANNEL_OUT_Pos(Opax, Opa_Ch_Oen1), OutChs.opa_ch1);
		SetBit((uint32_t)(&(M0P_OPA->CR0)), OPA_CHANNEL_OUT_Pos(Opax, Opa_Ch_Oen2), OutChs.opa_ch2);
		SetBit((uint32_t)(&(M0P_OPA->CR0)), OPA_CHANNEL_OUT_Pos(Opax, Opa_Ch_Oen3), OutChs.opa_ch3);
		SetBit((uint32_t)(&(M0P_OPA->CR0)), OPA_CHANNEL_OUT_Pos(Opax, Opa_Ch_Oen4), OutChs.opa_ch4);
	}
}

/**
******************************************************************************
	** \brief  OPAx 使能或禁止
	**
	** \param  Opax:       共5个OPA，取值:Opa0,Opa1,Opa2,Opa3,Opa4
	**  	   NewStatus : 配置Opx使能或禁止 TRUE or FALSE	
	** \retval 无
	**
******************************************************************************/
void Opa_Cmd(en_opa_t Opax, boolean_t NewStatus)
{
	SetBit((uint32_t)(&(M0P_OPA->CR1)), Opax, NewStatus);
	if(Opax == Opa3)       /*当OPA3使能时，DAC0不能使用OPA3作为输出缓存*/
	{
		M0P_OPA->CR1 &= (uint32_t)~(1<<Opa_Dac0Buff);
	}else if(Opax == Opa4) /*当OPA4使能时，DAC1不能使用OPA4作为输出缓存*/
	{
		M0P_OPA->CR1 &= (uint32_t)~(1<<Opa_Dac1Buff);
	}else
    {
    
    }
}

/**
******************************************************************************
	** \brief  DAC缓存 使能或禁止
	**
	** \param  Buffx:      Opa_Adc0Buff or Opa_Adc1Buff
	**  	   NewStatus : 配置Buffx使能或禁止 TRUE or FALSE	
	** \retval 无
	**
******************************************************************************/
void Opa_DacBufCmd(en_opa_dac_buff_t Buffx, boolean_t NewStatus)
{
	SetBit((uint32_t)(&(M0P_OPA->CR1)), Buffx, NewStatus);
	if (Buffx == Opa_Dac0Buff)
    {
		M0P_OPA->CR1 &= (uint32_t)~(1<<Opa3);  /*DAC0使用OP3单位增加缓存使能，则OPA3使能不可用*/
	}else
	{
		M0P_OPA->CR1 &= (uint32_t)~(1<<Opa4);  /*DAC1使用OP4单位增加缓存使能，则OPA4使能不可用*/
	}
}

/**
******************************************************************************
	** \brief  配置OPA教零使能
	**
	** \param  Opax:       指定使用哪个OPA，共5个OPA，取值:Opa0,Opa1,Opa2,Opa3,Opa4
	**  	   NewStatus : 配置Opx教零使能或禁止 TRUE or FALSE	
	** \retval 无
	**
******************************************************************************/
void Opa_CalCmd(en_opa_t Opax, boolean_t NewStatus)
{
	SetBit((uint32_t)(&(M0P_OPA->CR1)), OPA_AZEN_Pos(Opax), NewStatus);
}



/**
******************************************************************************
	** \brief  自动教零参数配置
	**
	** \param  InitZero :  
	** \retval 无
	**
******************************************************************************/
void Opa_CalConfig(stc_opa_zconfig_t* InitZero)
{
	M0P_OPA->CR_f.CLK_SEL = InitZero->enClksrc;
	M0P_OPA->CR_f.CLK_SW_SET = InitZero->bClk_sw_set;
	M0P_OPA->CR_f.AZ_PULSE = InitZero->bAz_pulse;
	M0P_OPA->CR_f.ADCTR_EN   = InitZero->bAdctr_en; 
}

/**
******************************************************************************
	** \brief  软件触发自动教零
	**
	** \param  InitZero :  
	** \retval 无
	**
******************************************************************************/
void Opa_CalSwTrig(void)
{
	M0P_OPA->CR_f.TRIGGER = TRUE;
}

