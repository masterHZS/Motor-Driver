"""Shared helper: list all flashed pads from a Gerber layer."""
import re, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerber_strict import parse


def flashes(path):
    raw, div, aps = parse(path)
    out, cur = [], None
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith(('G04', '%', 'G36', 'G37')):
            continue
        m = re.match(r'^(?:G0?([123]))?(?:X(-?\d+))?(?:Y(-?\d+))?(?:I(-?\d+))?(?:J(-?\d+))?D0?([123])', line, re.I)
        if not m or m.group(6) is None:
            s = re.fullmatch(r'(?:G5?4)?D(\d+)\*?', line, re.I)
            if s and int(s.group(1)) >= 10:
                cur = int(s.group(1))
            continue
        if int(m.group(6)) == 3 and m.group(2) and m.group(3) and cur is not None:
            kind, prm = aps.get(cur, ('?', []))
            out.append((kind, [round(v, 3) for v in prm],
                        int(m.group(2)) / div, int(m.group(3)) / div))
        tail = line[m.end():].replace('*', '').strip()
        if tail.isdigit():
            cur = int(tail)
    return out


def rect_of(kind, p, x, y):
    if kind == 'C':
        r = p[0] / 2
        return (x - r, y - r, x + r, y + r)
    w = p[0]; h = p[1] if len(p) > 1 else p[0]
    return (x - w/2, y - h/2, x + w/2, y + h/2)


if __name__ == '__main__':
    p = sys.argv[1]
    dx = float(sys.argv[2]); dy = float(sys.argv[3]); r = float(sys.argv[4])
    for kind, pr, x, y in sorted(flashes(p), key=lambda t: (round(t[3], 2), t[2])):
        if abs(x - dx) <= r and abs(y - dy) <= r:
            w = pr[0] if pr else 0
            h = pr[1] if len(pr) > 1 else w
            print(f"   X{x:8.2f} Y{y:9.2f}  {kind} {w:6.3f} x {h:6.3f}")
