import re, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\04_工作区\_调试日志_20260930_logic\spin13.vcd'
lines = open(p, encoding='utf-8', errors='replace').read().splitlines()
ids={}
for line in lines[:40]:
    m=re.match(r'\$var\s+wire\s+\d+\s+(\S+)\s+(\S+)\s*\$end', line)
    if m: ids[m.group(1)]=m.group(2)
tok=re.compile(r'([01xz])(\S+)'); events=[]; cur_t=0
for line in lines:
    line=line.strip()
    if not line: continue
    if line[0]=='#':
        m=re.match(r'(\d+)(.*)$', line[1:]); cur_t=int(m.group(1))
        for v,ch in tok.findall(m.group(2)):
            if ch in ids: events.append((cur_t*1e-6, ids[ch], v))
    elif line[0] in '01xz':
        v,ch=line[0],line[1:].strip()
        if ch in ids: events.append((cur_t*1e-6, ids[ch], v))
per=defaultdict(list)
for t,ch,v in events: per[ch].append((t,v))
tend=max(e[0] for e in events)
BIN=0.1; rows=[]
for b in range(0,int(tend/BIN)+1):
    b0=b*BIN; b1=b0+BIN; vals=[]
    for n in ['D0','D1','D2','D3','D4','D5']:
        ev=per[n]; r=0; hi=0.0; st=0
        for (t,v) in ev:
            if t<=b0: st=1 if v=='1' else 0
            else: break
        last=b0
        for (t,v) in ev:
            if b0<=t<b1:
                if v=='1': r+=1
                if st: hi+=t-last
                st=1 if v=='1' else 0
                last=t
        if st: hi+=b1-last
        vals.append((r,hi/BIN*100))
    rows.append((b0,vals))
first=next((i for i,(t0,v) in enumerate(rows) if v[0][0]>100),0)
print('capture %.2f s; first PWM %.1f s' % (tend, rows[first][0]))
for t0,v in rows[max(0,first-2):min(len(rows),first+18)]:
    print(f'{t0:5.1f}  ' + '  '.join(f'{r:4d}/{d:3.0f}%' for r,d in v))
