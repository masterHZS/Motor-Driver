/******************************************************************************
 * F072_Bridge - Host Modbus UART <-> motor F072 UART transparent bridge
 *
 * PC / DAPLink UART : UART0 PA9(TX), PA10(RX), 9600-8N1
 * Downstream UART   : UART1 PA2(TX), PA3(RX), 115200-8N1 (full duplex)
 *
 * The bridge deliberately does not parse Modbus. It only forwards bytes in
 * both directions, so the F005 remains the one and only Modbus slave.
 ******************************************************************************/

#include "ddl.h"
#include "gpio.h"
#include "interrupts_hc32f072.h"
#include "sysctrl.h"
#include "uart.h"

#define BRIDGE_RX_SIZE 256u

typedef struct {
    volatile uint16_t head;
    volatile uint16_t tail;
    volatile uint8_t overflow;
    uint8_t data[BRIDGE_RX_SIZE];
} bridge_ring_t;

static bridge_ring_t s_pcToMotor;
static bridge_ring_t s_motorToPc;

static void Bridge_ClkInit(void);
static void Bridge_GpioInit(void);
static void Bridge_UartInit(void);
static void Bridge_RingPush(bridge_ring_t *ring, uint8_t value);
static uint8_t Bridge_RingPop(bridge_ring_t *ring, uint8_t *value);

int32_t main(void)
{
    Bridge_ClkInit();
    Bridge_GpioInit();
    Bridge_UartInit();

    while (1) {
        uint8_t value;

        while (Bridge_RingPop(&s_pcToMotor, &value) != 0u) {
            (void)Uart_SendDataPoll(M0P_UART1, value);
        }

        while (Bridge_RingPop(&s_motorToPc, &value) != 0u) {
            (void)Uart_SendDataPoll(M0P_UART0, value);
        }
    }
}

static void Bridge_ClkInit(void)
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

static void Bridge_GpioInit(void)
{
    stc_gpio_cfg_t gpioCfg;

    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);
    DDL_ZERO_STRUCT(gpioCfg);

    /* UART0 TX: PA9, physical pin 30, header H2-26. */
    gpioCfg.enDir = GpioDirOut;
    gpioCfg.enDrv = GpioDrvH;
    Gpio_Init(GpioPortA, GpioPin9, &gpioCfg);
    Gpio_SetAfMode(GpioPortA, GpioPin9, GpioAf1);

    /* UART0 RX: PA10, physical pin 31, header H2-28. */
    gpioCfg.enDir = GpioDirIn;
    Gpio_Init(GpioPortA, GpioPin10, &gpioCfg);
    Gpio_SetAfMode(GpioPortA, GpioPin10, GpioAf1);

    /* UART1 full-duplex downstream: PA2 TX, PA3 RX, 115200-8N1. */
    gpioCfg.enDir = GpioDirOut;
    gpioCfg.enDrv = GpioDrvH;
    gpioCfg.enOD = GpioOdDisable;
    gpioCfg.enPu = GpioPuDisable;
    gpioCfg.enPd = GpioPdDisable;
    Gpio_Init(GpioPortA, GpioPin2, &gpioCfg);
    Gpio_SetAfMode(GpioPortA, GpioPin2, GpioAf1);

    gpioCfg.enDir = GpioDirIn;
    gpioCfg.enOD = GpioOdDisable;
    gpioCfg.enPu = GpioPuEnable;
    gpioCfg.enPd = GpioPdDisable;
    Gpio_Init(GpioPortA, GpioPin3, &gpioCfg);
    Gpio_SetAfMode(GpioPortA, GpioPin3, GpioAf1);
}

static void Bridge_UartInit(void)
{
    stc_uart_cfg_t uartCfg;

    Sysctrl_SetPeripheralGate(SysctrlPeripheralUart0, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralUart1, TRUE);

    DDL_ZERO_STRUCT(uartCfg);
    uartCfg.enRunMode        = UartMskMode1;
    uartCfg.enMmdorCk        = UartMskDataOrAddr; /* no parity: 8N1 */
    uartCfg.enStopBit        = UartMsk1bit;
    uartCfg.stcBaud.enClkDiv = UartMsk16Or32Div;
    uartCfg.stcBaud.u32Pclk  = Sysctrl_GetPClkFreq();

    uartCfg.stcBaud.u32Baud = 9600u;
    (void)Uart_Init(M0P_UART0, &uartCfg);

    uartCfg.stcBaud.u32Baud = 115200u;
    (void)Uart_Init(M0P_UART1, &uartCfg);

    Uart_ClrStatus(M0P_UART0, UartRC);
    Uart_ClrStatus(M0P_UART0, UartTC);
    Uart_EnableIrq(M0P_UART0, UartRxIrq);
    EnableNvic(UART0_2_IRQn, IrqLevel2, TRUE);

    Uart_ClrStatus(M0P_UART1, UartRC);
    Uart_ClrStatus(M0P_UART1, UartTC);
    Uart_EnableIrq(M0P_UART1, UartRxIrq);
    EnableNvic(UART1_3_IRQn, IrqLevel2, TRUE);
}

static void Bridge_RingPush(bridge_ring_t *ring, uint8_t value)
{
    uint16_t next = (uint16_t)((ring->head + 1u) % BRIDGE_RX_SIZE);

    if (next == ring->tail) {
        /* Keep the newest data and explicitly report a loss. A Modbus CRC
         * catches any damaged frame; the host will retry on its poll timer. */
        ring->tail = (uint16_t)((ring->tail + 1u) % BRIDGE_RX_SIZE);
        ring->overflow = 1u;
    }

    ring->data[ring->head] = value;
    ring->head = next;
}

static uint8_t Bridge_RingPop(bridge_ring_t *ring, uint8_t *value)
{
    if (ring->tail == ring->head) {
        return 0u;
    }

    *value = ring->data[ring->tail];
    ring->tail = (uint16_t)((ring->tail + 1u) % BRIDGE_RX_SIZE);
    return 1u;
}

void Uart0_IRQHandler(void)
{
    if (Uart_GetStatus(M0P_UART0, UartRC)) {
        uint8_t value = Uart_ReceiveData(M0P_UART0);
        Uart_ClrStatus(M0P_UART0, UartRC);
        Bridge_RingPush(&s_pcToMotor, value);
    }
}

void Uart1_IRQHandler(void)
{
    if (Uart_GetStatus(M0P_UART1, UartRC)) {
        uint8_t value = Uart_ReceiveData(M0P_UART1);
        Uart_ClrStatus(M0P_UART1, UartRC);
        Bridge_RingPush(&s_motorToPc, value);
    }
}

/******************************************************************************
 * EOF
 ******************************************************************************/





