"""在Unicorn执行实际comms.bin；模拟寄存器，不模拟功率级或电机。

先build_comms.ps1，再python tests/test_firmware.py --toolchain-bin <GCC bin>。
测试依赖：python -m pip install unicorn；固件本身无此依赖。
"""
import argparse
from pathlib import Path
import struct
import subprocess
import unittest
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_MODE_MCLASS
from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3
from unicorn.arm_const import UC_ARM_REG_SP, UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_XPSR

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--toolchain-bin', required=True)
args, remaining = parser.parse_known_args()
BUILD = ROOT / 'build_comms'
nm = subprocess.check_output([str(Path(args.toolchain_bin) / 'arm-none-eabi-nm.exe'),
                              '-S', 'comms.elf'], cwd=BUILD, text=True)
SYMS = {}
for line in nm.splitlines():
    f = line.split()
    if len(f) == 4:
        SYMS[f[3]] = (int(f[0], 16), int(f[1], 16))
    elif len(f) == 3:
        SYMS[f[2]] = (int(f[0], 16), 4)


class Firmware:
    def __init__(self):
        self.uc = Uc(UC_ARCH_ARM, UC_MODE_THUMB | UC_MODE_MCLASS)
        for address, length in [(0, 0x20000), (0x20000000, 0x1000),
                                (0x40000000, 0x100000), (0xE000E000, 0x2000)]:
            self.uc.mem_map(address, length)
        blob = (BUILD / 'comms.bin').read_bytes()
        self.uc.mem_write(0, blob)
        start, end = SYMS['_sdata'][0], SYMS['_edata'][0]
        self.uc.mem_write(start, blob[SYMS['_sidata'][0]:SYMS['_sidata'][0] + end - start])
        self.call('Motor_Init')

    def write(self, address, value, size=4):
        self.uc.mem_write(address, (value & ((1 << (size * 8)) - 1)).to_bytes(size, 'little'))

    def read(self, address, size=4):
        return int.from_bytes(self.uc.mem_read(address, size), 'little')

    def set(self, name, value):
        address, size = SYMS[name]
        self.write(address, value, size)

    def get(self, name):
        address, size = SYMS[name]
        return self.read(address, size)

    def now(self, tick):
        self.write(0x40000C48, tick)  # TIM2.CNT32；已由实际头文件/反汇编核对

    def call(self, name, *values):
        sp, sentinel = 0x20000CE0, 0x10000
        self.uc.reg_write(UC_ARM_REG_SP, sp)
        self.uc.reg_write(UC_ARM_REG_LR, sentinel | 1)
        self.uc.reg_write(UC_ARM_REG_XPSR, 0x01000000)
        for reg, val in zip([UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3], values):
            self.uc.reg_write(reg, val & 0xFFFFFFFF)
        for i, val in enumerate(values[4:]):
            self.write(sp + i * 4, val)
        self.uc.emu_start(SYMS[name][0] | 1, sentinel, count=100000)
        if self.uc.reg_read(UC_ARM_REG_PC) != sentinel:
            raise AssertionError(name + ': instruction budget exhausted (blocking?)')
        return self.uc.reg_read(UC_ARM_REG_R0)

    def adc_complete(self, raw, tick):
        self.now(tick)
        cr0 = self.read(0x40002404)
        self.write(0x40002404, cr0 & ~2)  # START由硬件转换完成清零
        self.write(0x40002468, raw)
        self.write(0x40002460, 8)  # CONT_INTF
        self.call('Adc_IRQHandler')


class Regression(unittest.TestCase):
    def setUp(self):
        self.f = Firmware()

    def reset_observer(self, expected=1, tick=0, period=1000, step=0):
        self.f.call('Bemf_Reset', 0x20000B00, step, tick, period, 100, expected, 3)

    def sample(self, tick, delta, step=0):
        return self.f.call('Bemf_Sample', 0x20000B00, step, tick, delta, 0x20000B40)

    def test_crossing_requires_both_sides_and_emits_once(self):
        self.reset_observer()
        for t, d in [(300, 20), (350, 20), (500, -20)]:
            self.assertEqual(self.sample(t, d), 0)
        self.assertEqual(self.sample(550, -20), 1)
        self.assertEqual(self.f.read(0x20000B40), 425)
        self.assertEqual(self.sample(600, -30), 0)

    def test_rising_crossing(self):
        self.reset_observer(-1)
        for t, d in [(300, -20), (350, -20), (500, 20)]:
            self.assertEqual(self.sample(t, d), 0)
        self.assertEqual(self.sample(550, 20), 1)

    def test_level_noise_and_wrong_phase_never_lock(self):
        for signals in [[-20] * 8, [20, -20] * 4, [0, 2, -2, 0] * 2]:
            self.reset_observer()
            for i, d in enumerate(signals):
                self.assertEqual(self.sample(250 + 50 * i, d), 0)
        self.reset_observer()
        for t, d in [(300, 20), (350, 20), (500, -20), (550, -20)]:
            self.assertEqual(self.sample(t, d, step=1), 0)

    def test_blanking_and_late_crossing_rejected(self):
        self.reset_observer()
        for t, d in [(20, 20), (30, 20), (60, -20), (70, -20),
                     (750, 20), (800, 20), (850, -20), (870, -20)]:
            self.assertEqual(self.sample(t, d), 0)

    def test_timestamp_wrap_and_neutral_interpolation(self):
        base = 0xFFFFFF00
        self.reset_observer(tick=base)
        for offset, d in [(300, 20), (350, 20), (500, -20)]:
            self.assertEqual(self.sample((base + offset) & 0xFFFFFFFF, d), 0)
        self.assertEqual(self.sample((base + 550) & 0xFFFFFFFF, -20), 1)
        self.assertEqual(self.f.read(0x20000B40), (base + 425) & 0xFFFFFFFF)
        self.assertEqual(self.f.call('Bemf_InterpolateNeutral', 100, 140,
                                    0xFFFFFFF0, 0, 0x10), 120)

    def test_start_and_throttle_do_not_implicitly_energize(self):
        self.f.call('Motor_CommandStart')
        self.assertEqual(self.f.get('s_state'), 0)
        self.f.call('Motor_CommandStop')
        self.f.call('Motor_SetThrottle', 10)
        self.assertEqual(self.f.get('s_state'), 0)
        self.f.call('Motor_CommandStart')
        self.assertEqual(self.f.get('s_state'), 1)
        self.assertLessEqual(self.f.get('s_throttlePercent'), 2)

    def test_missing_bus_prevents_startup(self):
        self.f.call('Motor_SetThrottle', 20)
        self.f.call('Motor_CommandStart')
        self.f.set('s_selftestElapsedMs', 499)
        self.f.call('SysTick_IRQHandler')
        self.assertEqual(self.f.get('s_state'), 6)
        self.assertEqual(self.f.get('s_fault') & 8, 8)

    def test_six_sectors_required_for_closed_loop(self):
        self.f.set('s_state', 4)
        self.f.set('s_lastStepTicks', 1000)
        self.f.set('s_openLoopCommutationCount', 36)
        self.f.set('s_commutationScheduled', 1)
        for i in range(6):
            crossing = i * 1000 + 500
            self.f.now(crossing + 30)
            self.f.call('Motor_OnZeroCross', crossing)
            self.assertEqual(self.f.get('s_state'), 4 if i < 5 else 5)
        self.assertEqual(self.f.get('s_commutationScheduled'), 1)
        self.assertEqual(self.f.read(0x40000C20, 2), (0x10000 - 470) & 0xFFFF)

    def test_bad_period_resets_lock(self):
        self.f.set('s_state', 4)
        self.f.set('s_lastStepTicks', 1000)
        self.f.set('s_openLoopCommutationCount', 36)
        self.f.now(530)
        self.f.call('Motor_OnZeroCross', 500)
        self.f.now(4000)
        self.f.call('Motor_OnZeroCross', 3970)
        self.assertEqual(self.f.get('s_lockSteps'), 0)
        self.assertEqual(self.f.get('s_state'), 4)

    def test_stop_cancels_pending_valley_commutation(self):
        self.f.set('s_state', 5)
        self.f.set('s_stepPending', 1)
        self.f.set('s_pendingStep', 3)
        self.f.call('Motor_CommandStop')
        self.assertEqual(self.f.get('s_stepPending'), 0)
        steps = self.f.get('s_stepCount')
        self.f.write(0x40003100, 128)
        self.f.call('Tim4_IRQHandler')
        self.assertEqual(self.f.get('s_stepCount'), steps)
        self.f.call('Tim1_IRQHandler')
        self.assertEqual(self.f.get('s_stepPending'), 0)

    def test_adc_current_protection_runs_without_main_loop(self):
        self.f.set('s_state', 4)
        self.f.set('s_selftestRunning', 1)
        self.f.set('s_adcPending', 1)
        self.f.set('s_adcKind', 4)
        self.f.adc_complete(600, 100)
        self.assertEqual(self.f.get('s_state'), 6)
        self.assertEqual(self.f.get('s_fault') & 4, 4)

    def test_adc_frame_uses_vn_and_rejects_changed_step(self):
        self.f.set('s_state', 4)
        self.f.set('s_stepIndex', 0)
        self.f.set('s_adcStep', 0)
        self.f.write(0x40003000, 200)
        self.f.write(0x40003010, 510)
        self.f.set('s_adcPending', 1)
        self.f.set('s_adcKind', 2)
        self.f.set('s_adcTick', 100)
        self.f.set('s_adcFrameTick', 100)
        self.f.adc_complete(100, 102)
        self.assertEqual(self.f.get('s_adcKind'), 1)
        self.f.adc_complete(120, 104)
        self.assertEqual(self.f.get('s_adcKind'), 3)
        self.f.adc_complete(140, 106)
        self.assertEqual(self.f.get('s_bemfThresholdCounts'), 120)
        self.assertEqual(self.f.get('s_bemfCounts'), 120)
        self.f.set('s_adcPending', 1)
        self.f.set('s_adcKind', 3)
        self.f.set('s_adcStep', 1)
        self.f.adc_complete(300, 108)
        self.assertEqual(self.f.get('s_bemfThresholdCounts'), 120)

    def test_startup_and_lost_feedback_timeout(self):
        self.f.set('s_state', 4)
        self.f.set('s_selftestRunning', 1)
        self.f.set('s_continuousRun', 1)
        self.f.set('s_selftestElapsedMs', 9400)
        self.f.call('SysTick_IRQHandler')
        self.assertEqual(self.f.get('s_state'), 6)
        self.assertEqual(self.f.get('s_fault') & 64, 64)
        self.f.set('s_state', 5)
        self.f.set('s_selftestRunning', 1)
        self.f.set('s_lastStepTicks', 1000)
        self.f.set('s_lastCommutationTick', 0)
        self.f.set('s_commutationScheduled', 1)
        self.f.now(2000)
        self.f.call('SysTick_IRQHandler')
        self.assertEqual(self.f.get('s_state'), 6)

    def test_modbus_response_does_not_wait_for_uart(self):
        ptr = 0x20000B00
        self.f.uc.mem_write(ptr, bytes.fromhex('0103020000'))
        self.f.call('Modbus_SendResponse', ptr, 5)
        self.assertEqual(self.f.get('s_txLength'), 7)
        self.assertEqual(self.f.get('s_txIndex'), 1)
        self.f.call('Modbus_TxService')  # TC未置位，必须立即返回
        self.assertEqual(self.f.get('s_txIndex'), 1)

    def test_debug_markers_are_outside_stack(self):
        self.assertEqual(SYMS['__StackTop'][0], 0x20000F00)
        self.assertLess(SYMS['__StackLimit'][0], 0x20000F00)

    def test_speed_loop_feedback_and_anti_windup(self):
        c = 0x20000B00
        self.assertEqual(self.f.call('Speed_TargetMilliHz', 0), 0)
        self.assertEqual(self.f.call('Speed_TargetMilliHz', 100), 300000)
        self.f.call('Speed_Reset', c, 50, 100000)
        maintain = self.f.call('Speed_Update10ms', c, 32, 100000, 150)
        loaded = self.f.call('Speed_Update10ms', c, 32, 50000, 150)
        self.assertGreater(loaded, maintain)
        self.f.call('Speed_Reset', c, 150, 300000)
        for _ in range(100):
            self.assertEqual(self.f.call('Speed_Update10ms', c, 100, 0, 150), 150)
        self.assertEqual(self.f.read(c), 150000)
        self.assertEqual(self.f.call('Speed_Update10ms', c, 0, 50000, 150), 0)

    def test_startup_target_can_be_lowered_live(self):
        self.f.set('s_state', 4)
        self.f.set('s_selftestRunning', 1)
        self.f.set('s_continuousRun', 1)
        self.f.set('s_electricalMilliHz', 20000)
        self.f.set('s_rampAccumulatorMs', 99)
        self.f.call('Motor_SetThrottle', 1)
        self.f.call('SysTick_IRQHandler')
        self.assertEqual(self.f.get('s_electricalMilliHz'), 19000)
        self.f.call('Motor_SetThrottle', 0)
        self.assertEqual(self.f.get('s_state'), 0)

    def test_forced_startup_frequency_is_not_reported_as_feedback(self):
        self.f.set('s_state', 4)
        self.f.set('s_electricalMilliHz', 60000)
        self.assertEqual(self.f.call('Motor_GetElectricalHz'), 0)

    def test_modbus_controls_start_live_target_and_stop(self):
        def crc(frame):
            value = 0xFFFF
            for b in frame:
                value ^= b
                for _ in range(8):
                    value = (value >> 1) ^ (0xA001 if value & 1 else 0)
            return value

        def write_register(address, value):
            frame = bytes([1, 6]) + struct.pack('>HH', address, value)
            frame += struct.pack('<H', crc(frame))
            for byte in frame:
                self.f.write(0x40000000, byte)
                self.f.write(0x40000010, 1)
                self.f.call('Uart0_IRQHandler')
            self.f.call('Modbus_Poll')
            self.f.set('s_tickMs', self.f.get('s_tickMs') + 5)
            self.f.call('Modbus_Poll')
            ptr = SYMS['s_txFrame'][0]
            self.assertEqual(bytes(self.f.uc.mem_read(ptr, 8)), frame)
            for _ in range(8):
                self.f.write(0x40000010, 2)
                self.f.call('Modbus_TxService')

        self.f.call('Modbus_Init')
        self.f.set('s_ready', 1)
        write_register(2, 30)
        self.assertEqual(self.f.get('s_state'), 0)
        write_register(1, 1)
        self.assertEqual(self.f.get('s_state'), 1)
        write_register(2, 80)
        self.assertEqual(self.f.get('s_throttleRequestPercent'), 80)
        write_register(1, 0)
        self.assertEqual(self.f.get('s_state'), 0)
        self.assertEqual(self.f.get('s_stepPending'), 0)

    def test_speed_duty_is_committed_only_at_pwm_valley(self):
        self.f.set('s_state', 5)
        self.f.set('s_selftestRunning', 1)
        self.f.set('s_continuousRun', 1)
        self.f.set('s_throttleRequestPercent', 100)
        self.f.set('s_lastStepTicks', 3125) # 20电Hz
        self.f.set('s_tickMs', 9)
        self.f.set('s_actualDuty', 5)
        self.f.write(0x40003010, 570)
        self.f.write(0x40003018, 570)
        self.f.call('Speed_Reset', SYMS['s_speedControl'][0], 50, 100000)
        self.f.call('SysTick_IRQHandler')
        self.assertEqual(self.f.read(0x40003010), 570)
        self.assertEqual(self.f.get('s_dutyPending'), 1)
        self.f.write(0x40003100, 128)
        self.f.write(0x40003070, 1 << 31)
        self.f.call('Tim4_IRQHandler')
        self.assertLess(self.f.read(0x40003010), 570)
        self.assertEqual(self.f.get('s_dutyPending'), 0)


if __name__ == '__main__':
    unittest.main(argv=[__file__] + remaining, verbosity=2)
