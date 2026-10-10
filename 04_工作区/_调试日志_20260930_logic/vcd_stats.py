import re, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\04_工作区\_调试日志_20260930_logic\spin3.vcd'
lines = open(p, encoding='utf-8', errors='replace').read().splitlines()

ids = {}
timescale = None
for line in lines:
    m = re.match(r'\$var\s+wire\s+\d+\s+(\S+)\s+(\S+)\s*\$end', line)
    if m:
        ids[m.group(1)] = m.group(2)
    m2 = re.match(r'\$timescale\s+(\S+)\s*\$end', line)
    if m2:
        timescale = m2.group(1)
print('channels:', ids, 'timescale:', timescale)

# collect transitions: list of (t, ch, val) with t in timescale units
events = []   # (t, ch, val)
cur_t = 0
cur = {ch: 'x' for ch in ids}
for line in lines:
    line = line.strip()
    if not line:
        continue
    if line[0] == '#':
        cur_t = int(line[1:])
        continue
    if line[0] in '01xz':
        val, ch = line[0], line[1:].strip()
        if ch in ids:
            events.append((cur_t, ch, val))
            cur[ch] = val

print('total events:', len(events))
per = defaultdict(list)
for t, ch, v in events:
    per[ch].append((t, v))
for ch, name in sorted(ids.items(), key=lambda kv: kv[1]):
    ev = per.get(ch, [])
    if not ev:
        print(f'{name}: no activity')
        continue
    t_first, t_last = ev[0][0], ev[-1][0]
    print(f'{name}: {len(ev)} edges, first={t_first} last={t_last}')
