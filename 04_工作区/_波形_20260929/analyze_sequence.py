#!/usr/bin/env python3
"""Classify six-step phase states from a sigrok srzip capture."""
from __future__ import annotations
import argparse
import re
import subprocess
from pathlib import Path
import numpy as np

SIGROK = Path(r"C:\Program Files\sigrok\sigrok-cli\sigrok-cli.exe")
CH = [f"D{i}" for i in range(6)]
EXPECTED = ["HLF", "HFL", "FHL", "LHF", "LFH", "FLH"]


def load(path: Path):
    proc = subprocess.run([str(SIGROK), "-i", str(path), "-I", "srzip", "-O", "bits"],
                          check=True, capture_output=True, text=True)
    chunks = {c: [] for c in CH}
    rate = 0
    for line in proc.stdout.splitlines():
        match = re.search(r"at\s+([0-9.]+)\s+(MHz|kHz|Hz)", line, re.IGNORECASE)
        if match and "Acquisition" in line:
            value = float(match.group(1))
            unit = match.group(2).lower()
            rate = int(value * (1_000_000 if unit == "mhz" else 1_000 if unit == "khz" else 1))
        if len(line) > 3 and line[:2] in CH and line[2] == ":":
            bits = "".join(line[3:].split())
            chunks[line[:2]].append(np.frombuffer(bits.encode(), dtype=np.uint8) - 48)
    n = min(sum(len(x) for x in chunks[c]) for c in CH)
    return rate, {c: np.concatenate(chunks[c])[:n].astype(bool) for c in CH}


def classify_pair(hi, lo):
    # Independent CHA/CHB six-step mode:
    #   H = high-side PWM with low-side input held low
    #   L = high-side input held low with low-side input high
    #   F = both inputs low (floating)
    if hi < 0.015 and lo < 0.015:
        return "F"
    if 0.02 <= hi <= 0.08 and lo < 0.015:
        return "H"
    if hi < 0.015 and lo > 0.96:
        return "L"
    return "?"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("capture", type=Path)
    ap.add_argument("--window-ms", type=int, default=10)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    rate, d = load(args.capture)
    win = rate * args.window_ms // 1000
    n = min(len(v) for v in d.values())
    seen = []
    for start in range(0, n - win + 1, win):
        states = []
        for hi, lo in ((0, 1), (2, 3), (4, 5)):
            states.append(classify_pair(d[CH[hi]][start:start+win].mean(),
                                        d[CH[lo]][start:start+win].mean()))
        state = "".join(states)
        if args.verbose:
            print(f"  {start / rate * 1000.0:8.1f} ms  {state}")
        if "?" not in state:
            item = (start / rate * 1000.0, state)
            if not seen or seen[-1][1] != state:
                seen.append(item)
    print("stable state changes:")
    for t, state in seen:
        mark = "OK" if state in EXPECTED else "BAD"
        print(f"  {t:8.1f} ms  {state}  {mark}")

    observed = [state for _, state in seen if state in EXPECTED]
    ordered = all(state in EXPECTED or state == "FFF" for _, state in seen)
    order_ok = len(observed) >= len(EXPECTED)
    if order_ok:
        target = ",".join(observed)
        cycle = ",".join(EXPECTED * 3)
        order_ok = target in cycle

    print("observed_unique=" + ",".join(sorted(set(s for _, s in seen))))
    print("observed_order=" + " -> ".join(observed))
    print("expected=" + ",".join(EXPECTED))
    print("order_ok=" + ("true" if order_ok else "false"))
    return 0 if ordered and order_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
