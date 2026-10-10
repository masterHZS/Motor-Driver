"""Continuous timestamped data logger for bench sessions.

Read-only over SWD: the core is never halted. One tab-separated line per sample
goes to a log file, flushed immediately so the file can be tailed live.

Usage:
    python tests/motor_datalog.py [seconds] [rate_hz] [outfile]

Defaults: 900 s, 20 Hz, ../../04_工作区/_调试日志_手动检测.txt
Stop early with Ctrl+C - the log stays valid up to the last flushed line.
"""

import datetime
import struct
import sys
import time
from pathlib import Path

from pyocd.core.helpers import ConnectHelper

PHASE_ADC = 0x20000240      # uint16_t s_debugPhaseAdc[3]  -> A, B, C
WATCH_BASE = 0x20000248     # s_startupStartMs .. s_tickMs
WATCH_LEN = 0x54

FIELDS = (
    ("startMs", "I", 0x00),
    ("olCount", "H", 0x04),
    ("olPeriodUs", "I", 0x08),
    ("lastCommDurUs", "I", 0x0C),
    ("nextCommSet", "B", 0x10),
    ("zeroCross", "H", 0x2A),
    ("highestAdc", "H", 0x2C),
    ("bemfRising", "B", 0x2E),
    ("bldcState", "B", 0x2F),
    ("prechargeMs", "H", 0x30),
    ("commErr", "H", 0x38),
    ("commOk", "H", 0x3A),
    ("fault", "H", 0x3C),
    ("elecMilliHz", "I", 0x40),
    ("pwmPeriod", "H", 0x44),
    ("pwmHz", "H", 0x46),
    ("duty", "H", 0x48),
    ("throttle", "H", 0x4A),
    ("startReq", "H", 0x4C),
    ("state", "B", 0x4E),
    ("tickMs", "I", 0x50),
)

KEY_FIELDS = (
    "state", "bldcState", "throttle", "duty", "pwmHz", "fault",
    "zeroCross", "highestAdc", "bemfRising", "prechargeMs", "elecMilliHz",
    "olCount", "olPeriodUs", "startReq",
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


def format_line(values, elapsed):
    stamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    a, b, c = values["phaseAdc"]
    return "\t".join(
        [
            stamp,
            f"{elapsed:.3f}",
            f"A={a}",
            f"B={b}",
            f"C={c}",
            f"state={values['state']}",
            f"bldc={values['bldcState']}",
            f"olCount={values['olCount']}",
            f"olPeriod={values['olPeriodUs']}",
            f"thr={values['throttle']}",
            f"duty={values['duty']}",
            f"pwmHz={values['pwmHz']}",
            f"eHz={values['elecMilliHz'] // 1000}",
            f"fault=0x{values['fault']:04X}",
            f"pre={values['prechargeMs']}",
            f"zero={values['zeroCross']}",
            f"high={values['highestAdc']}",
            f"rise={values['bemfRising']}",
            f"startReq={values['startReq']}",
            f"ok={values['commOk']}",
            f"err={values['commErr']}",
            f"tick={values['tickMs']}",
        ]
    )


def main():
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 900.0
    rate = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
    interval = 1.0 / max(rate, 1.0)
    default_out = (
        Path(__file__).resolve().parents[3]
        / "04_工作区"
        / "_调试日志_手动检测.txt"
    )
    out_path = Path(sys.argv[3]) if len(sys.argv) > 3 else default_out
    out_path.parent.mkdir(parents=True, exist_ok=True)

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
        samples = 0
        with out_path.open("w", encoding="utf-8", buffering=1) as handle:
            handle.write(
                "# motor_datalog  rate=%.0fHz  started=%s\n"
                % (rate, datetime.datetime.now().isoformat(timespec="seconds"))
            )
            print(f"logging to {out_path}", flush=True)
            print("Ctrl+C 结束；文件已经逐行落盘。", flush=True)
            try:
                while time.time() - start < seconds:
                    elapsed = time.time() - start
                    values = snapshot(target)
                    key = tuple(values[n] for n in KEY_FIELDS) + (
                        values["phaseAdc"],
                    )
                    if key != previous:
                        handle.write(format_line(values, elapsed) + "\n")
                        previous = key
                        samples += 1
                    time.sleep(interval)
            except KeyboardInterrupt:
                pass
            handle.write(f"# end  samples={samples}  wall={time.time() - start:.1f}s\n")
        print(f"done: {samples} changed samples", flush=True)


if __name__ == "__main__":
    main()
