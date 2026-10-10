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
 * @file   hdiv.c
 *
 * @brief  Source file for HDIV functions
 *
 * @author MADS Team 
 *
 ******************************************************************************/

/*******************************************************************************
* Include files
******************************************************************************/
#include "ddl.h"
#include "hdiv.h"
/**
*******************************************************************************
** \addtogroup CrcGroup
******************************************************************************/
//@{

/*******************************************************************************
* Local pre-processor symbols/macros ('#define')
******************************************************************************/

/*******************************************************************************
* Global variable definitions (declared in header file with 'extern')
******************************************************************************/

/*******************************************************************************
* Local type definitions ('typedef')
******************************************************************************/

/*******************************************************************************
* Local variable definitions ('static')
******************************************************************************/

/*******************************************************************************
* Local function prototypes ('static')
******************************************************************************/


/*******************************************************************************
* Function implementation - global ('extern') and local ('static')
******************************************************************************/
/**
* \brief   
*          HDIV 有符号除法
*
* \param   [in]   Dividend      被除数
* \param   [in]   Dividsor      除数
* \param   [out]  stcDivResult  商和余数
*
* \retval  en_result_t  Ok:  配置成功
* \retval  en_result_t  ErrorInvalidParameter: 无效参数
*/
en_result_t Hdiv_Unsigned(uint32_t Dividend,uint16_t Divisor,stc_div_unsigned_result_t* stcDivResult)
{
  M0P_HDIV->SIGN_f.SIGN = 0;
  if(NULL == stcDivResult)
  {
    return ErrorInvalidParameter;
  }
  (M0P_HDIV ->DIVIDEND) = Dividend;
  (M0P_HDIV ->DIVISOR) = Divisor;
  
  if(Hdiv_GetZeroState() == TRUE)
  {
    return ErrorInvalidParameter;
  }
  
  while(Hdiv_GetEndState() != TRUE)
  {
    ;
  }
  
  stcDivResult->Quotient = M0P_HDIV->QUOTIENT_f.QUOTIENT;
  stcDivResult->Remainder = M0P_HDIV ->REMAINDER_f.REMAINDER; 		
  return Ok;
}


/**
* \brief   
*          HDIV 无符号除法
*
* \param   [in]   Dividend      被除数
* \param   [in]   Dividsor      除数
* \param   [out]  stcDivResult  商和余数
*
* \retval  en_result_t  Ok:  配置成功
* \retval  en_result_t  ErrorInvalidParameter: 无效参数
*/
en_result_t Hdiv_Signed(int32_t Dividend,int16_t Divisor,stc_div_signed_result_t* stcDivResult)
{

  __IO uint32_t * pDivdend = &(M0P_HDIV ->DIVIDEND);
  __IO uint32_t * pDivsor = &(M0P_HDIV ->DIVISOR);
  if(NULL == stcDivResult)
  {
    return ErrorInvalidParameter;
  }
  M0P_HDIV->SIGN_f.SIGN = 1;
  *(__IO int32_t *)pDivdend = Dividend;
  *(__IO int16_t *)pDivsor = Divisor;
  
  if(Hdiv_GetZeroState() == TRUE)
  {
    return ErrorInvalidParameter;
  }
  
  while(Hdiv_GetEndState() != TRUE)
  {
    ;
  }
  
  stcDivResult->Quotient = M0P_HDIV->QUOTIENT_f.QUOTIENT;
  stcDivResult->Remainder = M0P_HDIV ->REMAINDER_f.REMAINDER; 		
  return Ok;
}

boolean_t Hdiv_GetEndState(void)
{
  return M0P_HDIV->STAT_f.END;
}

boolean_t Hdiv_GetZeroState(void)
{
  return M0P_HDIV->STAT_f.ZERO;
}
//@} // CrcGroup

/*******************************************************************************
* EOF (not truncated)
******************************************************************************/
