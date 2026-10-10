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
 * @file   opa.h
 *
 * @brief  Header file for OPA functions
 *
 * @author MADS Team 
 *
 ******************************************************************************/

#ifndef __OPA_H__
#define __OPA_H__

/*******************************************************************************
 * Include files
 ******************************************************************************/
#include "ddl.h"

#ifdef __cplusplus
extern "C"
{
#endif

/**
 ******************************************************************************
 ** \defgroup OPAGroup  (OPA)
  **
 ******************************************************************************/
//@{

/**
 *******************************************************************************
 ** function prototypes.
 ******************************************************************************/
 
typedef enum
{
	Opa0 = 5,
	Opa1 = 6,
	Opa2 = 7,
	Opa3 = 8,
	Opa4 = 9
}en_opa_t;
#define OPA_AZEN_Pos(Opax)  ((uint32_t)((Opax)-(Opa0)))   /* 通过OPA值计算对应教零使能位 */

typedef enum
{
	Opa_Dac0Buff = 10,    /* DAC0使用OP3单位增加缓存使能 */
	Opa_Dac1Buff = 11     /* DAC0使用OP3单位增加缓存使能 */
}en_opa_dac_buff_t;

typedef enum
{
	Opa_Ch_Oen1  = 0u,            /* OPA OUT1 */
	Opa_Ch_Oen2  = 1u,            /* OPA OUT2 */
	Opa_Ch_Oen3  = 2u,            /* OPA OUT3 */
	Opa_Ch_Oen4  = 3u,            /* OPA OUT4 */
}en_opa_oenx_t;
#define  OPA_CHANNEL_OUT_Pos(Opax, Opa_OutChx)  ((uint32_t)((Opax)-(Opa0))*4 + (Opa_OutChx))  /* 通过OPA值计算指定输出通道bit位置 */
 
typedef enum
{
	Opa_M1Pclk     = 0u,
	Opa_M2Pclk     = 1u,
	Opa_M4Pclk     = 2u,
	Opa_M8Pclk     = 3u,
	Opa_M16Pclk    = 4u,
	Opa_M32Pclk    = 5u,
	Opa_M64Pclk    = 6u,
	Opa_M128Pclk   = 7u,
	Opa_M256Pclk   = 8u,
	Opa_M512Pclk   = 9u,
	Opa_M1024Pclk  = 10u,
	Opa_M2048Pclk  = 11u,
	Opa_M4096Pclk  = 12u
}en_opa_clksrc_t;

typedef struct
{
	boolean_t         bClk_sw_set;   /* 自动教零选择 1：软件校准使能。 0：软件校准禁止，软件触发校准使能 */
	boolean_t         bAz_pulse;     /* 软件校准时配置为1，软件触发校准时配置为0 */
	boolean_t         bAdctr_en;     /* 配置为1时，ADC启动会触发OPA自动校准使能 */
    en_opa_clksrc_t   enClksrc;      /* 自动校准脉冲宽度设置 */
}stc_opa_zconfig_t;	

typedef struct
{
	boolean_t         opa_ch1;       /* OPA输出1使能配置 */
	boolean_t         opa_ch2;       /* OPA输出2使能配置 */
	boolean_t         opa_ch3;       /* OPA输出3使能配置 */
	boolean_t         opa_ch4;       /* OPA输出4使能配置 */
}stc_opa_oenx_config_t;	

/******************************************************************************
 * Global variable declarations ('extern', definition in C source)
 ******************************************************************************/

/******************************************************************************
 * Global function prototypes (definition in C source)
 ******************************************************************************/
void Opa_OutChannelConfig(en_opa_t Opax, stc_opa_oenx_config_t OutChs);
void Opa_Cmd(en_opa_t Opax, boolean_t NewStatus);
void Opa_DacBufCmd(en_opa_dac_buff_t Buffx, boolean_t NewStatus);
void Opa_CalCmd(en_opa_t Opax, boolean_t NewStatus);
void Opa_CalConfig(stc_opa_zconfig_t* InitZero);
void Opa_CalSwTrig(void);

//@} // OPA Group

#ifdef __cplusplus
#endif

#endif /* __OPA_H__ */
/*******************************************************************************
 * EOF (not truncated)
 ******************************************************************************/


