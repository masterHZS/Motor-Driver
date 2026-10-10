"""Extract the live floating-phase BEMF waveform from a motor_datalog log.

During RAMP/CLOSED_LOOP only the floating phase is re-sampled
(Motor_ReadBemf); the other two entries of s_debugPhaseAdc keep their last
STOPPED-state value. So for each logged line we must pick the entry that
matches the current step's floating phase, otherwise the "waveform" is a
mix of live and stale samples.

Usage:
    python tests/analyze_datalog.py <logfile>
"""

import sys
from pathlib import Path

# s_step[6][3] = {high, low, floating}; 0=A, 1=B, 2=C
FLOATING_BY_STEP = (2, 1, 0, 2, 1, 0)
PHASE_NAMES = ("A", "B", "C")


def parse(path):
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        if not raw or raw.startswith("#"):
            continue
        columns = raw.split("\t")
        if len(columns) < 3:
            continue
        fields = {}
        for item in columns[2:]:
            key, _, value = item.partition("=")
            fields[key] = value
        yield columns[0], float(columns[1]), fields


def main():
    path = sys.argv[1]
    rows = list(parse(path))

    print("=== 预充阶段 (state=1)：这三路都是停机时的旧值，不会更新 ===")
    pre = [r for r in rows if r[2].get("state") == "1"]
    if pre:
        first, last = pre[0], pre[-1]
        print(
            f"  {first[0]} -> {last[0]}  "
            f"{first[2]['A']}/{first[2]['B']}/{first[2]['C']}"
            f" -> {last[2]['A']}/{last[2]['B']}/{last[2]['C']}"
            f"   duty={first[2]['duty']}"
        )

    print()
    print("=== 换相阶段 (state=2/3)：只取当前悬浮相的那一路 ===")
    print("time          t      step  float  live  duty  eHz")
    per_step = {}
    for stamp, elapsed, fields in rows:
        if fields.get("state") not in ("2", "3"):
            continue
        step = int(fields["bldc"])
        if step >= 6:
            continue
        index = FLOATING_BY_STEP[step]
        live = int(fields[PHASE_NAMES[index]])
        per_step.setdefault(step, []).append(live)
        print(
            f"{stamp}  {elapsed:7.3f}  {step}     {PHASE_NAMES[index]}"
            f"      {live:4d}   {fields['duty']:>2}   {fields['eHz']}"
        )

    print()
    print("=== 每个步号下：悬浮相读数范围 (counts) ===")
    for step in sorted(per_step):
        values = per_step[step]
        print(
            f"  step {step} ({'A+' if step in (0, 1) else 'B+' if step in (2, 3) else 'C+'}"
            f"{'-' if step % 2 == 0 else '+'} … 悬浮{PHASE_NAMES[FLOATING_BY_STEP[step]]}):"
            f"  n={len(values):3d}  min={min(values):4d}  max={max(values):4d}"
            f"  avg={sum(values) // len(values):4d}"
        )


if __name__ == "__main__":
    main()
