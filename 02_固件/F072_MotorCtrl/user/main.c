/******************************************************************************
 * F072_MotorCtrl - HC32F072 + FD6288T phase-1 bench controller
 *
 * UART1 PA2/PA3 is the 115200-8N1 link to the first F072 bridge.
 * Motor outputs are intentionally limited to 30% duty.
 ******************************************************************************/

#include "ddl.h"
#include "modbus_slave.h"
#include "motor.h"
#include "sysctrl.h"

static void App_ClockInit(void);

int32_t main(void)
{
    App_ClockInit();
    Motor_Init();
    Modbus_Init();

    if (SysTick_Config(SystemCoreClock / 1000u) != 0u) {
        while (1) {
        }
    }

    while (1) {
        Motor_Service();
        Modbus_Poll();
    }
}

static void App_ClockInit(void)
{
    stc_sysctrl_clk_cfg_t clkCfg;

    Sysctrl_SetRCHTrim(SysctrlRchFreq24MHz);

    DDL_ZERO_STRUCT(clkCfg);
    clkCfg.enClkSrc  = SysctrlClkRCH;
    clkCfg.enHClkDiv = SysctrlHclkDiv1;
    clkCfg.enPClkDiv = SysctrlPclkDiv1;
    Sysctrl_ClkInit(&clkCfg);
    SystemCoreClockUpdate();
}

/******************************************************************************
 * EOF
 ******************************************************************************/

