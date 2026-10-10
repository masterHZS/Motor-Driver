import re, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\limer\Desktop\motor-driver\04_工作区\_调试日志_20260930_logic\spin6.vcd'
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
for n in ['D0','D1','D2','D3','D4','D5']:
    print(n, len(per[n]), 'edges, first', per[n][0][0] if per[n] else '-', 'last', per[n][-1][0] if per[n] else '-')
chans=['D0','D1','D2','D3','D4','D5']
BIN=0.1
print(' t(s)  ' + ' '.join(f'{n:>9s}' for n in chans) + '   (pulses/duty%)')
for b in range(0, 36):
    b0=b*BIN; b1=b0+BIN
    row=[]
    for n in chans:
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
        row.append(f'{rises:4d}/{hi/BIN*100:3.0f}%')
    print(f'{b0:5.1f}  ' + ' '.join(f'{r:>9s}' for r in row))
