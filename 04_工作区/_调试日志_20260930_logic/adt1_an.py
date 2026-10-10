import re, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\04_工作区\_调试日志_20260930_logic\adt1.vcd'
lines = open(p, encoding='utf-8', errors='replace').read().splitlines()
ids = {}; scale = 1e-6
for line in lines[:40]:
    m = re.match(r'\$var\s+wire\s+\d+\s+(\S+)\s+(\S+)\s*\$end', line)
    if m: ids[m.group(1)] = m.group(2)
tok = re.compile(r'([01xz])(\S+)')
events=[]; cur_t=0
for line in lines:
    line=line.strip()
    if not line: continue
    if line[0]=='#':
        m=re.match(r'(\d+)(.*)$', line[1:]); cur_t=int(m.group(1))
        for v,ch in tok.findall(m.group(2)):
            if ch in ids: events.append((cur_t*scale, ids[ch], v))
    elif line[0] in '01xz':
        v,ch=line[0],line[1:].strip()
        if ch in ids: events.append((cur_t*scale, ids[ch], v))
per=defaultdict(list)
for t,ch,v in events: per[ch].append((t,v))
tend = max(e[0] for e in events)
print('capture len %.3f s' % tend)
BIN=0.2
print(' t(s)     D0 pulses/duty     D1 pulses/duty      period(us) D0')
for b in range(0, int(tend/BIN)+1):
    b0=b*BIN; b1=b0+BIN
    out=[]
    for n in ['D0','D1']:
        ev=per[n]; rises=0; hi=0.0; st=0
        for (t,v) in ev:
            if t<=b0: st=1 if v=='1' else 0
            else: break
        last=b0
        for (t,v) in ev:
            if b0<=t<b1:
                if v=='1': rises+=1
                if st: hi+=t-last
                st=1 if v=='1' else 0
                last=t
        if st: hi+=b1-last
        out.append((rises, hi/BIN*100))
    d0r,d0d = out[0]; d1r,d1d = out[1]
    per_us = (BIN*1e6/d0r) if d0r else 0
    print(f'{b0:5.2f}   {d0r:5d}/{d0d:5.1f}%      {d1r:5d}/{d1d:5.1f}%      {per_us:6.1f}')
