#!/usr/bin/env python3
from __future__ import annotations
import argparse
import re
import subprocess
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

SIGROK = Path(r"C:\Program Files\sigrok\sigrok-cli\sigrok-cli.exe")
CH = [f"D{i}" for i in range(6)]
LABELS = ["HIN1", "LIN1", "HIN2", "LIN2", "HIN3", "LIN3"]
PAIRS = ((0, 1), (2, 3), (4, 5))
EXPECTED = ["HLF", "HFL", "FHL", "LHF", "FLH", "LFH"]


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


def plot_six_states(capture_dir: Path, out: Path):
    states = ["HLF", "HFL", "FHL", "LHF", "LFH", "FLH"]
    fig, axes = plt.subplots(3, 2, figsize=(16, 12), constrained_layout=True)
    for ax, state in zip(axes.flat, states):
        path = capture_dir / (f"step_{state}_verified_24m_20ms.sr" if state == "HFL" else f"step_{state}_24m_20ms.sr")
        rate, d = load(path)
        hi_idx = state.index("H")
        hin = d[CH[2 * hi_idx]]
        edges = np.flatnonzero(hin[1:] != hin[:-1]) + 1
        rises = [e for e in edges if hin[e]]
        edge = next((e for e in rises if e >= int(0.005 * rate)), rises[0])
        start = max(0, edge - int(5e-6 * rate))
        count = int(50e-6 * rate)
        sl = slice(start, start + count)
        t = (np.arange(count) - (edge - start)) / rate * 1e6
        phase_style = {
            "A": (0, 1, 2.1, "#1f77b4"),
            "B": (2, 3, 1.1, "#d62728"),
            "C": (4, 5, 0.1, "#2ca02c"),
        }
        for phase, (hi, lo, y, color) in phase_style.items():
            ax.step(t, d[CH[hi]][sl].astype(float)*0.55 + y, where="post",
                    lw=1.35, color=color, label=f"{phase} HIN")
            ax.step(t, d[CH[lo]][sl].astype(float)*0.55 + y, where="post",
                    lw=1.35, color=color, linestyle="--", label=f"{phase} LIN")
        ax.set_yticks([0.38, 1.38, 2.38], ["C phase", "B phase", "A phase"])
        ax.set_xlim(t[0], t[-1])
        ax.set_ylim(-0.25, 2.95)
        ax.grid(axis="x", alpha=0.25)
        ax.set_title(f"State {state}: A={state[0]}, B={state[1]}, C={state[2]}", fontweight="bold")
        ax.set_xlabel("Time from HIN rising edge (µs)")
    fig.suptitle("F005 real 24 MHz short captures aligned to high-side rising edge", fontsize=16, fontweight="bold")
    handles, labels = axes.flat[0].get_legend_handles_labels()
    fig.legend(handles, labels, ncol=6, loc="lower center", bbox_to_anchor=(0.5, -0.01))
    fig.savefig(out, dpi=180)
    plt.close(fig)


def plot_deadtime(capture_dir: Path, out: Path):
    rate, d = load(capture_dir / "step_HLF_24m_20ms.sr")
    base = int(0.005 * rate)
    d0, d1 = d["D0"], d["D1"]
    edges = np.flatnonzero(d0[base+1:] != d0[base:-1]) + base + 1
    # Pick a falling D0 edge where LIN1 rises soon after.
    edge = None
    for e in edges:
        if not d0[e] and d1[min(e+40, len(d1)-1)]:
            edge = e; break
    if edge is None:
        edge = edges[len(edges)//2]
    left = max(0, edge - int(2e-6 * rate))
    right = min(len(d0), edge + int(2e-6 * rate))
    t = (np.arange(left, right) - edge) / rate * 1e9
    fig, ax = plt.subplots(figsize=(12, 4.5), constrained_layout=True)
    ax.step(t, d0[left:right].astype(int) + 1.8, where="post", lw=2, label="HIN1 / D0")
    ax.step(t, d1[left:right].astype(int), where="post", lw=2, label="LIN1 / D1")
    both_low = ~(d0[left:right] | d1[left:right])
    runs = []
    run_start = None
    for i, low in enumerate(both_low):
        if low and run_start is None:
            run_start = i
        if run_start is not None and (not low or i == len(both_low) - 1):
            run_end = i if not low else i + 1
            runs.append((run_end - run_start, run_start, run_end))
            run_start = None
    if runs:
        _, rs, re = max(runs)
        ax.axvspan(t[rs], t[re - 1], color="#d62728", alpha=0.18, label="dead time")
    ax.set_yticks([0.2, 0.8, 2.0, 2.6], ["LIN1=0", "LIN1=1", "HIN1=0", "HIN1=1"])
    ax.set_xlim(t[0], t[-1])
    ax.set_xlabel("Time around switching edge (ns)")
    ax.set_title("F005 complementary PWM dead-time (measured ~458–500 ns)", fontweight="bold")
    ax.grid(alpha=0.25)
    ax.legend(loc="upper right")
    fig.savefig(out, dpi=180)
    plt.close(fig)


def classify(hi, lo):
    if lo < 0.01:
        return "F" if hi < 0.01 else "?"
    if 0.02 <= hi <= 0.08 and 0.90 <= lo <= 0.96:
        return "H"
    if hi < 0.015 and lo > 0.96:
        return "L"
    return "?"


def plot_sequence(capture_dir: Path, out: Path):
    path = capture_dir / "ramp_sequence_200k_6000ms.sr"
    rate, d = load(path)
    win = rate // 10
    colors = {"H": "#2ca02c", "L": "#ff7f0e", "F": "#bdbdbd"}
    fig, ax = plt.subplots(figsize=(16, 5.5), constrained_layout=True)
    rows = []
    for n in range(0, len(d["D0"]) - win + 1, win):
        states = []
        for hi, lo in PAIRS:
            states.append(classify(d[CH[hi]][n:n+win].mean(), d[CH[lo]][n:n+win].mean()))
        rows.append((n / rate, "".join(states)))
    for idx, label in enumerate(["A", "B", "C"]):
        y = 2 - idx
        ax.text(-0.08, y, label, ha="right", va="center", fontweight="bold")
        for j, (t0, state) in enumerate(rows):
            if state[idx] not in colors:
                continue
            t1 = rows[j+1][0] if j+1 < len(rows) else len(d["D0"]) / rate
            ax.axvspan(t0, t1, ymin=(y-0.28)/3.6, ymax=(y+0.28)/3.6,
                       color=colors[state[idx]], linewidth=0)
    ax.set_xlim(0, len(d["D0"]) / rate)
    ax.set_ylim(-0.6, 2.8)
    ax.set_yticks([])
    ax.set_xlabel("Capture time (s)")
    ax.set_title("F005 six-step phase-state timeline: H=high-side PWM, L=low-side on, F=floating", fontweight="bold")
    ax.legend(handles=[Patch(color=colors[k], label=k) for k in "HLF"], ncol=3, loc="upper right")
    ax.grid(axis="x", alpha=0.2)
    fig.savefig(out, dpi=180)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("capture_dir", type=Path)
    args = ap.parse_args()
    plots = args.capture_dir / "plots"
    plots.mkdir(exist_ok=True)
    plot_six_states(args.capture_dir, plots / "six_step_waveforms.png")
    plot_deadtime(args.capture_dir, plots / "deadtime_zoom.png")
    plot_sequence(args.capture_dir, plots / "six_step_timeline.png")
    print(plots / "six_step_waveforms.png")
    print(plots / "deadtime_zoom.png")
    print(plots / "six_step_timeline.png")


if __name__ == "__main__":
    main()
