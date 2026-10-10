#!/usr/bin/env python3
"""Check the six-step commutation tables against the authoritative F005 table.

The step table must be a uniform 60-degree rotation of the stator current
vector.  A transposed pair of rows (the 2026-10-08 regression) still visits all
six states but produces +60/+60/+60/+120/-60/+120, which shakes the rotor.
This test parses the tables straight out of the C sources so it cannot drift
from what is actually compiled.
"""

import math
import re
from pathlib import Path

TEST_DIR = Path(__file__).resolve().parent
MOTOR_CTRL = TEST_DIR.parent / "user"
F005_MOTOR = TEST_DIR.parent.parent / "F005_Slave" / "user" / "motor.c"

PHASE_AXIS_DEG = (0.0, 120.0, 240.0)


def parse_array_table(text: str, name: str):
    """Parse a `const uint8_t <name>[6][3] = { {..}, .. };` initialiser."""
    match = re.search(
        r"const\s+uint8_t\s+" + name + r"\s*\[\s*6\s*\]\s*\[\s*3\s*\]\s*=\s*\{(.*?)\n\};",
        text,
        re.S,
    )
    assert match, f"{name} not found"
    rows = re.findall(r"\{\s*(\d+)u?\s*,\s*(\d+)u?\s*,\s*(\d+)u?\s*\}", match.group(1))
    assert len(rows) == 6, f"{name}: expected 6 steps, got {len(rows)}"
    return [tuple(int(v) for v in row) for row in rows]


def parse_f005_table(text: str):
    """Parse the reference `motor_step_t s_step[6]` (named phases)."""
    match = re.search(
        r"const\s+motor_step_t\s+s_step\s*\[\s*MOTOR_STEP_COUNT\s*\]\s*=\s*\{(.*?)\n\};",
        text,
        re.S,
    )
    assert match, "F005 s_step not found"
    named = {"MOTOR_PHASE_A": 0, "MOTOR_PHASE_B": 1, "MOTOR_PHASE_C": 2}
    rows = re.findall(
        r"\{\s*(MOTOR_PHASE_[ABC])\s*,\s*(MOTOR_PHASE_[ABC])\s*,"
        r"\s*(MOTOR_PHASE_[ABC])\s*,\s*([-+]?\d+)\s*\}",
        match.group(1),
    )
    assert len(rows) == 6, f"F005: expected 6 steps, got {len(rows)}"
    table = [(named[h], named[l], named[f]) for h, l, f, _ in rows]
    signs = [int(s) for *_, s in rows]
    return table, signs


def vector_angle_deg(high: int, low: int) -> float:
    """Angle of the stator current vector (high phase -> low phase)."""
    uh = math.radians(PHASE_AXIS_DEG[high])
    ul = math.radians(PHASE_AXIS_DEG[low])
    return math.degrees(math.atan2(math.sin(uh) - math.sin(ul), math.cos(uh) - math.cos(ul)))


def check_table(label: str, table):
    angles = [vector_angle_deg(h, l) for h, l, _ in table]
    deltas = [((angles[(i + 1) % 6] - angles[i] + 180.0) % 360.0) - 180.0 for i in range(6)]
    for i, row in enumerate(table):
        assert sorted(row) == [0, 1, 2], f"{label}: step {i} must use all three phases"
        assert row[0] != row[1], f"{label}: step {i} shorts high and low onto one phase"
    for i, delta in enumerate(deltas):
        assert abs(delta - 60.0) < 1e-6, (
            f"{label}: step {i}->{(i + 1) % 6} advances {delta:+.0f} deg, expected +60"
        )
    return angles


def main() -> None:
    open_loop = parse_array_table((MOTOR_CTRL / "motor.c").read_text(encoding="utf-8"), "s_step")
    bemf = parse_array_table((MOTOR_CTRL / "motor_bemf.c").read_text(encoding="utf-8"), "s_step")
    reference, reference_signs = parse_f005_table(F005_MOTOR.read_text(encoding="utf-8"))

    check_table("motor.c", open_loop)
    check_table("motor_bemf.c", bemf)
    check_table("F005_Slave/user/motor.c", reference)

    assert open_loop == reference, (open_loop, reference)
    assert bemf == reference, (bemf, reference)

    # The BEMF slope of the floating phase alternates with the step parity.
    for i, sign in enumerate(reference_signs):
        expected_sign = 1 if i % 2 == 0 else -1
        assert sign == expected_sign, (i, sign)
    print("step tables match the F005 reference table (uniform +60 deg per step)")
    print("all step sequence checks passed")


if __name__ == "__main__":
    main()
