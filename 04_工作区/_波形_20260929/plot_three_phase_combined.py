#!/usr/bin/env python3
from __future__ import annotations
import re
import subprocess
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

SIGROK = Path(r"C:\Program Files\sigrok\sigrok-cli\sigrok-cli.exe")
CH = [f"D{i}" for i in range(6)]
PAIRS = ((0, 1), (2, 3), (4, 5))


def load(path: Path):
    proc = subprocess.run([str(SIGROK), "-i", str(path), "-I", "srzip", "-O", "bits"],
                          check=True, capture_output=True, text=True)
    chunks = {c: [] for c in CH}
    rate = 0
    for line in proc.stdout.splitlines():
        m = re.search(r"at\s+([0-9.]+)\s+(MHz|kHz|Hz)", line, re.I)
        if m and "Acquisition" in line:
            v = float(m.group(1)); unit = m.group(2).lower()
            rate = int(v * (1_000_000 if unit == "mhz" else 1_000 if unit == "khz" else 1))
        if len(line) > 3 and line[:2] in CH and line[2] == ":":
            digits = "".join(line[3:].split())
            chunks[line[:2]].append(np.frombuffer(digits.encode(), dtype=np.uint8) - 48)
    n = min(sum(len(v) for v in chunks[c]) for c in CH)
    return rate, {c: np.concatenate(chunks[c])[:n].astype(bool) for c in CH}


def classify(hi, lo):
    if lo < 0.01:
        return "F" if hi < 0.01 else "?"
    if 0.02 <= hi <= 0.08 and 0.90 <= lo <= 0.96:
        return "H"
    if hi < 0.015 and lo > 0.96:
        return "L"
    return "?"


def main():
    base = Path(r"C:\Users\limer\Desktop\motor-driver\04_工作区\_波形_20260929")
    rate, d = load(base / "ramp_sequence_200k_6000ms.sr")
    win = rate * 50 // 1000
    times = []
    states = {"A": [], "B": [], "C": []}
    for n in range(0, len(d["D0"]) - win + 1, win):
        code = "".join(classify(d[CH[hi]][n:n+win].mean(), d[CH[lo]][n:n+win].mean())
                       for hi, lo in PAIRS)
        times.append((n + win / 2) / rate)
        for idx, phase in enumerate("ABC"):
            states[phase].append(code[idx])
    times = np.array(times)
    levels = {"H": 2.0, "L": 1.0, "F": 0.0}
    colors = {"A": "#1f77b4", "B": "#d62728", "C": "#2ca02c"}
    fig, ax = plt.subplots(figsize=(17, 6), constrained_layout=True)
    for phase in "ABC":
        vals = []
        last = "F"
        for value in states[phase]:
            if value in levels:
                last = value
            vals.append(levels[last])
        ax.step(times, vals, where="post", lw=2.2, color=colors[phase], label=f"{phase} phase")
    ax.set_yticks([0, 1, 2], ["Floating (F)", "Low-side ON (L)", "High-side PWM (H)"])
    ax.set_ylim(-0.25, 2.25)
    ax.set_xlim(2.2, 5.4)
    ax.set_xlabel("Capture time (s)")
    ax.set_title("F005 three-phase complete six-step cycle - A blue, B red, C green", fontweight="bold")
    ax.grid(alpha=0.25)
    ax.legend(loc="upper right", ncol=3)
    out = base / "plots" / "three_phase_combined.png"
    fig.savefig(out, dpi=190)
    plt.close(fig)
    print(out)


if __name__ == "__main__":
    main()
