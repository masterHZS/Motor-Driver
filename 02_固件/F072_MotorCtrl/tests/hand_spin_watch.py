"""Live readout of the three BEMF phase channels for hand-spin testing.

Read-only. Connect the motor, keep the inverter stopped (state=0), then turn the
shaft by hand and watch the three bars move. Nothing is written to the target.

Usage:
    python tests/hand_spin_watch.py           # ~20 Hz refresh
    python tests/hand_spin_watch.py 10 4      # 10 s, 4 frames/s

What a healthy result looks like:
    * all three channels swing up and down as the shaft turns;
    * the three peaks are offset from each other (roughly 120 electrical
      degrees apart) - they do not rise and fall together;
    * amplitude grows with turning speed (BEMF is proportional to rpm).

A channel that stays flat while the others swing means that phase's wire or
divider is open. All three flat means the drive is not reaching the divider.
"""

import struct
import sys
import time

from pyocd.core.helpers import ConnectHelper

PHASE_ADC = 0x20000240   # uint16_t s_debugPhaseAdc[3] -> A, B, C

FULL_SCALE = 4095.0
BAR_WIDTH = 20
WINDOW = 150             # samples kept for the peak-to-peak figure


def bar(value, width=BAR_WIDTH):
    filled = int(round(value / FULL_SCALE * width))
    filled = max(0, min(width, filled))
    return "#" * filled + "." * (width - filled)


def read_phases(target):
    block = bytes(target.read_memory_block8(PHASE_ADC, 6))
    return struct.unpack("<3H", block)


def main():
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 30.0
    rate = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
    interval = 1.0 / max(rate, 1.0)

    with ConnectHelper.session_with_chosen_probe(
        target_override="hc32f072",
        frequency=500000,
    ) as session:
        target = session.target
        try:
            target.resume()
        except Exception:
            pass

        history = {"A": [], "B": [], "C": []}
        names = ("A", "B", "C")
        start = time.time()

        print("A/B/C = BEMF 三相通道 (PA3/PA5/PA6)，0..4095 counts。Ctrl+C 结束。")
        try:
            while time.time() - start < seconds:
                phases = read_phases(target)
                for name, value in zip(names, phases):
                    samples = history[name]
                    samples.append(value)
                    if len(samples) > WINDOW:
                        del samples[0]

                spans = [
                    max(history[name]) - min(history[name]) for name in names
                ]
                line = "  ".join(
                    f"{name} {value:4d} [{bar(value)}]"
                    for name, value in zip(names, phases)
                )
                line += f"   p-p {spans[0]:4d}/{spans[1]:4d}/{spans[2]:4d}"
                print("\r" + line.ljust(120), end="", flush=True)
                time.sleep(interval)
        except KeyboardInterrupt:
            pass
        finally:
            print()
            print(
                "p-p 汇总 counts: "
                + "  ".join(
                    f"{name}={max(history[name]) - min(history[name])}"
                    for name in names
                )
            )


if __name__ == "__main__":
    main()
