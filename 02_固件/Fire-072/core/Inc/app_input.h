#ifndef INPUT_H
#define INPUT_H

#include "app_shared_data.h"

/* 对应原 Core/Inc/input.h */
void Input_Init(void);
void Input_HandleEvent(BtnEvent_t *evt);
void Input_PeriodicTask(void);

#endif /* INPUT_H */
