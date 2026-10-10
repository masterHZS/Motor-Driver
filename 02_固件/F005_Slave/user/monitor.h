#ifndef F005_MONITOR_H
#define F005_MONITOR_H

#include "ddl.h"

typedef struct {
    uint16_t state;
    uint16_t fault;
    uint16_t throttlePercent;
    uint16_t actualDutyPercent;
    uint16_t electricalHz;
    uint16_t pwmFrequencyHz;
    uint16_t firmwareVersion;
    uint16_t commOkCount;
    uint16_t commErrCount;
    uint16_t vbusCounts;
    uint16_t vbusMilliVolts;
    uint16_t isensePeakCounts;
    uint16_t isenseMilliAmps;
    uint16_t bemfCounts;
    uint16_t bemfThresholdCounts;
    uint32_t tickMs;
    uint32_t stepCount;
    uint32_t zeroCrossCount;
    uint8_t  mode;
} monitor_snapshot_t;

void Monitor_Init(void);
void Monitor_Poll(void);
const monitor_snapshot_t *Monitor_GetSnapshot(void);
uint16_t Monitor_GetRegister(uint16_t address);

#endif /* F005_MONITOR_H */
