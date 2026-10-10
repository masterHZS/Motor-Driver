"""Single-process probe: trigger precharge over Modbus, then snapshot the bridge.

Two-process versions were unreliable: the SWD sampler and the Modbus client fight
over the same DAPLink, which made SWD reads crawl.  This script does both itself.

Sequence:
  1. connect SWD (500 kHz) and COM5 (9600-8N1)
  2. write throttle=15, then start=1
  3. poll s_state over SWD until it reads 1 (MOTOR_STATE_PRECHARGE)
  4. halt the core - the ADT timers keep switching, so the bridge holds step 0
     (phase A high side at 15% duty, phase B low side static on, phase C floating)
  5. sample the three phase nodes plus the six MCU gate outputs
  6. restore CR0 + ADC flag, resume, stop the motor

Phase-node probe (channel 3/5/6 = PA3/PA5/PA6) shows whether the power stage
actually drives.  Gate probe (channels 16/7/4/8/19/9 = PB2/PA7/PA4/PB0/PB12/PB1)
shows whether the MCU itself emits the PWM pattern - that separates "MCU never
outputs" from "FD6288T does not conduct".

Usage:
    python tests/power_stage_probe.py [com_port] [throttle]
"""

import sys
import time
import random

import serial
from pyocd.core.helpers import ConnectHelper

ADC_BASE = 0x40002400
CR0 = ADC_BASE + 0x04
RESULT = ADC_BASE + 0xA0
ICR = ADC_BASE + 0xB4
SGLSTART = ADC_BASE + 0xC0
SGLMUX_SHIFT = 4
SGLMUX_MASK = 0x1F << SGLMUX_SHIFT

STATE_ADDR = 0x20000296        # uint8_t s_state
DUTY_ADDR = 0x20000290         # uint16_t s_actualDuty
BLDC_ADDR = 0x20000277         # uint8_t s_bldcState
STARTREQ_ADDR = 0x20000294     # uint16_t s_startRequest

# (ADC channel, label)
PROBES = (
    (3, "PHASE_A"),
    (5, "PHASE_B"),
    (6, "PHASE_C"),
    (16, "GATE_Ah PB2"),
    (7, "GATE_Al PA7"),
    (4, "GATE_Bh PA4"),
    (8, "GATE_Bl PB0"),
    (19, "GATE_Ch PB12"),
    (9, "GATE_Cl PB1"),
)

SAMPLES = 80
SLAVE = 1


def crc16(data):
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc


def frame(pdu):
    body = bytes([SLAVE]) + bytes(pdu)
    value = crc16(body)
    return body + bytes([value & 0xFF, value >> 8])


def write_register(port, address, value):
    port.reset_input_buffer()
    port.write(frame([0x06, address >> 8, address & 0xFF, value >> 8, value & 0xFF]))
    raw = port.read(8)
    return len(raw) == 8 and raw[1] == 0x06


def sample_channel(target, channel, count):
    cr0 = target.read32(CR0)
    cr0 = (cr0 & ~SGLMUX_MASK) | ((channel << SGLMUX_SHIFT) & SGLMUX_MASK)
    target.write32(CR0, cr0)
    values = []
    for _ in range(count):
        # A single-conversion ADC holds RESULT until the next start, so the
        # trigger must be toggled for every sample; otherwise every read returns
        # the same conversion and the min/max spread is meaningless.
        #
        # The SWD round trip is slow enough that a fixed loop period can alias
        # exactly onto the 50 us PWM period - every sample then lands on the same
        # point of the square wave and min == max for a perfectly good PWM.  A
        # random wait breaks that correlation.
        time.sleep(random.uniform(0.0, 0.002))
        target.write32(SGLSTART, 0)
        target.write32(SGLSTART, 1)
        values.append(target.read32(RESULT) & 0xFFF)
    target.write32(SGLSTART, 0)
    return values


def main():
    port_name = sys.argv[1] if len(sys.argv) > 1 else "COM5"
    throttle = int(sys.argv[2]) if len(sys.argv) > 2 else 15
    steps = ["A+ B-", "A+ C-", "B+ C-", "B+ A-", "C+ A-", "C+ B-"]

    with ConnectHelper.session_with_chosen_probe(
        target_override="hc32f072",
        frequency=500000,
    ) as session, serial.Serial(port_name, 9600, timeout=0.3) as port:
        target = session.target
        try:
            target.resume()
        except Exception:
            pass

        print(f"SWD + {port_name} 就绪，内核在跑。写 throttle={throttle}% …", flush=True)
        print("  throttle ok" if write_register(port, 0x0002, throttle)
              else "  throttle FAILED", flush=True)
        time.sleep(0.2)
        print("写 start=1 …", flush=True)
        print("  start ok" if write_register(port, 0x0001, 1)
              else "  start FAILED", flush=True)

        deadline = time.time() + 5.0
        caught = False
        while time.time() < deadline:
            # Wait for the RAMP, not PRECHARGE: the FD6288T high sides are
            # bootstrap-driven, so a high side cannot conduct until its own low
            # side has been on long enough to charge the bootstrap cap.  Only by
            # the ramp has every low side already switched many times.
            if target.read8(STATE_ADDR) == 2:
                caught = True
                break
        if not caught:
            print("没抓到换相窗口（state=2）。", flush=True)
            write_register(port, 0x0001, 0)
            write_register(port, 0x0002, 0)
            return

        target.halt()
        cr0_saved = target.read32(CR0)
        step = target.read8(BLDC_ADDR)
        duty = target.read16(DUTY_ADDR)
        start_req = target.read16(STARTREQ_ADDR)

        # ADTIM4/5/6 drive the three high-side gates (A/B/C).  PCONR bit8 is
        # OUTENA; reading it here (not in STOPPED, where AllOutputsOff clears it)
        # is what tells us whether the channel output is actually enabled.
        timers = (
            ("ADTIM4 A-high", 0x40003000),
            ("ADTIM5 B-high", 0x40003400),
            ("ADTIM6 C-high", 0x40003800),
        )
        timer_regs = {}
        for label, base in timers:
            timer_regs[label] = (
                target.read32(base + 0x00),   # CNTER
                target.read32(base + 0x04),   # PERAR
                target.read32(base + 0x10),   # GCMAR
                target.read32(base + 0x50),   # GCONR
                target.read32(base + 0x58),   # PCONR
            )
        measurements = {}
        try:
            print(f"已暂停内核：state=PRECHARGE  step={step}  duty={duty}%  "
                  f"startReq={start_req}", flush=True)
            for channel, label in PROBES:
                measurements[label] = sample_channel(target, channel, SAMPLES)
        finally:
            target.write32(CR0, cr0_saved)
            target.write32(ICR, target.read32(ICR) & ~1)
            target.resume()
            write_register(port, 0x0001, 0)
            write_register(port, 0x0002, 0)

        print(f"\n采样 {SAMPLES} 点/路，每次重新触发转换\n", flush=True)
        print("测点              min    max     平均    平均电压", flush=True)
        for _, label in PROBES:
            values = measurements[label]
            avg = sum(values) / len(values)
            print(
                f"{label:<16} {min(values):5d}  {max(values):5d}"
                f"  {avg:7.1f}   {avg * 3.3 / 4096.0:6.3f} V",
                flush=True,
            )

        print("\n判读（预充 = 该步 " + (steps[step] if step < 6 else "?") +
              "，A相高边 PWM / B相低边常开 / C相悬空）：", flush=True)

        print("\n高边定时器寄存器（暂停瞬间）：", flush=True)
        for label, _ in timers:
            cnt, perar, gcmar, gconr, pconr = timer_regs[label]
            print(f"  {label}: CNTER=0x{cnt:04X} PERAR={perar} GCMAR={gcmar} "
                  f"GCONR=0x{gconr:04X} PCONR=0x{pconr:08X} "
                  f"OUTENA(bit8)={(pconr >> 8) & 1} "
                  f"CMPCA(bit4-5)={(pconr >> 4) & 3} "
                  f"PERCA(bit6-7)={(pconr >> 6) & 3} "
                  f"DISVALA(bit11-12)={(pconr >> 11) & 3}", flush=True)

        ah = measurements["GATE_Ah PB2"]
        bl = measurements["GATE_Bl PB0"]
        pa = measurements["PHASE_A"]
        ah_avg = sum(ah) / len(ah)
        bl_avg = sum(bl) / len(bl)
        pa_avg = sum(pa) / len(pa)
        print(f"  GATE_Ah 平均 {ah_avg:.0f} counts："
              + ("MCU 正在输出 PWM（方波）" if max(ah) - min(ah) > 2000
                 else "没有 PWM，PB2 是静态电平 -> MCU 侧问题"), flush=True)
        print(f"  GATE_Bl 平均 {bl_avg:.0f} counts："
              + ("低边常开正确" if bl_avg > 3500 else "低边异常"), flush=True)
        span_a = max(pa) - min(pa)
        expected = duty / 100.0 * 14.0 / 16.0 * 4096.0 / 3.3
        print(f"  PHASE_A 平均 {pa_avg:.0f} counts，跨度 {span_a}：", flush=True)
        if span_a > 600:
            print("    -> 高边在开关（看得到大幅 PWM 方波），功率级通", flush=True)
        elif pa_avg > 450:
            print(f"    -> 纹丝不动停在半母线，高边没导通"
                  f"（正常平均应约 {expected:.0f} counts）", flush=True)
        else:
            print("    -> 停在近 0，低边一直拉着或高边没起来", flush=True)


if __name__ == "__main__":
    main()
