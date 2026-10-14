/******************************************************************************
 * modbus_slave.c - HostSoftware-compatible Modbus-RTU slave for HC32F005
 *
 * Link: UART0, P14(TXD)/P27(RXD) at 9600-8N1, slave address 1.
 *
 * SAFETY / PROGRAMMING WINDOW
 * --------------------------
 * P27 is SWDIO and P31 is SWCLK.  UART0 uses the dedicated P14/TP6 as TX and
 * reuses P27/TP3 as RX, so SWCLK does not share the single-wire data line.
 * P27/P31 are left untouched for MODBUS_SWD_RELEASE_MS after reset so pyOCD/ISP
 * can attach and flash a replacement image; only then is SWD_USE_IO released
 * and P27 switched to UART0_RXD AF5.
 *
 * Supported: FC03 read holding registers, FC06 write single register.
 ******************************************************************************/

#include "modbus_slave.h"

#include "bt.h"
#include "gpio.h"
#include "interrupts_hc32f005.h"
#include "monitor.h"
#include "motor.h"
#include "sysctrl.h"
#include "uart.h"

#define MODBUS_SLAVE_ADDR        (1u)
#define MODBUS_RX_SIZE           (256u)
#define MODBUS_FRAME_GAP_MS      (4u)       /* > 3.5 chars at 9600 8N1 */
#ifndef MODBUS_UART_BAUD
#define MODBUS_UART_BAUD         (9600u)    /* direct HostSoftware link */
#endif

#ifndef MODBUS_SWD_RELEASE_MS
#define MODBUS_SWD_RELEASE_MS    (10000u) /* 用户2026-10-14明确批准 */
#endif

static volatile uint16_t s_rxHead;
static volatile uint16_t s_rxTail;
static uint8_t s_rxRing[MODBUS_RX_SIZE];
static uint8_t s_frame[MODBUS_RX_SIZE];
static uint16_t s_frameLen;
static uint32_t s_lastByteTick;
static uint32_t s_releaseTick;
static boolean_t s_ready;
static uint8_t s_txFrame[27];
static uint16_t s_txLength;
static uint16_t s_txIndex;
static boolean_t s_txInFlight;

static uint16_t Modbus_Crc16(const uint8_t *data, uint16_t length);
static void Modbus_UartInit(void);
static void Modbus_PushRx(uint8_t value);
static uint8_t Modbus_PopRx(uint8_t *value);
static void Modbus_ProcessFrame(void);
static void Modbus_SendException(uint8_t function, uint8_t exceptionCode);
static void __attribute__((noinline)) Modbus_SendResponse(const uint8_t *data, uint16_t length);
static void Modbus_InvalidCommandFault(void);
static void __attribute__((noinline)) Modbus_TxService(void);

void Modbus_Init(void)
{
    s_rxHead = 0u;
    s_rxTail = 0u;
    s_frameLen = 0u;
    s_lastByteTick = Motor_GetTickMs();
    s_releaseTick = s_lastByteTick + MODBUS_SWD_RELEASE_MS;
    s_ready = FALSE;
    s_txLength = s_txIndex = 0u;
    s_txInFlight = FALSE;
}

boolean_t Modbus_IsReady(void)
{
    return s_ready;
}

void Modbus_Poll(void)
{
    uint8_t value;
    uint32_t now;

    if (s_ready == FALSE) {
        if ((int32_t)(Motor_GetTickMs() - s_releaseTick) < 0) {
            return;
        }
        Modbus_UartInit();
        s_ready = TRUE;
        return;
    }

    now = Motor_GetTickMs();
    Modbus_TxService();
    while (Modbus_PopRx(&value) != 0u) {
        if (s_frameLen < MODBUS_RX_SIZE) {
            s_frame[s_frameLen++] = value;
        } else {
            s_frameLen = 0u;
            Motor_RecordCommError();
        }
        s_lastByteTick = now;
    }

    now = Motor_GetTickMs();
    if ((s_frameLen != 0u) && ((now - s_lastByteTick) >= MODBUS_FRAME_GAP_MS)) {
        Modbus_ProcessFrame();
        s_frameLen = 0u;
    }
}

static void Modbus_UartInit(void)
{
    stc_gpio_cfg_t gpioCfg;
    stc_uart_baud_cfg_t baudCfg;
    stc_uart_cfg_t uartCfg;
    stc_bt_cfg_t btCfg;
    uint16_t timerValue;

    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralBt, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralUart0, TRUE);

    /* Release the debug pins only after the programming window.  This is
     * irreversible until the next reset, which is the intended boot behavior. */
    Sysctrl_SetFunc(SysctrlSWDUseIOEn, TRUE);

    DDL_ZERO_STRUCT(gpioCfg);
    gpioCfg.bOutputVal = FALSE;
    gpioCfg.enDrv = GpioDrvH;
    gpioCfg.enPu  = GpioPuEnable;
    gpioCfg.enPd  = GpioPdDisable;

    gpioCfg.enDir = GpioDirIn;
    gpioCfg.enOD  = GpioOdDisable;
    (void)Gpio_Init(GpioPort2, GpioPin7, &gpioCfg);  /* P27 / UART0_RXD */
    (void)Gpio_SetAfMode(GpioPort2, GpioPin7, GpioAf5);

    gpioCfg.bOutputVal = TRUE;
    gpioCfg.enDir = GpioDirOut;
    gpioCfg.enOD  = GpioOdDisable;                    /* two-wire push-pull */
    gpioCfg.enPu  = GpioPuDisable;
    (void)Gpio_Init(GpioPort1, GpioPin4, &gpioCfg);  /* P14 / TP6 / UART0_TXD */
    (void)Gpio_SetAfMode(GpioPort1, GpioPin4, GpioAf6);

    DDL_ZERO_STRUCT(baudCfg);
    baudCfg.enMode  = UartMode1;
    baudCfg.bDbaud  = TRUE;                          /* 0.16% error at 24MHz */
    baudCfg.u32Pclk = Sysctrl_GetPClkFreq();
    baudCfg.u32Baud = MODBUS_UART_BAUD;
    timerValue = Uart_SetBaudRate(M0P_UART0, &baudCfg);

    DDL_ZERO_STRUCT(btCfg);
    btCfg.enMD  = BtMode2;
    btCfg.enCT  = BtTimer;
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
    Uart_EnableIrq(M0P_UART0, UartRxIrq);
    EnableNvic(UART0_IRQn, IrqLevel2, TRUE);
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
        return;
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

        if ((count == 0u) || (count > 10u) || (address > 9u) ||
            ((uint32_t)address + count > 10u)) {
            Modbus_InvalidCommandFault();
            Modbus_SendException(function, 0x02u);
            return;
        }

        response[0] = MODBUS_SLAVE_ADDR;
        response[1] = function;
        response[2] = (uint8_t)(count * 2u);
        for (i = 0u; i < count; i++) {
            value = Monitor_GetRegister((uint16_t)(address + i));
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
                Motor_SetCommRequired(TRUE);
                Motor_CommHeartbeat();
                Motor_CommandStart();
            } else {
                Motor_CommandStop();
                Motor_SetCommRequired(FALSE);
            }
        } else if (address == 0x0002u) {
            if (value > 100u) {
                Modbus_InvalidCommandFault();
                Modbus_SendException(function, 0x03u);
                return;
            }
            Motor_SetCommRequired(TRUE);
            Motor_CommHeartbeat();
            Motor_SetThrottle(value);
        } else if (address == 0x0003u) {
            if (Motor_SetPwmFrequency(value) == FALSE) {
                Modbus_InvalidCommandFault();
                Modbus_SendException(function, 0x03u);
                return;
            }
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

    if (s_txLength != 0u || length > sizeof(s_txFrame) - 2u) {
        Motor_RecordCommError();
        return;
    }
    for (i = 0u; i < length; i++) { s_txFrame[i] = data[i]; }
    s_txFrame[length] = (uint8_t)crc;
    s_txFrame[length + 1u] = (uint8_t)(crc >> 8);
    s_txIndex = 0u;
    s_txLength = length + 2u;
    Modbus_TxService();
}

static void Modbus_TxService(void)
{
    if (s_txLength == 0u) { return; }
    if (s_txInFlight) {
        if (!Uart_GetStatus(M0P_UART0, UartTC)) { return; }
        Uart_ClrStatus(M0P_UART0, UartTC);
        s_txInFlight = FALSE;
    }
    if (s_txIndex == s_txLength) {
        s_txLength = s_txIndex = 0u;
        return;
    }
    Uart_ClrStatus(M0P_UART0, UartTC);
    M0P_UART0->SBUF = s_txFrame[s_txIndex++];
    s_txInFlight = TRUE;
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

void Uart0_IRQHandler(void)
{
    if (Uart_GetStatus(M0P_UART0, UartRC)) {
        uint8_t value = Uart_ReceiveData(M0P_UART0);
        Uart_ClrStatus(M0P_UART0, UartRC);
        if (s_ready != FALSE) {
            Modbus_PushRx(value);
        }
    }
}

/******************************************************************************
 * EOF
 ******************************************************************************/
