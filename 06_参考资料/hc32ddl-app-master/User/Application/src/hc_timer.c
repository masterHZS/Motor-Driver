#define TIMER_C
#include "hc_timer.h"
#include "bt.h"
#include "lpm.h"
#include "adt.h"


/*******************************************************************************
 * BT定时功能测试 （重载模式）
 ******************************************************************************/
en_result_t App_BtTimerTest(void)
{
    stc_bt_cfg_t   		stcCfg;
    en_result_t       enResult = Error;
    uint16_t          u16ArrData = 0x10000 - 10000;			//15000: 主频24M，16分频，10ms中断一次
    uint16_t          u16InitCntData = 0x10000 - 10000;	//10000: 主频16M，16分频，10ms中断一次

    Sysctrl_SetPeripheralGate(SysctrlPeripheralBt, TRUE);

    stcCfg.enGateP = BtPositive;
    stcCfg.enGate  = BtGateDisable;
    stcCfg.enPRS   = BtPCLKDiv16;
    stcCfg.enTog   = BtTogDisable;
    stcCfg.enCT    = BtTimer;
    stcCfg.enMD    = BtMode2;

    //Bt配置初始化
    if (Ok != Bt_Init(TIM0, &stcCfg))
    {
        enResult = Error;
    }

    //INT ENABLE
    Bt_ClearIntFlag(TIM0);
    Bt_EnableIrq(TIM0);
    EnableNvic(TIM0_IRQn, IrqLevel3, TRUE);

    //设置重载值和计数值，启动计数
    Bt_ARRSet(TIM0, u16ArrData);
    Bt_Cnt16Set(TIM0, u16InitCntData);
    Bt_Run(TIM0);

    return enResult;
}

///< AdvTimer端口初始化
void App_AdtPortInit(void)
{
    stc_gpio_cfg_t           stcTIM4Port;
    
    DDL_ZERO_STRUCT(stcTIM4Port);
    
    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);  //端口外设时钟使能
    
    stcTIM4Port.enDir  = GpioDirIn;
    //P23设置为TIM4_CHA
    Gpio_Init(ADT_CAPA_PORT, ADT_CAPA_PIN, &stcTIM4Port);
    Gpio_SetAfMode(ADT_CAPA_PORT,ADT_CAPA_PIN,GpioAf3);

    //P24设置为TIM4_CHB
    Gpio_Init(ADT_CAPB_PORT, ADT_CAPB_PIN, &stcTIM4Port);
    Gpio_SetAfMode(ADT_CAPB_PORT,ADT_CAPB_PIN,GpioAf1);
  
}

///< AdvTimer初始化
void App_AdvTimerIcInit(void)
{
    stc_adt_basecnt_cfg_t    stcAdtBaseCntCfg;
    stc_adt_CHxX_port_cfg_t  stcAdtTIM4ACfg;
    stc_adt_CHxX_port_cfg_t  stcAdtTIM4BCfg;

    DDL_ZERO_STRUCT(stcAdtBaseCntCfg);
    DDL_ZERO_STRUCT(stcAdtTIM4ACfg);
    DDL_ZERO_STRUCT(stcAdtTIM4BCfg);

    Sysctrl_SetPeripheralGate(SysctrlPeripheralAdvTim, TRUE); //ADT外设时钟使能
    
    
    stcAdtBaseCntCfg.enCntMode = AdtSawtoothMode;              //Sawtooth Mode
    stcAdtBaseCntCfg.enCntDir = AdtCntUp;                      // Cnt up
    stcAdtBaseCntCfg.enCntClkDiv = AdtClkPClk0Div16;           // PCLK0/16
    Adt_Init(M0P_ADTIM4, &stcAdtBaseCntCfg);                   //ADT载波、计数模式、时钟配置
    
    Adt_SetPeriod(M0P_ADTIM4, 0xFFFF);                      	 //周期设置
    
#if 1
    stcAdtTIM4ACfg.enCap = AdtCHxCompareInput;                 //Channel A 作为捕获输入(used as capture input)
//    stcAdtTIM4ACfg.bFltEn = TRUE;
//    stcAdtTIM4ACfg.enFltClk = AdtFltClkPclk0Div16;
    Adt_CHxXPortCfg(M0P_ADTIM4, AdtCHxA, &stcAdtTIM4ACfg);     //Channel A配置 & GPIO CHA 输入滤波使能
#endif
    
#if 1
    stcAdtTIM4BCfg.enCap = AdtCHxCompareInput;                 //Channel B 作为捕获输入(used as capture input)
//		stcAdtTIM4BCfg.bFltEn = TRUE;
//    stcAdtTIM4BCfg.enFltClk = AdtFltClkPclk0Div16;
    Adt_CHxXPortCfg(M0P_ADTIM4, AdtCHxB, &stcAdtTIM4BCfg);
#endif
    
    Adt_CfgHwCaptureA(M0P_ADTIM4, AdtHwTrigCHxAFall);       //硬件捕获A条件配置:CHA端口上采样到下升沿
    Adt_CfgHwCaptureB(M0P_ADTIM4, AdtHwTrigCHxBFall);       //硬件捕获B条件配置:CHB端口上采样到下降沿
    
//    Adt_CfgHwClear(M0P_ADTIM4, AdtHwTrigCHxARise);          //硬件清零条件：CHA 端口采样到上升沿
//    Adt_CfgHwClear(M0P_ADTIM4, AdtHwTrigCHxAFall);          //硬件清零条件：CHA 端口采样到下降沿
//    Adt_CfgHwClear(M0P_ADTIM4, AdtHwTrigCHxBRise);          //硬件清零条件：CHB 端口采样到上升沿
//    Adt_CfgHwClear(M0P_ADTIM4, AdtHwTrigCHxBFall);          //硬件清零条件：CHB 端口采样到下降沿
    Adt_EnableHwClear(M0P_ADTIM4);
    
    Adt_ClearAllIrqFlag(M0P_ADTIM4);
    Adt_CfgIrq(M0P_ADTIM4, AdtCMAIrq, TRUE);    //捕获中断A配置
    Adt_CfgIrq(M0P_ADTIM4, AdtCMBIrq, TRUE);    //捕获中断B配置
    EnableNvic(ADTIM4_IRQn, IrqLevel2, TRUE);   //AdvTimer4中断使能
}

static void App_WdtInit(void)
{
    ///< 开启WDT外设时钟
    Sysctrl_SetPeripheralGate(SysctrlPeripheralWdt,TRUE);
    ///< WDT 初始化
    Wdt_Init(WdtResetEn, WdtT3s28);

    ///< 启动 WDT
    Wdt_Start();
}

void hc_timer_init(void)
{
	App_BtTimerTest();
	
	App_AdtPortInit();
	App_AdvTimerIcInit();
	Adt_StartCount(M0P_ADTIM4);   //AdvTimer4 运行

	App_WdtInit();
}


/*******************************************************************************
 * TIM0中断服务函数
 ******************************************************************************/
void Tim0_IRQHandler(void)
{
    if (TRUE == Bt_GetIntFlag(TIM0))
    {
        Bt_ClearIntFlag(TIM0);
        delay_count += 10;
    }
}

/*******************************************************************************
 * TIM4中断服务函数
 ******************************************************************************/
void Tim4_IRQHandler(void)
{
    //捕获中断A
    if(TRUE == Adt_GetIrqFlag(M0P_ADTIM4, AdtCMAIrq))
    {        
        Adt_ClearIrqFlag(M0P_ADTIM4, AdtCMAIrq);
        
        if(timerCapA.edge== Falling)
		    {
		    	Adt_GetCaptureValue(M0P_ADTIM4, AdtCHxA, &timerCapA.valeFall);
		    	Adt_CfgHwCaptureA(M0P_ADTIM4, AdtHwTrigCHxARise);       // 设置为上升沿捕获
		    	timerCapA.edge = Rising;

					if(timerCapA.valeFall > timerCapA.valeRise)
		    		timerCapA.periodHigh = timerCapA.valeFall - timerCapA.valeRise;
		    	else
		    		timerCapA.periodHigh = ((0xFFFF - timerCapA.valeRise) + timerCapA.valeFall);
		    }
		    else if(timerCapA.edge == Rising)
		    {
		    	Adt_GetCaptureValue(M0P_ADTIM4, AdtCHxA, &timerCapA.valeRise);
		    	Adt_CfgHwCaptureA(M0P_ADTIM4, AdtHwTrigCHxAFall);       // 设置为下升沿捕获
		    	timerCapA.edge = Falling;

		    	if(timerCapA.valeRise > timerCapA.valeFall)
		    		timerCapA.periodLow = timerCapA.valeRise - timerCapA.valeFall;
		    	else
		    		timerCapA.periodLow = ((0xFFFF - timerCapA.valeFall) + timerCapA.valeRise);
		    }
    }
    
    //捕获中断B
    if(TRUE == Adt_GetIrqFlag(M0P_ADTIM4, AdtCMBIrq))
    {
        Adt_ClearIrqFlag(M0P_ADTIM4, AdtCMBIrq);

        if(timerCapB.edge== Falling)
		    {
		    	Adt_GetCaptureValue(M0P_ADTIM4, AdtCHxB, &timerCapB.valeFall);
		    	Adt_CfgHwCaptureB(M0P_ADTIM4, AdtHwTrigCHxBRise);       // 设置为上升沿捕获
		    	timerCapB.edge = Rising;

					if(timerCapB.valeFall > timerCapB.valeRise)
		    		timerCapB.periodHigh = timerCapB.valeFall - timerCapB.valeRise;
		    	else
		    		timerCapB.periodHigh = ((0xFFFF - timerCapB.valeRise) + timerCapB.valeFall);
		    }
		    else if(timerCapB.edge == Rising)
		    {
		    	Adt_GetCaptureValue(M0P_ADTIM4, AdtCHxB, &timerCapB.valeRise);
		    	Adt_CfgHwCaptureB(M0P_ADTIM4, AdtHwTrigCHxBFall);       // 设置为下升沿捕获
		    	timerCapB.edge = Falling;

		    	if(timerCapB.valeRise > timerCapB.valeFall)
		    		timerCapB.periodLow = timerCapB.valeRise - timerCapB.valeFall;
		    	else
		    		timerCapB.periodLow = ((0xFFFF - timerCapB.valeFall) + timerCapB.valeRise);
		    }
    }
}

