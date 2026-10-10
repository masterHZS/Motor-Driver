#!/usr/bin/env python3
"""Analyze saved fx2lafw captures exported by sigrok-cli as bits."""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path
import numpy as np

SIGROK = Path(r"C:\Program Files\sigrok\sigrok-cli\sigrok-cli.exe")
CHANNELS = [f"D{i}" for i in range(6)]
PAIRS = (("HIN1/LIN1", 0, 1), ("HIN2/LIN2", 2, 3), ("HIN3/LIN3", 4, 5))


def load(path: Path):
    proc = subprocess.run(
        [str(SIGROK), "-i", str(path), "-I", "srzip", "-O", "bits"],
        check=True, capture_output=True, text=True,
    )
    sample_rate = None
    chunks = {name: [] for name in CHANNELS}
    for line in proc.stdout.splitlines():
        if "Acquisition with" in line and " at " in line:
            rate = line.split(" at ", 1)[1].split(" ", 1)[0]
            sample_rate = rate
        if len(line) > 3 and line[:2] in CHANNELS and line[2] == ":":
            digits = "".join(line[3:].split())
            chunks[line[:2]].append(np.frombuffer(digits.encode(), dtype=np.uint8) - ord("0"))
    if not sample_rate or any(not chunks[c] for c in CHANNELS):
        raise RuntimeError(f"Could not parse {path}")
    n = min(sum(len(a) for a in chunks[c]) for c in CHANNELS)
    data = {}
    for name in CHANNELS:
        data[name] = np.concatenate(chunks[name])[:n].astype(bool)
    return sample_rate, n, data


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: analyze_capture.py <capture.sr>")
        return 2
    path = Path(sys.argv[1])
    rate_text, samples, d = load(path)
    print(f"file={path.name}")
    print(f"sample_rate={rate_text} samples={samples}")
    for name in CHANNELS:
        print(f"{name}_high={d[name].mean():.6f} edges={np.count_nonzero(np.diff(d[name].astype(np.int8)))}")
    for label, hi, lo in PAIRS:
        hi_data = d[f"D{hi}"]
        lo_data = d[f"D{lo}"]
        both_high = np.count_nonzero(hi_data & lo_data)
        both_low = np.count_nonzero(~(hi_data | lo_data))
        print(f"{label}: both_high_samples={both_high} "
              f"both_high_pct={100.0 * both_high / samples:.4f}% "
              f"both_low_pct={100.0 * both_low / samples:.4f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
