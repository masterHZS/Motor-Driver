#ifndef F005_MODBUS_SLAVE_H
#define F005_MODBUS_SLAVE_H

#include "ddl.h"

void Modbus_Init(void);
void Modbus_Poll(void);
boolean_t Modbus_IsReady(void);

#endif /* F005_MODBUS_SLAVE_H */
