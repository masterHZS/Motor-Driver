/******************************************************************************
 * main.c - HC32F005C6PA Hall-less BLDC self test
 *
 * The motor is a three-phase 2216-730KV pump with no Hall sensors.  Motor_Init()
 * 配置互补PWM、谷点换相与固定OFF窗口VN/浮空相ADC采样。
 * ADC中断处理过零，TIM1/TIM4安排换相，1ms时基执行启动与速度环。
 * 主循环只处理通信和监控，不能成为过零采样的执行时基。
 *
 * SWD结果区（链接脚本独立保留，位于栈顶之外）：
 *   0x20000F00  reset magic
 *   0x20000F04  main entered magic
 *   0x20000F08  run-state boolean
 *   0x20000F0C  fault bits
 *   0x20000F10  peak current, ADC counts (1 A ~= 246 counts)
 *   0x20000F14  bus voltage, ADC counts (14.038 mV/count)
 *   0x20000F18  electrical Hz
 *   0x20000F1C  commutation steps executed
 *   0x20000F20  millisecond tick
 *   0x20000F24  build ID
 *   0x20000F28  firmware mode: 0 idle, 1 open loop, 2 BEMF closed loop
 *   0x20000F2C  filtered floating-phase BEMF, ADC counts
 *   0x20000F30  BEMF zero threshold, ADC counts
 *   0x20000F34  valid zero-cross count
 *
 * BENCH PREREQUISITES
 *   1. Current-limited 4S bus, initially 0.5 A.
 *   2. Verify safe six-gate low state and PWM waveforms before connecting the
 *      pump.
 *   3. If the pump does not complete PRECHARGE -> ALIGN -> OPEN_LOOP, first
 *      lower the align duty/current limit rather than increasing bus voltage.
 ******************************************************************************/

#include "ddl.h"
#include "gpio.h"
#include "sysctrl.h"

#include "monitor.h"
#include "motor.h"
#include "modbus_slave.h"

#if (MOTOR_UART_TX_TEST || MOTOR_UART_ECHO_TEST || MOTOR_UART_ECHO_P01)
#include "bt.h"
#include "uart.h"
#endif

#define MARK_BASE           0x20000F00UL
#define MARK_RESET_RAN      (*(volatile uint32_t *)(MARK_BASE + 0x00UL))
#define MARK_MAIN_ENTERED   (*(volatile uint32_t *)(MARK_BASE + 0x04UL))
#define MARK_STATE          (*(volatile uint32_t *)(MARK_BASE + 0x08UL))
#define MARK_FAULT          (*(volatile uint32_t *)(MARK_BASE + 0x0CUL))
#define MARK_ISENSE_PEAK    (*(volatile uint32_t *)(MARK_BASE + 0x10UL))
#define MARK_VBUS           (*(volatile uint32_t *)(MARK_BASE + 0x14UL))
#define MARK_ELEC_HZ        (*(volatile uint32_t *)(MARK_BASE + 0x18UL))
#define MARK_STEP_COUNT     (*(volatile uint32_t *)(MARK_BASE + 0x1CUL))
#define MARK_TICK_MS        (*(volatile uint32_t *)(MARK_BASE + 0x20UL))
#define MARK_BUILD_ID       (*(volatile uint32_t *)(MARK_BASE + 0x24UL))
#define MARK_FW_MODE        (*(volatile uint32_t *)(MARK_BASE + 0x28UL))
#define MARK_BEMF_COUNTS    (*(volatile uint32_t *)(MARK_BASE + 0x2CUL))
#define MARK_BEMF_THRESHOLD (*(volatile uint32_t *)(MARK_BASE + 0x30UL))
#define MARK_ZERO_CROSSES   (*(volatile uint32_t *)(MARK_BASE + 0x34UL))
#define MARK_COMM_READY     (*(volatile uint32_t *)(MARK_BASE + 0x38UL))

#define MARK_MAGIC_RESET    (0x005A5A01UL)
#define MARK_MAGIC_MAIN     (0x0000B105UL)

#if (MOTOR_UART_TX_TEST || MOTOR_UART_ECHO_TEST || MOTOR_UART_ECHO_P01)
static void UartTestInit(boolean_t enableRx)
{
    stc_gpio_cfg_t gpioCfg;
    stc_uart_baud_cfg_t baudCfg;
    stc_uart_cfg_t uartCfg;
    stc_bt_cfg_t btCfg;
    uint16_t timerValue;

    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralBt, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralUart0, TRUE);

    DDL_ZERO_STRUCT(gpioCfg);
    gpioCfg.bOutputVal = TRUE;
    gpioCfg.enDrv = GpioDrvH;
    gpioCfg.enPu = GpioPuDisable;
    gpioCfg.enPd = GpioPdDisable;
    gpioCfg.enDir = GpioDirOut;
    gpioCfg.enOD = GpioOdDisable;
    (void)Gpio_Init(GpioPort1, GpioPin4, &gpioCfg);
    (void)Gpio_SetAfMode(GpioPort1, GpioPin4, GpioAf6);

    if (enableRx != FALSE) {
        gpioCfg.bOutputVal = FALSE;
        gpioCfg.enDir = GpioDirIn;
        gpioCfg.enPu = GpioPuEnable;
        gpioCfg.enPd = GpioPdDisable;
        gpioCfg.enOD = GpioOdDisable;
#if MOTOR_UART_ECHO_P01
        (void)Gpio_Init(GpioPort0, GpioPin1, &gpioCfg);
        (void)Gpio_SetAfMode(GpioPort0, GpioPin1, GpioAf1);
#else
        Sysctrl_SetFunc(SysctrlSWDUseIOEn, TRUE);
        (void)Gpio_Init(GpioPort2, GpioPin7, &gpioCfg);
        (void)Gpio_SetAfMode(GpioPort2, GpioPin7, GpioAf5);
#endif
    }

    DDL_ZERO_STRUCT(baudCfg);
    baudCfg.enMode = UartMode1;
    baudCfg.bDbaud = TRUE;
    baudCfg.u32Pclk = Sysctrl_GetPClkFreq();
    baudCfg.u32Baud = 9600u;
    timerValue = Uart_SetBaudRate(M0P_UART0, &baudCfg);

    DDL_ZERO_STRUCT(btCfg);
    btCfg.enMD = BtMode2;
    btCfg.enCT = BtTimer;
    btCfg.enPRS = BtPCLKDiv1;
    btCfg.enTog = BtTogDisable;
    (void)Bt_Init(TIM0, &btCfg);
    (void)Bt_ARRSet(TIM0, timerValue);
    (void)Bt_Cnt16Set(TIM0, timerValue);
    (void)Bt_Run(TIM0);

    DDL_ZERO_STRUCT(uartCfg);
    uartCfg.enRunMode = UartMode1;
    (void)Uart_Init(M0P_UART0, &uartCfg);
    Uart_ClrStatus(M0P_UART0, UartRC);
    Uart_ClrStatus(M0P_UART0, UartTC);
}

int main(void)
{
#if (MOTOR_UART_ECHO_TEST || MOTOR_UART_ECHO_P01)
    uint8_t value;
    UartTestInit(TRUE);
    for (;;) {
        if (Uart_GetStatus(M0P_UART0, UartRC)) {
            value = Uart_ReceiveData(M0P_UART0);
            Uart_ClrStatus(M0P_UART0, UartRC);
            (void)Uart_SendDataPoll(M0P_UART0, value);
        }
    }
#else
    UartTestInit(FALSE);
    for (;;) {
        (void)Uart_SendDataPoll(M0P_UART0, 0x55u);
        (void)Uart_SendDataPoll(M0P_UART0, 0xAAu);
    }
#endif
}
#else
#ifndef MOTOR_COMM_ENABLE
#define MOTOR_COMM_ENABLE   (1)
#endif
#ifndef MOTOR_AUTO_SELFTEST
#define MOTOR_AUTO_SELFTEST (0)
#endif

int main(void)
{
    MARK_RESET_RAN    = MARK_MAGIC_RESET;
    MARK_MAIN_ENTERED = MARK_MAGIC_MAIN;
    MARK_BUILD_ID     = (uint32_t)MOTOR_BUILD_ID;

    Motor_Init();
    Monitor_Init();
#if MOTOR_COMM_ENABLE
    Modbus_Init();
#endif
#if MOTOR_AUTO_SELFTEST
    Motor_SelfTestStart();
#endif

    for (;;) {
        Motor_Service();
#if MOTOR_COMM_ENABLE
        Modbus_Poll();
#endif
        Monitor_Poll();

        MARK_STATE          = (uint32_t)Motor_GetRunState();
        MARK_FAULT          = (uint32_t)Motor_GetFault();
        MARK_ISENSE_PEAK    = (uint32_t)Motor_GetIsensePeakCounts();
        MARK_VBUS           = (uint32_t)Motor_GetVbusCounts();
        MARK_ELEC_HZ        = (uint32_t)Motor_GetElectricalHz();
        MARK_STEP_COUNT     = Motor_GetStepCount();
        MARK_TICK_MS        = Motor_GetTickMs();
        MARK_FW_MODE        = (uint32_t)Motor_GetFirmwareMode();
        MARK_BEMF_COUNTS    = (uint32_t)Motor_GetBemfCounts();
        MARK_BEMF_THRESHOLD = (uint32_t)Motor_GetBemfThresholdCounts();
        MARK_ZERO_CROSSES   = Motor_GetZeroCrossCount();
#if MOTOR_COMM_ENABLE
        MARK_COMM_READY     = (uint32_t)Modbus_IsReady();
#else
        MARK_COMM_READY     = 0u;
#endif
    }
}
#endif
