#!/usr/bin/env python3
"""Sweep the reset-release delay while the XHSC ISP tool tries to connect."""
import subprocess, sys, time
from pathlib import Path
from pyocd.core.helpers import ConnectHelper

TOOL_DIR = Path(r'C:\Users\limer\Desktop\motor-driver\04_工作区\tools\XHSC_ISP_V2.23\XHSC ISP')
TOOL = TOOL_DIR / 'XHSC.exe'
OUT = TOOL_DIR / '_loop_out.txt'
OP = 'B'
# UTF-8 bytes of the failure message prefix ("lian jie bu cheng gong")
FAIL = '连接不成功'.encode('utf-8')

s = ConnectHelper.session_with_chosen_probe(target_override='hc32f005', connect_mode='attach')
probe = s.probe
probe.open()
print('probe opened, reset controlled via DAPLink', flush=True)

delays = [round(0.02 + 0.02 * i, 2) for i in range(30)]
ok = False
try:
    for attempt, delay in enumerate(delays, 1):
        probe.assert_reset(True)
        time.sleep(0.02)
        with open(OUT, 'wb') as fout:
            p = subprocess.Popen([str(TOOL), OP], cwd=str(TOOL_DIR), stdout=fout, stderr=subprocess.STDOUT)
            t0 = time.time()
            time.sleep(delay)
            probe.assert_reset(False)
            rel = time.time() - t0
            p.wait(timeout=25)
        raw = OUT.read_bytes()
        txt = raw.decode('utf-8', errors='replace').strip().replace('\r', ' ').replace('\n', ' | ')
        good = bool(raw.strip()) and (FAIL not in raw)
        print('[%2d] release@%.2fs  %s  %s' % (attempt, rel, 'OK!' if good else 'fail', txt[:120]), flush=True)
        if good:
            ok = True
            break
        time.sleep(0.05)
finally:
    try:
        probe.assert_reset(False)
    except Exception:
        pass
    probe.close()
print('RESULT:', 'CONNECTED' if ok else 'no connection in %d attempts' % len(delays))
sys.exit(0 if ok else 1)
