/**
  ******************************************************************************
  * @file    i2c.c
  * @brief   I2C0 主机驱动（DDL 状态机版）—— 替代原 STM32F103 的 I2C1
  *
  * 【差异说明】
  *   F103 用 HAL_I2C_Master_Transmit_DMA + 传输完成中断 + 信号量，
  *   由 DMA 搬 132 字节的 SH1106 帧。
  *   HC32F072 的 I2C 没有 DMA 请求，DDL 也只给到"读写一个字节"的粒度，
  *   所以这里实现一个阻塞式的主机发送/接收，用 SI 标志位逐字节推进。
  *
  *   代价：一帧 1024 字节（8 页 x 128）按 100kHz 算约 90ms，
  *   而 DisplayTask 是【最低优先级】且从不主动 delay（与原工程一致），
  *   所以它只在 ADC/Control/Button 都空闲时才刷屏，不会影响控制环。
  *   如果想更快，把 BOARD_I2C_BAUD 提到 400000 并确认屏支持。
  ******************************************************************************
  */

#include "app_i2c.h"
#include "board.h"
#include "sysctrl.h"    /* Sysctrl_SetPeripheralGate */
#include "app_tim.h"    /* Error_Handler 声明 */

#define I2C_TIMEOUT_LOOPS   (200000u)

/* ==========================================================================
 * 初始化
 * ========================================================================== */
void MX_I2C0_Init(void)
{
    stc_i2c_cfg_t  stcI2cCfg;
    stc_gpio_cfg_t stcGpio;

    Sysctrl_SetPeripheralGate(SysctrlPeripheralI2c0, TRUE);
    Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE);

    /* --- 引脚：PB6 = SCL, PB7 = SDA, 都要开漏 + 上拉 --- */
    DDL_ZERO_STRUCT(stcGpio);
    stcGpio.enDir = GpioDirOut;
    stcGpio.enDrv = GpioDrvH;
    stcGpio.enOD  = GpioOdEnable;       /* I2C 必须开漏 */
    stcGpio.enPu  = GpioPuEnable;       /* 内部弱上拉，外部再并 4.7k 更稳 */
    stcGpio.enPd  = GpioPdDisable;

    (void)Gpio_Init(BOARD_I2C_SCL_PORT, BOARD_I2C_SCL_PIN, &stcGpio);
    (void)Gpio_SetAfMode(BOARD_I2C_SCL_PORT, BOARD_I2C_SCL_PIN, BOARD_I2C_SCL_AF);
    (void)Gpio_Init(BOARD_I2C_SDA_PORT, BOARD_I2C_SDA_PIN, &stcGpio);
    (void)Gpio_SetAfMode(BOARD_I2C_SDA_PORT, BOARD_I2C_SDA_PIN, BOARD_I2C_SDA_AF);

    /* --- 模块配置：主机模式 --- */
    DDL_ZERO_STRUCT(stcI2cCfg);
    stcI2cCfg.u32Pclk     = Sysctrl_GetPClkFreq();
    stcI2cCfg.u32Baud     = BOARD_I2C_BAUD;
    stcI2cCfg.enMode      = I2cMasterMode;
    stcI2cCfg.u8SlaveAddr = 0u;
    stcI2cCfg.bGc         = FALSE;
    if (I2C_Init(BOARD_I2C_PORT, &stcI2cCfg) != Ok) {
        Error_Handler();
    }
}

/* ==========================================================================
 * 底层：等 SI 标志
 * ========================================================================== */
static en_result_t i2c_wait_si(void)
{
    uint32_t guard = I2C_TIMEOUT_LOOPS;

    while (I2C_GetIrq(BOARD_I2C_PORT) == FALSE) {
        if (--guard == 0u) {
            return ErrorTimeout;
        }
    }
    return Ok;
}

/**
 * 主机发送：先发从机地址(写)，再发 len 个字节，最后发停止位。
 * 对应原工程 HAL_I2C_Master_Transmit_DMA(hi2c1, addr, buf, len)
 */
en_result_t I2C_MasterWrite(uint8_t slave_addr, const uint8_t *buf, uint32_t len)
{
    uint32_t i;

    /* 起始条件 + 模块使能 */
    I2C_SetFunc(BOARD_I2C_PORT, I2cStart_En);

    /* 地址字节（写方向，bit0 = 0）*/
    (void)I2C_WriteByte(BOARD_I2C_PORT, (uint8_t)((slave_addr << 1) & 0xFEu));
    if (i2c_wait_si() != Ok) {
        goto abort;
    }
    /* 从机 ACK 检查：状态寄存器低 3 位 000 = ACK 收到 */
    if ((I2C_GetState(BOARD_I2C_PORT) & 0x07u) != 0x00u) {
        goto abort;
    }
    I2C_ClearIrq(BOARD_I2C_PORT);

    /* 数据字节 */
    for (i = 0u; i < len; i++) {
        (void)I2C_WriteByte(BOARD_I2C_PORT, buf[i]);
        if (i2c_wait_si() != Ok) {
            goto abort;
        }
        I2C_ClearIrq(BOARD_I2C_PORT);
    }

    /* 停止条件 */
    I2C_ClearFunc(BOARD_I2C_PORT, I2cStart_En);
    I2C_SetFunc(BOARD_I2C_PORT, I2cStop_En);
    I2C_ClearIrq(BOARD_I2C_PORT);

    return Ok;

abort:
    I2C_ClearFunc(BOARD_I2C_PORT, I2cStart_En);
    I2C_SetFunc(BOARD_I2C_PORT, I2cStop_En);
    I2C_ClearIrq(BOARD_I2C_PORT);
    return ErrorTimeout;
}

/**
 * 主机接收：地址(写) -> 寄存器地址 -> 重启 -> 地址(读) -> 读 len 字节
 * 预留给 EEPROM / 传感器，本工程 OLED 只写不读。
 */
en_result_t I2C_MasterRead(uint8_t slave_addr, uint8_t reg_addr,
                           uint8_t *buf, uint32_t len)
{
    uint32_t i;

    /* 先写寄存器地址 */
    I2C_SetFunc(BOARD_I2C_PORT, I2cStart_En);
    (void)I2C_WriteByte(BOARD_I2C_PORT, (uint8_t)((slave_addr << 1) & 0xFEu));
    if (i2c_wait_si() != Ok) {
        goto abort;
    }
    I2C_ClearIrq(BOARD_I2C_PORT);
    (void)I2C_WriteByte(BOARD_I2C_PORT, reg_addr);
    if (i2c_wait_si() != Ok) {
        goto abort;
    }
    I2C_ClearIrq(BOARD_I2C_PORT);

    /* 重启 + 读方向 */
    I2C_SetFunc(BOARD_I2C_PORT, I2cStart_En);
    (void)I2C_WriteByte(BOARD_I2C_PORT, (uint8_t)(((slave_addr << 1) & 0xFEu) | 1u));
    if (i2c_wait_si() != Ok) {
        goto abort;
    }
    I2C_ClearIrq(BOARD_I2C_PORT);

    for (i = 0u; i < len; i++) {
        if (i == (len - 1u)) {
            I2C_ClearFunc(BOARD_I2C_PORT, I2cAck_En);   /* 最后一字节 NACK */
        } else {
            I2C_SetFunc(BOARD_I2C_PORT, I2cAck_En);
        }
        if (i2c_wait_si() != Ok) {
            goto abort;
        }
        buf[i] = I2C_ReadByte(BOARD_I2C_PORT);
        I2C_ClearIrq(BOARD_I2C_PORT);
    }

    I2C_ClearFunc(BOARD_I2C_PORT, I2cStart_En);
    I2C_SetFunc(BOARD_I2C_PORT, I2cStop_En);
    I2C_ClearIrq(BOARD_I2C_PORT);
    return Ok;

abort:
    I2C_ClearFunc(BOARD_I2C_PORT, I2cStart_En);
    I2C_SetFunc(BOARD_I2C_PORT, I2cStop_En);
    I2C_ClearIrq(BOARD_I2C_PORT);
    return ErrorTimeout;
}

/******************************************************************************
 * EOF
 ******************************************************************************/
