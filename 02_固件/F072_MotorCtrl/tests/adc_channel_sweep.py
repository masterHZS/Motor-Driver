"""Sweep HC32F072 ADC single-conversion channels over SWD.

Read-only bring-up helper: halts the core, changes only CR0.SGLMUX, samples each
channel twice (the first conversion discharges the sample/hold capacitor),
restores CR0 and resumes the core. Nothing is written to flash.

Usage:
    python tests/adc_channel_sweep.py [ch_lo] [ch_hi]   # default 0 31

Interpretation:
    External channels 0..7 are PA0..PA7. A pin tied to the BEMF divider network
    reads ~0 counts when the bus is off; a floating pin reads near full scale.
"""

import sys
import time

from pyocd.core.helpers import ConnectHelper

ADC_BASE = 0x40002400
CR0 = ADC_BASE + 0x04
RESULT = ADC_BASE + 0xA0
SGLSTART = ADC_BASE + 0xC0

SGLMUX_SHIFT = 4
SGLMUX_MASK = 0x1F << SGLMUX_SHIFT
FULL_SCALE = 4096.0
VREF = 3.3


def sample(target, channel):
    cr0 = target.read32(CR0)
    cr0 = (cr0 & ~SGLMUX_MASK) | ((channel << SGLMUX_SHIFT) & SGLMUX_MASK)
    target.write32(CR0, cr0)

    target.write32(SGLSTART, 1)
    time.sleep(0.003)
    target.read32(RESULT)
    time.sleep(0.003)
    value = target.read32(RESULT) & 0xFFF
    target.write32(SGLSTART, 0)
    return value


def main():
    lo = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    hi = int(sys.argv[2]) if len(sys.argv) > 2 else 31

    with ConnectHelper.session_with_chosen_probe(
        target_override="hc32f072",
        frequency=500000,
    ) as session:
        target = session.target
        target.halt()
        cr0_saved = target.read32(CR0)
        print("ch  counts    volts")
        try:
            for channel in range(lo, hi + 1):
                value = sample(target, channel)
                print(f"{channel:2d}  {value:5d}    {value * VREF / FULL_SCALE:.3f}")
        finally:
            target.write32(CR0, cr0_saved)
            target.resume()
        print(f"restored CR0 = 0x{cr0_saved:08X}")


if __name__ == "__main__":
    main()
