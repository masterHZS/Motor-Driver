import json, re, heapq, os, sys
BASE = r'C:\Users\limer\Desktop\motor-driver'
EXPORT_DIR = os.path.join(BASE, r'06_参考资料\EasyEDA导出')
COMP_PATH = os.path.join(EXPORT_DIR, 'easyeda_components_current.json')
NET_PATH = os.path.join(BASE, r'01_PCB\01_工程\motor-driver-V3.1.net')
POS_PATH = os.path.join(EXPORT_DIR, 'easyeda_module_positions_compact.json')
BOX_PATH = os.path.join(EXPORT_DIR, 'easyeda_module_boxes_compact.json')
STEP = 5
DIRS = [(1,0),( -1,0),(0,1),(0,-1)]
PIN_DIR = {0:(1,0),90:(0,1),180:(-1,0),270:(0,-1)}
POWER_NETS = {'VCC','VCC_BUS','VDD_3V3','VDD_LDO'}
GROUND_KIND = {'PGND':'ProtectGround','AGND':'AnalogGround'}
def snap(v): return int(round(v/STEP))*STEP
def load():
    comps=json.load(open(COMP_PATH,encoding='utf-8'))['result']['components']
    pos=json.load(open(POS_PATH,encoding='utf-8')); boxes={b['group']:b for b in json.load(open(BOX_PATH,encoding='utf-8'))}; grp={e['d']:e['group'] for e in pos['positions']}; text=open(NET_PATH,encoding='utf-8').read(); valid={c['d'] for c in comps}; nets=[]
    for name,body in re.findall(r'\(net \(code "\d+"\) \(name "([^"]+)"\)(.*?)(?=\(net \(code|\Z)',text,re.S):
        nodes=[(r,str(p)) for r,p in re.findall(r'\(node \(ref "([^"]+)"\) \(pin "([^"]+)"\)\)',body) if r in valid]
        if nodes: nets.append({'name':name,'nodes':nodes})
    return comps,grp,boxes,nets
def build_obstacles(module, comps, grp):
    blocked=set()
    for c in comps:
        if grp.get(c['d'])!=module: continue
        xs=[snap(p['x']) for p in c['pins']]; ys=[snap(p['y']) for p in c['pins']]
        if not xs: continue
        x0=min(xs)-8; x1=max(xs)+8; y0=min(ys)-8; y1=max(ys)+8
        for x in range(snap(x0),snap(x1)+1,STEP):
            for y in range(snap(y0),snap(y1)+1,STEP):
                if x0<x<x1 and y0<y<y1: blocked.add((x,y))
    return blocked
def astar(start,tree,blocked,tile,allowed,wire_blocked):
    x0,y0=tile['x']+STEP,tile['y']-tile['h']+STEP; x1,y1=tile['x']+tile['w']-STEP,tile['y']-STEP; goals=set(tree); allowed=set(allowed)
    def h(p): return min(abs(p[0]-g[0])+abs(p[1]-g[1]) for g in goals)
    q=[(h(start),0,start)]; dist={start:0}; came={start:None}
    while q:
        _,g,p=heapq.heappop(q)
        if g!=dist.get(p): continue
        if p in goals:
            path=[]; z=p
            while z is not None: path.append(z); z=came[z]
            return path[::-1]
        for dx,dy in DIRS:
            n=(p[0]+dx*STEP,p[1]+dy*STEP)
            if not(x0<=n[0]<=x1 and y0<=n[1]<=y1): continue
            if n not in allowed and (n in blocked or n in wire_blocked): continue
            ng=g+1
            if ng<dist.get(n,10**9): dist[n]=ng; came[n]=p; heapq.heappush(q,(ng+h(n),ng,n))
    return None
def compress(path):
    if len(path)<3:return path
    out=[path[0]]
    for p in path[1:]:
        if len(out)>=2:
            a,b=out[-2],out[-1]
            if (b[0]-a[0])*(p[1]-b[1])==(b[1]-a[1])*(p[0]-b[0]): out[-1]=p
            else: out.append(p)
        else: out.append(p)
    return out
def route_module(module):
    comps,grp,boxes,nets=load(); tile=boxes[module]
    pinmap={(c['d'],str(p['n'])):{'ref':c['d'],'num':str(p['n']),'x':snap(p['x']),'y':snap(p['y']),'rot':int(p['rot'])} for c in comps for p in c['pins']}
    nets_mod=[]
    for n in nets:
        pts=[pinmap[k] for k in n['nodes'] if grp[k[0]]==module]
        if pts: nets_mod.append({'name':n['name'],'points':pts,'mods':sorted(set(grp[r] for r,p in n['nodes']))})
    blocked=build_obstacles(module,comps,grp); wire_blocked=set(); wires=[]; ports=[]
    nets_mod.sort(key=lambda n:(0 if (n['name'] in POWER_NETS or n['name'] in GROUND_KIND) else 1,-len(n['points']),n['name']))
    for net in nets_mod:
        pts=net['points']; cross=len(net['mods'])>1
        if len(pts)==1:
            if cross: ports.append({'name':net['name'],'points':[pts[0]]})
            continue
        root=pts[0]; d=PIN_DIR.get(root['rot'],(0,0)); rv=(root['x']+d[0]*10,root['y']+d[1]*10); tree={(root['x'],root['y']),rv}; route_paths=[[(root['x'],root['y']),rv]]; allowed={(p['x'],p['y']) for p in pts}; rem=pts[1:]; rem.sort(key=lambda p:abs(p['x']-root['x'])+abs(p['y']-root['y'])); failed=False
        while rem:
            p=rem.pop(0); d=PIN_DIR.get(p['rot'],(0,0)); st=(p['x']+d[0]*10,p['y']+d[1]*10)
            if st in tree: path=[(p['x'],p['y']),st]
            else:
                path=astar(st,tree,blocked,tile,allowed|{st},wire_blocked)
                if not path: failed=True; break
                path=[(p['x'],p['y'])]+path
            cp=compress(path); route_paths.append(cp); tree.update(cp)
        if failed:
            ports.append({'name':net['name'],'points':pts}); continue
        wire_blocked.update(tree); wires.append({'net':net['name'],'paths':[[c for xy in p for c in xy] for p in route_paths]})
        if cross: ports.append({'name':net['name'],'points':[root]})
    return {'module':module,'wires':wires,'ports':ports}
if __name__=='__main__':
    mod=sys.argv[1] if len(sys.argv)>1 else 'LDO_3V3'; print(json.dumps(route_module(mod),ensure_ascii=False,indent=2))
