import re, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\04_工作区\_调试日志_20260930_logic\spin3.vcd'
lines = open(p, encoding='utf-8', errors='replace').read().splitlines()

ids = {}
for line in lines:
    m = re.match(r'\$var\s+wire\s+\d+\s+(\S+)\s+(\S+)\s*\$end', line)
    if m:
        ids[m.group(1)] = m.group(2)

events = []
cur_t = 0
tok = re.compile(r'([01xz])(\S+)')
for line in lines:
    line = line.strip()
    if not line:
        continue
    if line[0] == '#':
        rest = line[1:]
        m = re.match(r'(\d+)(.*)$', rest)
        cur_t = int(m.group(1))
        remainder = m.group(2)
        for v, ch in tok.findall(remainder):
            if ch in ids:
                events.append((cur_t, ids[ch], v))
    elif line[0] in '01xz':
        v, ch = line[0], line[1:].strip()
        if ch in ids:
            events.append((cur_t, ids[ch], v))

print('total events:', len(events))
per = defaultdict(list)
for t, ch, v in events:
    per[ch].append((t, v))
for name in sorted(per.keys()):
    ev = per[name]
    print(f'{name}: {len(ev)} edges  first={ev[0][0]}  last={ev[-1][0]}')

# window analysis around the active region for the most active channel
act = max(per.keys(), key=lambda k: len(per[k]))
ev = per[act]
print('\nmost active:', act, len(ev))
print('first 40 edges:', ev[:40])
