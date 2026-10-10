#ifndef APP_I2C_H
#define APP_I2C_H

#include "ddl.h"
#include "i2c.h"       /* DDL 的 I2C 驱动（stc_i2c_cfg_t / I2C_Init 等）*/
#include <stdint.h>

/* 对应原 Core/Inc/i2c.h
 * 注意: 本文件名加了 app_ 前缀，因为 DDL 自己也有 drivers/inc/i2c.h */
void MX_I2C1_Init(void);   /* 保留原名以便对照；实现里用的是 F072 的 I2C0 */
void MX_I2C0_Init(void);

en_result_t I2C_MasterWrite(uint8_t slave_addr, const uint8_t *buf, uint32_t len);
en_result_t I2C_MasterRead(uint8_t slave_addr, uint8_t reg_addr,
                           uint8_t *buf, uint32_t len);

#endif /* APP_I2C_H */
