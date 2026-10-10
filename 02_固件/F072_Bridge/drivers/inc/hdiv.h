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
 * @file   hdiv.h
 *
 * @brief  Header file for HDIV functions
 *
 * @author MADS Team 
 *
 ******************************************************************************/

#ifndef __HDIV_H__
#define __HDIV_H__

/******************************************************************************
* Include files
******************************************************************************/
#include "ddl.h"


/* C binding of definitions if building with C++ compiler */
#ifdef __cplusplus
extern "C"
{
#endif
  
  /**
  ******************************************************************************
  ** \defgroup (HDIV)
  **
  ******************************************************************************/
  //@{
  
  /******************************************************************************
  * Global type definitions
  ******************************************************************************/
  
  /******************************************************************************
  * Global definitions
  ******************************************************************************/
  
  /******************************************************************************
  * Local type definitions ('typedef')
  ******************************************************************************/
  typedef struct stc_div_unsigned_result
  {
    uint32_t Quotient;
    uint32_t Remainder;	
  }stc_div_unsigned_result_t;
  
  typedef struct stc_div_signed_result
  {
    int32_t Quotient;
    int32_t Remainder;	
  }stc_div_signed_result_t;
  /******************************************************************************
  * Global variable definitions ('extern')
  ******************************************************************************/
  
  /******************************************************************************
  * Global function prototypes (definition in C source)                        
  ******************************************************************************/
  //HDIV
  en_result_t Hdiv_Unsigned(uint32_t Dividend,uint16_t Divisor,stc_div_unsigned_result_t* stcDivResult);
  en_result_t Hdiv_Signed(int32_t Dividend,int16_t Divisor,stc_div_signed_result_t* stcDivResult);
  
  boolean_t Hdiv_GetEndState(void);
  boolean_t Hdiv_GetZeroState(void);
  
  //@} // HDIV Group
  
#ifdef __cplusplus
}
#endif

#endif /* __HDIV_H__ */
/******************************************************************************
* EOF (not truncated)
******************************************************************************/

