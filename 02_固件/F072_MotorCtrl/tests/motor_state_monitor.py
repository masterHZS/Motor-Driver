"""Poll motor state out of RAM over SWD while the target keeps running.

Read-only: the core is never halted, only memory-block reads are issued.
Prints a timestamped line whenever any watched value changes.

Usage:
    python tests/motor_state_monitor.py [seconds] [interval_ms]
"""

import struct
import sys
import time

from pyocd.core.helpers import ConnectHelper

PHASE_ADC = 0x20000240      # u16[3] filtered phase ADC
WATCH_BASE = 0x20000272     # s_zeroCrossPoint .. s_tickMs
WATCH_LEN = 40

FIELDS = (
    ("zeroCross", "H", 0x00),
    ("highestAdc", "H", 0x02),
    ("bemfRising", "B", 0x04),
    ("bldcState", "B", 0x05),
    ("prechargeMs", "H", 0x06),
    ("commErr", "H", 0x0E),
    ("commOk", "H", 0x10),
    ("fault", "H", 0x12),
    ("elecMilliHz", "I", 0x16),
    ("pwmPeriod", "H", 0x1A),
    ("pwmHz", "H", 0x1C),
    ("duty", "H", 0x1E),
    ("throttle", "H", 0x20),
    ("startReq", "H", 0x22),
    ("state", "H", 0x24),
    ("tickMs", "H", 0x26),
)

# commOk/commErr change on every host poll; keep them out of change detection.
KEY_FIELDS = (
    "state", "bldcState", "throttle", "duty", "pwmHz", "fault",
    "zeroCross", "highestAdc", "bemfRising", "prechargeMs", "elecMilliHz",
)


def snapshot(target):
    block = bytes(target.read_memory_block8(WATCH_BASE, WATCH_LEN))
    values = {
        name: struct.unpack_from("<" + fmt, block, off)[0]
        for name, fmt, off in FIELDS
    }
    values["phaseAdc"] = struct.unpack(
        "<3H", bytes(target.read_memory_block8(PHASE_ADC, 6))
    )
    return values


def render(values):
    return (
        f"state={values['state']} bldc={values['bldcState']} "
        f"thr={values['throttle']} duty={values['duty']} "
        f"pwm={values['pwmHz']} eHz={values['elecMilliHz'] // 1000} "
        f"fault=0x{values['fault']:04X} pre={values['prechargeMs']} "
        f"zero={values['zeroCross']} high={values['highestAdc']} "
        f"rise={values['bemfRising']} "
        f"adc={list(values['phaseAdc'])} ok={values['commOk']} err={values['commErr']}"
    )


def main():
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 12.0
    interval = float(sys.argv[2]) / 1000.0 if len(sys.argv) > 2 else 0.05

    with ConnectHelper.session_with_chosen_probe(
        target_override="hc32f072",
        frequency=500000,
    ) as session:
        target = session.target
        try:
            target.resume()
        except Exception:
            pass

        start = time.time()
        previous = None
        while time.time() - start < seconds:
            values = snapshot(target)
            key = tuple(values[name] for name in KEY_FIELDS) + (values["phaseAdc"],)
            if key != previous:
                stamp = time.time() - start
                print(f"[{stamp:6.2f}s] {render(values)}", flush=True)
                previous = key
            time.sleep(interval)


if __name__ == "__main__":
    main()
