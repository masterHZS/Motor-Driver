/******************************************************************************
 * monitor.c - periodic MCU/motor telemetry snapshot for HostSoftware
 *
 * The Modbus layer reads the same snapshot; no UART or power-stage side
 * effects are performed here.
 ******************************************************************************/

#include "monitor.h"
#include "motor.h"

static monitor_snapshot_t s_snapshot;
static uint32_t s_lastUpdateTick;

void Monitor_Init(void)
{
    s_lastUpdateTick = 0u;
    Monitor_Poll();
}

void Monitor_Poll(void)
{
    uint32_t now = Motor_GetTickMs();

    if ((now - s_lastUpdateTick) < 100u) {
        return;
    }
    s_lastUpdateTick = now;

    s_snapshot.state              = Motor_GetRunState();
    s_snapshot.fault              = Motor_GetFault();
    s_snapshot.throttlePercent    = Motor_GetThrottlePercent();
    s_snapshot.actualDutyPercent  = Motor_GetActualDuty();
    s_snapshot.electricalHz       = Motor_GetElectricalHz();
    s_snapshot.pwmFrequencyHz     = Motor_GetPwmFrequency();
    s_snapshot.firmwareVersion    = (uint16_t)MOTOR_FW_VERSION;
    s_snapshot.commOkCount        = Motor_GetCommOkCount();
    s_snapshot.commErrCount       = Motor_GetCommErrCount();
    s_snapshot.vbusCounts         = Motor_GetVbusCounts();
    s_snapshot.vbusMilliVolts     = (uint16_t)(((uint32_t)s_snapshot.vbusCounts * 14038u) / 1000u);
    s_snapshot.isensePeakCounts   = Motor_GetIsensePeakCounts();
    s_snapshot.isenseMilliAmps    = (uint16_t)(((uint32_t)s_snapshot.isensePeakCounts * 4069u) / 1000u);
    s_snapshot.bemfCounts         = Motor_GetBemfCounts();
    s_snapshot.bemfThresholdCounts= Motor_GetBemfThresholdCounts();
    s_snapshot.tickMs             = now;
    s_snapshot.stepCount          = Motor_GetStepCount();
    s_snapshot.zeroCrossCount     = Motor_GetZeroCrossCount();
    s_snapshot.mode               = (uint8_t)Motor_GetFirmwareMode();
}

const monitor_snapshot_t *Monitor_GetSnapshot(void)
{
    return &s_snapshot;
}

uint16_t Monitor_GetRegister(uint16_t address)
{
    switch (address) {
    case 0x0000u: return s_snapshot.state;
    case 0x0001u: return Motor_GetStartRequest();
    case 0x0002u: return s_snapshot.throttlePercent;
    case 0x0003u: return s_snapshot.pwmFrequencyHz;
    case 0x0004u: return s_snapshot.actualDutyPercent;
    case 0x0005u: return s_snapshot.fault;
    case 0x0006u: return s_snapshot.electricalHz;
    case 0x0007u: return s_snapshot.firmwareVersion;
    case 0x0008u: return s_snapshot.commErrCount;
    case 0x0009u: return s_snapshot.commOkCount;
    default:      return 0u;
    }
}
