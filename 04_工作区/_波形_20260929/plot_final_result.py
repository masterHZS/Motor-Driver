#!/usr/bin/env python3
from __future__ import annotations
import re
import subprocess
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

ROOT = Path(__file__).resolve().parent
SIGROK = Path(r"C:\Program Files\sigrok\sigrok-cli\sigrok-cli.exe")
CH = ["D0", "D1", "D2", "D3", "D4", "D5"]
LABELS = ["HIN1", "LIN1", "HIN2", "LIN2", "HIN3", "LIN3"]
PAIRS = ((0, 1), (2, 3), (4, 5))
EXPECTED = ["HLF", "HFL", "FHL", "LHF", "LFH", "FLH"]
COLORS = {"A": "#1f77b4", "B": "#d62728", "C": "#2ca02c"}
ROLE_COLORS = {"H": "#2ca02c", "L": "#ff7f0e", "F": "#c7c7c7"}


def load(path: Path):
    proc = subprocess.run(
        [str(SIGROK), "-i", str(path), "-I", "srzip", "-O", "bits"],
        check=True, capture_output=True, text=True,
    )
    chunks = {c: [] for c in CH}
    rate = 1
    for line in proc.stdout.splitlines():
        m = re.search(r"at\s+([0-9.]+)\s+(MHz|kHz|Hz)", line, re.I)
        if m and "Acquisition" in line:
            value = float(m.group(1))
            unit = m.group(2).lower()
            rate = int(value * (1_000_000 if unit == "mhz" else 1_000 if unit == "khz" else 1))
        if len(line) > 3 and line[:2] in CH and line[2] == ":":
            digits = "".join(line[3:].split())
            chunks[line[:2]].append(
                np.frombuffer(digits.encode(), dtype=np.uint8) - ord("0")
            )
    n = min(sum(len(v) for v in chunks[c]) for c in CH)
    data = {c: np.concatenate(chunks[c])[:n].astype(bool) for c in CH}
    return rate, data


def classify_pair(hi, lo):
    if hi < 0.015 and lo < 0.015:
        return "F"
    if 0.02 <= hi <= 0.08 and lo < 0.015:
        return "H"
    if hi < 0.015 and lo > 0.96:
        return "L"
    return "?"


def state_series(rate, d, window_ms=5):
    win = max(1, rate * window_ms // 1000)
    n = min(len(v) for v in d.values())
    rows = []
    for start in range(0, n - win + 1, win):
        states = []
        for hi, lo in PAIRS:
            states.append(
                classify_pair(
                    d[CH[hi]][start:start + win].mean(),
                    d[CH[lo]][start:start + win].mean(),
                )
            )
        rows.append((start / rate, "".join(states)))
    return rows


def main():
    full_rate, full = load(ROOT / "polarityfix2_test_0p5hz_200k_5s.sr")
    fast_rate, fast = load(ROOT / "final_fix_zoom_24m_5ms.sr")

    rows = state_series(full_rate, full, 5)
    end_t = 3.6
    rows = [(t, s) for t, s in rows if t <= end_t]

    fig = plt.figure(figsize=(18, 14), constrained_layout=True)
    gs = fig.add_gridspec(3, 1, height_ratios=[1.05, 1.15, 1.35], hspace=0.28)

    # 1) phase role timeline
    ax = fig.add_subplot(gs[0])
    for idx, label in enumerate("ABC"):
        y = 2 - idx
        for j, (t0, state) in enumerate(rows):
            role = state[idx]
            if role not in ROLE_COLORS:
                continue
            t1 = rows[j + 1][0] if j + 1 < len(rows) else end_t
            ax.axvspan(t0, t1, ymin=(y - 0.28) / 3.5, ymax=(y + 0.28) / 3.5,
                       color=ROLE_COLORS[role], alpha=0.92, linewidth=0)
            if t1 - t0 > 0.28:
                ax.text((t0 + t1) / 2, y, role, ha="center", va="center",
                        fontweight="bold", color="black")
        ax.text(-0.10, y, label, ha="right", va="center", fontweight="bold")
    for j, (t, state) in enumerate(rows):
        if state in EXPECTED:
            if j == 0 or rows[j - 1][1] != state:
                ax.text(t + 0.02, 3.15, state, ha="left", va="bottom",
                        color="#222222", fontsize=10, fontweight="bold")
    ax.set_xlim(0, end_t)
    ax.set_ylim(-0.55, 3.35)
    ax.set_yticks([])
    ax.set_xlabel("Logic capture time (s)")
    ax.set_title("F005 six-step state timeline: H = high-side PWM, L = low-side ON, F = floating",
                 fontweight="bold")
    ax.grid(axis="x", alpha=0.18)
    ax.legend(handles=[Patch(color=ROLE_COLORS[k], label=k) for k in "HLF"],
              ncol=3, loc="upper right")

    # 2) Raw six-channel traces over two commutation intervals
    ax = fig.add_subplot(gs[1])
    start_ms, end_ms = 540.0, 700.0
    a = int(full_rate * start_ms / 1000)
    b = int(full_rate * end_ms / 1000)
    t = np.arange(a, b) / full_rate
    y_positions = [5, 4, 3, 2, 1, 0]
    styles = ["-", "--"]
    phase_of_channel = ["A", "A", "B", "B", "C", "C"]
    for ch, label, y, phase in zip(CH, LABELS, y_positions, phase_of_channel):
        ls = styles[0] if label.startswith("HIN") else styles[1]
        ax.step(t, full[ch][a:b].astype(int) * 0.72 + y, where="post",
                lw=1.0, color=COLORS[phase], linestyle=ls, label=label)
    ax.set_yticks([y + 0.35 for y in y_positions], LABELS)
    ax.set_xlim(start_ms / 1000, end_ms / 1000)
    ax.set_ylim(-0.25, 6.1)
    ax.set_xlabel("Time (s)")
    ax.set_title("Raw six gate-driver inputs across HLF -> HFL: solid = HIN, dashed = LIN", fontweight="bold")
    ax.grid(axis="x", alpha=0.18)

    # 3) 24 MHz detail: A high-side 5 %, B low side 100 %, C floating
    ax = fig.add_subplot(gs[2])
    n = min(int(fast_rate * 0.0002), min(len(v) for v in fast.values()))
    t_fast = np.arange(n) / fast_rate * 1e6
    y_positions = [5, 4, 3, 2, 1, 0]
    for ch, label, y, phase in zip(CH, LABELS, y_positions, phase_of_channel):
        ls = styles[0] if label.startswith("HIN") else styles[1]
        ax.step(t_fast, fast[ch][:n].astype(int) * 0.72 + y, where="post",
                lw=1.1, color=COLORS[phase], linestyle=ls, label=label)
    ax.set_yticks([y + 0.35 for y in y_positions], LABELS)
    ax.set_xlim(t_fast[0], t_fast[-1])
    ax.set_ylim(-0.25, 6.1)
    ax.set_xlabel("Time (us) at 24 MHz sampling")
    ax.set_title("High-resolution detail, state HLF: A HIN = 5.008 %, B LIN = 100 %, C floating",
                 fontweight="bold")
    ax.grid(axis="x", alpha=0.18)

    fig.suptitle("F005 corrected independent six-step output - logic analyzer data, no bus, BUILD_ID = 2",
                 fontsize=17, fontweight="bold")
    out = ROOT / "plots" / "final_independent_six_step_result.png"
    out.parent.mkdir(exist_ok=True)
    fig.savefig(out, dpi=170)
    plt.close(fig)
    print(out)


if __name__ == "__main__":
    main()
