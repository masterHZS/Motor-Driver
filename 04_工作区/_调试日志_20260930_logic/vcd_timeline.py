import re, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\04_工作区\_调试日志_20260930_logic\spin3.vcd'
lines = open(p, encoding='utf-8', errors='replace').read().splitlines()

ids = {}
scale = 1e-6
for i, line in enumerate(lines[:40]):
    m = re.match(r'\$var\s+wire\s+\d+\s+(\S+)\s+(\S+)\s*\$end', line)
    if m:
        ids[m.group(1)] = m.group(2)
    m2 = re.match(r'\$timescale\s+(\d+)\s*(\w+)', line)
    if m2:
        mult = {'s':1, 'ms':1e-3, 'us':1e-6, 'ns':1e-9, 'ps':1e-12}[m2.group(2)]
        scale = int(m2.group(1)) * mult
print('header scale =', scale, 's/unit;  channels =', ids)

tok = re.compile(r'([01xz])(\S+)')
events = []
cur_t = 0
for line in lines:
    line = line.strip()
    if not line: continue
    if line[0] == '#':
        m = re.match(r'(\d+)(.*)$', line[1:])
        cur_t = int(m.group(1))
        for v, ch in tok.findall(m.group(2)):
            if ch in ids: events.append((cur_t*scale, ids[ch], v))
    elif line[0] in '01xz':
        v, ch = line[0], line[1:].strip()
        if ch in ids: events.append((cur_t*scale, ids[ch], v))

t_end = max(e[0] for e in events)
print('capture length: %.3f s' % t_end)
per = defaultdict(list)
for t, ch, v in events: per[ch].append((t, v))
for name in sorted(per): 
    print(f'  {name}: {len(per[name])} edges')
active = [n for n in per if len(per[n]) > 50]
print('active channels:', active)

# find active window
t0 = min(per[n][0][0] for n in active); t1 = max(per[n][-1][0] for n in active)
print('active window: %.3f .. %.3f s (%.3f s)' % (t0, t1, t1-t0))

# timeline in 100 ms bins: rising edges + duty per channel
BIN = 0.1
nb = int((t1-t0)/BIN)+1
print('\nbin  ' + '  '.join(f'{n:>10s}' for n in ['D0','D1','D2','D3','D4','D5']))
levels = {n: 0 for n in per}
idx = {n: 0 for n in per}
for b in range(nb):
    b0, b1 = t0+b*BIN, t0+(b+1)*BIN
    stats = {}
    for n in ['D0','D1','D2','D3','D4','D5']:
        ev = per[n]
        rises = sum(1 for (t,v) in ev if b0 <= t < b1 and v=='1')
        falls = sum(1 for (t,v) in ev if b0 <= t < b1 and v=='0')
        # duty: integrate high time within the bin
        hi = 0.0
        prev_t, prev_v = None, None
        # find state at b0
        st = 0
        for (t,v) in ev:
            if t <= b0: st = 1 if v=='1' else 0
            else: break
        last_t = b0
        for (t,v) in ev:
            if b0 <= t < b1:
                if st: hi += t-last_t
                st = 1 if v=='1' else 0
                last_t = t
        if st: hi += b1-last_t
        stats[n] = (rises, hi/BIN*100)
    print(f'{b*BIN:5.1f} ' + '  '.join(f'{stats[n][0]:4d}/{stats[n][1]:3.0f}%' for n in ['D0','D1','D2','D3','D4','D5']))
