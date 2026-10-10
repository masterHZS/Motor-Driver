"""Strict line-based EasyEDA-Pro Gerber parser.

Line forms seen in these files:
  %FSLAX45Y45*%          format
  %MOMM*%                mm
  %ADD10C,0.2032*%       aperture: ADD<seq><shape>[,params]
  G01X24940514Y-10060686D02*1     move   (trailing '1' = aperture select tail)
  G01X..Y..D01*1                  draw
  G01X..Y..D03*                   flash
  G36* / G37*                     region start/end
"""
import re, os, sys, math
from collections import Counter

LINE = re.compile(r'^(?:G0?([123]))?(?:X(-?\d+))?(?:Y(-?\d+))?(?:I(-?\d+))?(?:J(-?\d+))?D0?([123])', re.I)
ADD = re.compile(r'%ADD(\d+)([A-Za-z_$][\w$]*),?([^*%]*?)\*%')


def parse(path):
    with open(path, 'r', errors='replace') as f:
        raw = f.read()
    m = re.search(r'%FSLAX(\d)(\d)Y(\d)(\d)\*%', raw)
    div = 10.0 ** (int(m.group(2)) if m else 5)
    aps = {}
    for mm in ADD.finditer(raw):
        seq = int(mm.group(1))
        shape = mm.group(2)
        prm = [float(v) for v in re.findall(r'-?\d*\.?\d+', mm.group(3) or '')]
        aps[seq] = (shape, prm)
    return raw, div, aps


def scan(path):
    raw, div, aps = parse(path)
    cur = None
    draws = Counter(); flashes = Counter()
    via_pos = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith('G04') or line.startswith('%'):
            continue
        if line.startswith('G36') or line.startswith('G37'):
            continue
        m = LINE.match(line)
        if not m or m.group(6) is None:
            # aperture-select-only line, e.g. G54D10*  /  D12*
            s = re.fullmatch(r'(?:G5?4)?D(\d+)\*?', line, re.I)
            if s and int(s.group(1)) >= 10:
                cur = int(s.group(1))
            continue
        x, y, op = m.group(2), m.group(3), int(m.group(6))
        if op == 3 and cur is not None:
            flashes[cur] += 1
            if x and y:
                via_pos.append((cur, int(x) / div, int(y) / div))
        elif op == 1 and cur is not None:
            draws[cur] += 1
        tail = line[m.end():].replace('*', '').strip()
        if tail.isdigit():
            cur = int(tail)
    return aps, draws, flashes, via_pos


if __name__ == '__main__':
    for p in sys.argv[1:]:
        aps, draws, flashes, vias = scan(p)
        print(f"=== {os.path.basename(p)} ===")
        print(f"   apertures: {len(aps)}   total draws: {sum(draws.values())}   flashes: {sum(flashes.values())}")
        print(f"   {'ap':>5} {'kind':>3} {'params(mm)':<24} {'draws':>6} {'flash':>6}")
        for code in sorted(set(list(draws) + list(flashes))):
            kind, prm = aps.get(code, ('?', []))
            print(f"   D{code:<4} {kind:>3} {str(prm):<24} {draws[code]:>6} {flashes[code]:>6}")
        print()
