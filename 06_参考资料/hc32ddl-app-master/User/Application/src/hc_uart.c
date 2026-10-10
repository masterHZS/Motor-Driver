#define USART_C
#include "hc_uart.h"
#include "bt.h"
#include "lpm.h"
#include "amx_api.h"


//串口引脚配置
static void App_UartPortInit(void)
{
    stc_gpio_cfg_t stcGpioCfg;

    DDL_ZERO_STRUCT(stcGpioCfg);

    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio,TRUE); //使能GPIO模块时钟

    ///<TX
    stcGpioCfg.enDir = GpioDirOut;
    Gpio_Init(UART_TX_PORT, UART_TX_PIN, &stcGpioCfg);
    Gpio_SetAfMode(UART_TX_PORT, UART_TX_PIN, GpioAf1);          //配置P35 端口为URART1_TX

    ///<RX
    stcGpioCfg.enDir = GpioDirIn;
    Gpio_Init(UART_RX_PORT, UART_RX_PIN, &stcGpioCfg);
    Gpio_SetAfMode(UART_RX_PORT, UART_RX_PIN, GpioAf1);          //配置P36 端口为URART1_RX
}

static void App_UartInit(void)
{
    uint16_t timer=0;

    stc_uart_baud_cfg_t stcBaud;
    stc_bt_cfg_t stcBtCfg;
    stc_uart_cfg_t  stcCfg;

    DDL_ZERO_STRUCT(stcBaud);
    DDL_ZERO_STRUCT(stcBtCfg);

    //外设时钟使能
    Sysctrl_SetPeripheralGate(SysctrlPeripheralBt,TRUE);//模式0/2可以不使能
    Sysctrl_SetPeripheralGate(SysctrlPeripheralUart1,TRUE);

    stcBaud.bDbaud  = 0u;//双倍波特率功能
    stcBaud.u32Baud = 19200u;//更新波特率位置
    stcBaud.enMode  = UartMode1; //计算波特率需要模式参数
    stcBaud.u32Pclk = Sysctrl_GetPClkFreq(); //获取PCLK
    timer = Uart_SetBaudRate(M0P_UART1, &stcBaud);

    stcBtCfg.enMD = BtMode2;
    stcBtCfg.enCT = BtTimer;
    Bt_Init(TIM1, &stcBtCfg);//调用basetimer1设置函数产生波特率
    Bt_ARRSet(TIM1,timer);
    Bt_Cnt16Set(TIM1,timer);
    Bt_Run(TIM1);

    stcCfg.enRunMode = UartMode1;//测试项，更改此处来转换4种模式测试
    Uart_Init(M0P_UART1, &stcCfg);

    ///< UART中断配置
    Uart_EnableIrq(M0P_UART1, UartRxIrq);
    Uart_ClrStatus(M0P_UART1, UartRC);
    EnableNvic(UART1_IRQn, IrqLevel1, TRUE);
}

void hc_uart_init(void)
{
    App_UartPortInit();
    App_UartInit();
}

///< UART1 中断服务函数
void Uart1_IRQHandler(void)
{
	uint8_t data;
	
	if(TRUE == Uart_GetStatus(M0P_UART1, UartRC))
	{
    data = Uart_ReceiveData(M0P_UART1);
    amx_fifo_write(&fifo_in_uart, data);
    Uart_ClrStatus(M0P_UART1, UartRC);
	}
}

