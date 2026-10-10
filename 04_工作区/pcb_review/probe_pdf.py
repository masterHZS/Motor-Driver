"""Probe PDF structure using only the Python standard library."""
import re, sys, zlib, os

def load(path):
    with open(path, 'rb') as f:
        return f.read()

def find_streams(data):
    """Yield (dict_text, raw_stream_bytes) for every stream object."""
    out = []
    for m in re.finditer(rb'<<(.*?)>>\s*stream\r?\n', data, re.S):
        d = m.group(1)
        start = m.end()
        e = data.find(b'endstream', start)
        if e < 0:
            continue
        out.append((d, data[start:e]))
    return out

def decode(d, raw):
    if b'FlateDecode' in d:
        try:
            return zlib.decompress(raw)
        except Exception:
            try:
                return zlib.decompressobj().decompress(raw)
            except Exception:
                return None
    return raw

for path in sys.argv[1:]:
    data = load(path)
    streams = find_streams(data)
    print("=" * 78)
    print(os.path.basename(path), "size", len(data), "streams", len(streams))
    print("  header:", data[:16])
    total_ops = 0
    for i, (d, raw) in enumerate(streams[:6]):
        dec = decode(d, raw)
        if dec is None:
            print(f"  stream[{i}] dict={d[:90]!r} rawlen={len(raw)} DECODE-FAIL")
            continue
        ops = re.findall(rb'\b(re|f|S|B|W|m|l|c|v|y|h|rg|RG|g|G|k|K|cm|q|Q|BT|ET|Tj|TJ|Do|sh)\b', dec)
        from collections import Counter
        c = Counter(o.decode() for o in ops)
        total_ops += len(ops)
        print(f"  stream[{i}] dict={d[:70]!r}")
        print(f"      declen={len(dec)} ops={len(ops)} top={c.most_common(12)}")
        if i == 0:
            print("      head:", dec[:300])
    print("  total ops (first 6 streams):", total_ops)
