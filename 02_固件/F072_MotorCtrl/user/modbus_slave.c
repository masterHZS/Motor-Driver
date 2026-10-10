/******************************************************************************
 * modbus_slave.c - minimal Modbus-RTU slave compatible with HostSoftware
 *
 * UART: direct mode = UART0 PA9(TX) / PA10(RX), 9600-8N1;
 *       cascade mode = UART1 PA2 half-duplex, 115200-8N1.
 * Supported: FC03 read holding registers, FC06 write single register.
 ******************************************************************************/

#include "modbus_slave.h"

#include "gpio.h"
#include "interrupts_hc32f072.h"
#include "motor.h"
#include "sysctrl.h"
#include "uart.h"

#define MODBUS_SLAVE_ADDR    (1u)
#define MODBUS_RX_SIZE       (256u)
#define MODBUS_FRAME_GAP_MS  (2u)

#ifndef MOTOR_DIRECT_UART
#define MOTOR_DIRECT_UART    (0)
#endif
#ifndef MOTOR_DIRECT_BAUD
#define MOTOR_DIRECT_BAUD    (9600u)
#endif

#if MOTOR_DIRECT_UART
#define MODBUS_UART          M0P_UART0
#define MODBUS_UART_BAUD     MOTOR_DIRECT_BAUD
#define MODBUS_UART_IRQHANDLER Uart0_IRQHandler
#else
#define MODBUS_UART          M0P_UART1
#define MODBUS_UART_BAUD     (115200u)
#define MODBUS_UART_IRQHANDLER Uart1_IRQHandler
#endif

static volatile uint16_t s_rxHead;
static volatile uint16_t s_rxTail;
static uint8_t s_rxRing[MODBUS_RX_SIZE];
static uint8_t s_frame[MODBUS_RX_SIZE];
static uint16_t s_frameLen;
static uint32_t s_lastByteTick;

static uint16_t Modbus_Crc16(const uint8_t *data, uint16_t length);
static void Modbus_UartInit(void);
static void Modbus_PushRx(uint8_t value);
static uint8_t Modbus_PopRx(uint8_t *value);
static void Modbus_ProcessFrame(void);
static void Modbus_SendException(uint8_t function, uint8_t exceptionCode);
static void Modbus_SendResponse(const uint8_t *data, uint16_t length);
static uint16_t Modbus_ReadRegister(uint16_t address);
static void Modbus_InvalidCommandFault(void);

void Modbus_Init(void)
{
    s_rxHead = 0u;
    s_rxTail = 0u;
    s_frameLen = 0u;
    s_lastByteTick = Motor_GetTickMs();
    Modbus_UartInit();
}

void Modbus_Poll(void)
{
    uint8_t value;
    uint32_t now;

    while (Modbus_PopRx(&value) != 0u) {
        if (s_frameLen < MODBUS_RX_SIZE) {
            s_frame[s_frameLen++] = value;
        } else {
            s_frameLen = 0u;
            Motor_RecordCommError();
        }
        s_lastByteTick = Motor_GetTickMs();
    }

    now = Motor_GetTickMs();
    if (s_frameLen != 0u && (now - s_lastByteTick) >= MODBUS_FRAME_GAP_MS) {
        Modbus_ProcessFrame();
        s_frameLen = 0u;
    }
}

static void Modbus_UartInit(void)
{
    stc_gpio_cfg_t gpioCfg;
    stc_uart_cfg_t uartCfg;

    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);

#if MOTOR_DIRECT_UART
    Sysctrl_SetPeripheralGate(SysctrlPeripheralUart0, TRUE);

    /* UART0 TX: PA9, RX: PA10, full-duplex 8N1. */
    DDL_ZERO_STRUCT(gpioCfg);
    gpioCfg.enDir = GpioDirOut;
    gpioCfg.enDrv = GpioDrvH;
    gpioCfg.enOD = GpioOdDisable;
    gpioCfg.enPu = GpioPuDisable;
    gpioCfg.enPd = GpioPdDisable;
    (void)Gpio_Init(GpioPortA, GpioPin9, &gpioCfg);
    Gpio_SetAfMode(GpioPortA, GpioPin9, GpioAf1);

    gpioCfg.enDir = GpioDirIn;
    gpioCfg.enPu = GpioPuEnable;
    (void)Gpio_Init(GpioPortA, GpioPin10, &gpioCfg);
    Gpio_SetAfMode(GpioPortA, GpioPin10, GpioAf1);

    DDL_ZERO_STRUCT(uartCfg);
    uartCfg.enRunMode = UartMskMode1;
    uartCfg.enMmdorCk = UartMskDataOrAddr; /* no parity: 8N1 */
    uartCfg.enStopBit = UartMsk1bit;
    uartCfg.stcBaud.enClkDiv = UartMsk16Or32Div;
    uartCfg.stcBaud.u32Pclk = Sysctrl_GetPClkFreq();
    uartCfg.stcBaud.u32Baud = MODBUS_UART_BAUD;
    (void)Uart_Init(M0P_UART0, &uartCfg);

    Uart_ClrStatus(M0P_UART0, UartRC);
    Uart_ClrStatus(M0P_UART0, UartTC);
    Uart_EnableIrq(M0P_UART0, UartRxIrq);
    EnableNvic(UART0_2_IRQn, IrqLevel2, TRUE);
#else
    Sysctrl_SetPeripheralGate(SysctrlPeripheralUart1, TRUE);

    DDL_ZERO_STRUCT(gpioCfg);
    gpioCfg.enDir = GpioDirOut;
    gpioCfg.enDrv = GpioDrvH;
    gpioCfg.enOD = GpioOdEnable;
    gpioCfg.enPu = GpioPuEnable;
    gpioCfg.enPd = GpioPdDisable;
    (void)Gpio_Init(GpioPortA, GpioPin2, &gpioCfg);
    Gpio_SetAfMode(GpioPortA, GpioPin2, GpioAf1); /* PA2 UART1 half-duplex */

    DDL_ZERO_STRUCT(uartCfg);
    uartCfg.enRunMode = UartMskMode1;
    uartCfg.enMmdorCk = UartMskDataOrAddr; /* no parity: 8N1 */
    uartCfg.enStopBit = UartMsk1bit;
    uartCfg.stcBaud.enClkDiv = UartMsk16Or32Div;
    uartCfg.stcBaud.u32Pclk = Sysctrl_GetPClkFreq();
    uartCfg.stcBaud.u32Baud = MODBUS_UART_BAUD;
    (void)Uart_Init(M0P_UART1, &uartCfg);
    Uart_HdModeEnable(M0P_UART1);

    Uart_ClrStatus(M0P_UART1, UartRC);
    Uart_ClrStatus(M0P_UART1, UartTC);
    Uart_EnableIrq(M0P_UART1, UartRxIrq);
    EnableNvic(UART1_3_IRQn, IrqLevel2, TRUE);
#endif
}

static void Modbus_PushRx(uint8_t value)
{
    uint16_t next = (uint16_t)((s_rxHead + 1u) % MODBUS_RX_SIZE);

    if (next == s_rxTail) {
        s_rxTail = (uint16_t)((s_rxTail + 1u) % MODBUS_RX_SIZE);
        Motor_RecordCommError();
    }
    s_rxRing[s_rxHead] = value;
    s_rxHead = next;
}

static uint8_t Modbus_PopRx(uint8_t *value)
{
    if (s_rxHead == s_rxTail) {
        return 0u;
    }
    *value = s_rxRing[s_rxTail];
    s_rxTail = (uint16_t)((s_rxTail + 1u) % MODBUS_RX_SIZE);
    return 1u;
}

static void Modbus_ProcessFrame(void)
{
    uint16_t crcCalc;
    uint16_t crcRx;
    uint8_t function;
    uint16_t address;
    uint16_t value;
    uint16_t count;
    uint16_t i;
    uint8_t response[25];

    if (s_frameLen < 4u) {
        Motor_RecordCommError();
        return;
    }

    crcRx = (uint16_t)s_frame[s_frameLen - 2u]
          | ((uint16_t)s_frame[s_frameLen - 1u] << 8);
    crcCalc = Modbus_Crc16(s_frame, (uint16_t)(s_frameLen - 2u));
    if (crcCalc != crcRx) {
        Motor_RecordCommError();
        return;
    }

    if (s_frame[0] != MODBUS_SLAVE_ADDR) {
        return; /* another slave on the bus: stay silent */
    }

    Motor_RecordCommOk();
    Motor_CommHeartbeat();
    function = s_frame[1];

    if (function == 0x03u) {
        if (s_frameLen != 8u) {
            Modbus_InvalidCommandFault();
            Modbus_SendException(function, 0x03u);
            return;
        }
        address = ((uint16_t)s_frame[2] << 8) | s_frame[3];
        count = ((uint16_t)s_frame[4] << 8) | s_frame[5];

        if (count == 0u || count > 10u || address > 9u || (uint32_t)address + count > 10u) {
            Modbus_InvalidCommandFault();
            Modbus_SendException(function, 0x02u);
            return;
        }

        response[0] = MODBUS_SLAVE_ADDR;
        response[1] = function;
        response[2] = (uint8_t)(count * 2u);
        for (i = 0u; i < count; i++) {
            value = Modbus_ReadRegister((uint16_t)(address + i));
            response[3u + i * 2u] = (uint8_t)(value >> 8);
            response[4u + i * 2u] = (uint8_t)(value & 0xFFu);
        }
        Modbus_SendResponse(response, (uint16_t)(3u + count * 2u));
        return;
    }

    if (function == 0x06u) {
        if (s_frameLen != 8u) {
            Modbus_InvalidCommandFault();
            Modbus_SendException(function, 0x03u);
            return;
        }
        address = ((uint16_t)s_frame[2] << 8) | s_frame[3];
        value = ((uint16_t)s_frame[4] << 8) | s_frame[5];

        if (address == 0x0001u) {
            if (value > 1u) {
                Modbus_InvalidCommandFault();
                Modbus_SendException(function, 0x03u);
                return;
            }
            if (value == 1u) {
                Motor_CommandStart();
            } else {
                Motor_CommandStop();
            }
        } else if (address == 0x0002u) {
            if (value > 100u) {
                Modbus_InvalidCommandFault();
                Modbus_SendException(function, 0x03u);
                return;
            }
            Motor_SetThrottle(value);
        } else if (address == 0x0003u) {
            if (value < 1000u || value > 20000u) {
                Modbus_InvalidCommandFault();
                Modbus_SendException(function, 0x03u);
                return;
            }
            Motor_SetPwmFrequency(value);
        } else {
            Modbus_InvalidCommandFault();
            Modbus_SendException(function, 0x02u);
            return;
        }

        Modbus_SendResponse(s_frame, 6u);
        return;
    }

    Modbus_InvalidCommandFault();
    Modbus_SendException(function, 0x01u);
}

static uint16_t Modbus_ReadRegister(uint16_t address)
{
    switch (address) {
    case 0x0000u: return Motor_GetRunState();
    case 0x0001u: return Motor_GetStartRequest();
    case 0x0002u: return Motor_GetThrottlePercent();
    case 0x0003u: return Motor_GetPwmFrequency();
    case 0x0004u: return Motor_GetActualDuty();
    case 0x0005u: return Motor_GetFault();
    case 0x0006u: return Motor_GetElectricalHz();
    case 0x0007u: return MOTOR_FW_VERSION;
    case 0x0008u: return Motor_GetCommErrCount();
    case 0x0009u: return Motor_GetCommOkCount();
    default:      return 0u;
    }
}

static void Modbus_InvalidCommandFault(void)
{
    Motor_RecordCommError();
    Motor_SetFault(0x0001u);
}

static void Modbus_SendException(uint8_t function, uint8_t exceptionCode)
{
    uint8_t response[5];

    response[0] = MODBUS_SLAVE_ADDR;
    response[1] = (uint8_t)(function | 0x80u);
    response[2] = exceptionCode;
    Modbus_SendResponse(response, 3u);
}

static void Modbus_SendResponse(const uint8_t *data, uint16_t length)
{
    uint16_t i;
    uint16_t crc = Modbus_Crc16(data, length);
    uint8_t byteValue;

    for (i = 0u; i < length; i++) {
        (void)Uart_SendDataPoll(MODBUS_UART, data[i]);
    }
    byteValue = (uint8_t)(crc & 0xFFu);
    (void)Uart_SendDataPoll(MODBUS_UART, byteValue);
    byteValue = (uint8_t)(crc >> 8);
    (void)Uart_SendDataPoll(MODBUS_UART, byteValue);
}

static uint16_t Modbus_Crc16(const uint8_t *data, uint16_t length)
{
    uint16_t crc = 0xFFFFu;
    uint16_t i;
    uint8_t bit;

    for (i = 0u; i < length; i++) {
        crc ^= data[i];
        for (bit = 0u; bit < 8u; bit++) {
            if ((crc & 1u) != 0u) {
                crc = (uint16_t)((crc >> 1) ^ 0xA001u);
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

void MODBUS_UART_IRQHANDLER(void)
{
    if (Uart_GetStatus(MODBUS_UART, UartRC)) {
        uint8_t value = Uart_ReceiveData(MODBUS_UART);
        Uart_ClrStatus(MODBUS_UART, UartRC);
        Modbus_PushRx(value);
    }
}


/******************************************************************************
 * EOF
 ******************************************************************************/
