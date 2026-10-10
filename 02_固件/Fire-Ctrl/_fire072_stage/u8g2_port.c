/**
  ******************************************************************************
  * @file    u8g2_port.c
  * @brief   u8g2 的硬件适配层 —— 替代原 Core/Src/u8g2_port.c
  *
  * 【原实现】把一帧数据攒到 132 字节缓冲，用 HAL_I2C_Master_Transmit_DMA
  *           发出，然后 osSemaphoreAcquire 等 DMA 完成中断。
  * 【F072】I2C0 没有 DMA 请求，改为直接调用阻塞式 I2C_MasterWrite()，
  *          不再需要 i2cTxSem 信号量。帧缓冲仍然保留（u8g2 是分多次
  *          U8X8_MSG_BYTE_SEND 交数据的）。
  *
  * SH1106 的 I2C 帧格式：0x00 控制字节（命令） + 数据字节。
  * u8g2 的 sh1106_i2c 驱动已经按 128 字节一页切分，所以这里只需
  * 保证缓冲足够大：128 数据 + 1 控制 + 余量 = 132。
  ******************************************************************************
  */

#include "u8g2.h"
#include "app_i2c.h"
#include "board.h"
#include "os_api.h"

#define U8G2_I2C_BUF_SIZE   132u

static uint8_t u8g2_i2c_buffer[U8G2_I2C_BUF_SIZE];
static uint8_t u8g2_buffer_ptr;

uint8_t u8x8_byte_f072_hw_i2c(u8x8_t *u8x8, uint8_t msg, uint8_t arg_int,
                              void *arg_ptr)
{
    switch (msg) {
        case U8X8_MSG_BYTE_SEND: {
            uint8_t *data = (uint8_t *)arg_ptr;
            while (arg_int > 0) {
                if (u8g2_buffer_ptr >= U8G2_I2C_BUF_SIZE) {
                    break;              /* 防御：绝不越界 */
                }
                u8g2_i2c_buffer[u8g2_buffer_ptr++] = *data++;
                arg_int--;
            }
            break;
        }
        case U8X8_MSG_BYTE_INIT:
            /* I2C 已在 MX_I2C0_Init() 里初始化 */
            break;
        case U8X8_MSG_BYTE_SET_DC:
            /* I2C 模式不使用 DC 脚 */
            break;
        case U8X8_MSG_BYTE_START_TRANSFER:
            u8g2_buffer_ptr = 0;
            break;
        case U8X8_MSG_BYTE_END_TRANSFER: {
            uint8_t addr7 = (uint8_t)(u8x8_GetI2CAddress(u8x8) >> 1);
            if (I2C_MasterWrite(addr7, u8g2_i2c_buffer, u8g2_buffer_ptr) != Ok) {
                return 0;
            }
            break;
        }
        default:
            return 0;
    }
    return 1;
}

uint8_t u8x8_gpio_and_delay_f072(u8x8_t *u8x8, uint8_t msg, uint8_t arg_int,
                                 void *arg_ptr)
{
    (void)u8x8;
    (void)arg_ptr;

    switch (msg) {
        case U8X8_MSG_DELAY_MILLI:
            osDelay(arg_int);
            break;
        case U8X8_MSG_DELAY_10MICRO:
            /* 24MHz 下一轮循环约 10 个周期，用空循环凑够 10us */
            {
                volatile uint32_t n = (arg_int == 0u) ? 24u : (uint32_t)arg_int * 24u;
                while (n-- != 0u) {
                }
            }
            break;
        case U8X8_MSG_DELAY_100NANO:
            {
                volatile uint32_t n = 3u;
                while (n-- != 0u) {
                }
            }
            break;
        case U8X8_MSG_GPIO_AND_DELAY_INIT:
            break;
        default:
            return 0;
    }
    return 1;
}

/******************************************************************************
 * EOF
 ******************************************************************************/
