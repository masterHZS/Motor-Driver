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


def main():
    base = Path(r"C:\Users\limer\Desktop\motor-driver\04_工作区\_波形_20260929")
    rate, d = load(base / "continuous_six_step_6ms.sr")
    count = min(len(d["D0"]), int(6.0e-3 * rate))
    t = np.arange(count) / rate * 1e6
    colors = {"A": "#1f77b4", "B": "#d62728", "C": "#2ca02c"}
    phase_map = {"A": (0, 1, 2.1), "B": (2, 3, 1.1), "C": (4, 5, 0.1)}
    fig, ax = plt.subplots(figsize=(18, 7), constrained_layout=True)
    for phase, (hi, lo, y) in phase_map.items():
        c = colors[phase]
        ax.step(t, d[CH[hi]][:count].astype(float)*0.38 + y, where="post", lw=1.7,
                color=c, label=f"{phase} HIN")
        ax.step(t, d[CH[lo]][:count].astype(float)*0.38 + y, where="post", lw=1.7,
                color=c, linestyle="--", label=f"{phase} LIN")
    for i in range(1, 6):
        ax.axvline(i * 1000.0, color="#999999", lw=0.8, ls=":")
    ax.set_yticks([0.29, 1.29, 2.29], ["C phase", "B phase", "A phase"])
    ax.set_xlim(0, 6000)
    ax.set_ylim(-0.15, 2.95)
    ax.set_xlabel("Continuous capture time (µs), one electrical cycle at 1 ms/step")
    ax.set_title("F005 raw MCU gate outputs - continuous six-step capture, no bus", fontweight="bold")
    ax.grid(axis="x", alpha=0.25)
    ax.legend(ncol=6, loc="lower center", bbox_to_anchor=(0.5, -0.20))
    out = base / "plots" / "continuous_three_phase_combined.png"
    fig.savefig(out, dpi=190, bbox_inches="tight")
    plt.close(fig)
    print(out)


if __name__ == "__main__":
    main()
