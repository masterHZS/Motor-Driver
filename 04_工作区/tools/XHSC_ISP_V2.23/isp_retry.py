#!/usr/bin/env python3
"""Retry XHSC ISP connect while pulsing target reset via the DAPLink nRESET line."""
import subprocess, sys, time
from pathlib import Path
from pyocd.core.helpers import ConnectHelper

TOOL_DIR = Path(r'C:\Users\limer\Desktop\motor-driver\04_工作区\tools\XHSC_ISP_V2.23\XHSC ISP')
TOOL = TOOL_DIR / 'XHSC.exe'
OUT = TOOL_DIR / '_loop_out.txt'
MAX_ATTEMPTS = int(sys.argv[1]) if len(sys.argv) > 1 else 24
OP = sys.argv[2] if len(sys.argv) > 2 else 'B'

s = ConnectHelper.session_with_chosen_probe(target_override='hc32f005', connect_mode='attach')
probe = s.probe
probe.open()
print('probe opened; reset is controlled through the DAPLink nRESET line')

delays = [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
ok = False
try:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        delay = delays[(attempt - 1) % len(delays)]
        probe.assert_reset(True)
        time.sleep(0.03)
        with open(OUT, 'wb') as fout:
            p = subprocess.Popen([str(TOOL), OP], cwd=str(TOOL_DIR), stdout=fout, stderr=subprocess.STDOUT)
            t0 = time.time()
            time.sleep(delay)
            probe.assert_reset(False)
            rel = time.time() - t0
            p.wait(timeout=25)
        t = OUT.read_bytes().decode('gbk', errors='replace').strip()
        flat = t.replace('\r', ' ').replace('\n', ' | ')
        print('[%2d] release@%.2fs -> %s' % (attempt, rel, flat), flush=True)
        if t and ('连接不成功' not in t or 'BlankCheck' in t or '擦除' in t or 'RamCode' in t or 'Query' in t or 'Jump' in t or 'pattern' in t or 'ChipReset' in t):
            ok = True
            break
        time.sleep(0.1)
finally:
    try:
        probe.assert_reset(False)
    except Exception:
        pass
    probe.close()

print('SUCCESS: ISP connection established' if ok else 'no luck in %d attempts' % MAX_ATTEMPTS)
sys.exit(0 if ok else 1)
