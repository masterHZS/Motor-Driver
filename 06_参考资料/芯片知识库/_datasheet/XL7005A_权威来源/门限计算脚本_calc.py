R15 = 130e3; R16 = 15e3
Vth_off = 1.6   # EN High  -> Regulator OFF (typ)
Vth_on  = 0.8   # EN Low   -> Regulator ON  (typ)

# EN input leakage: IH typ 6uA @2.5V ; max 20uA @2.5V ; IL typ 1uA @0.5V
Rleak = {'ideal (no loading/leakage)': None,
         'typ leakage (6uA@2.5V -> 417k)': 2.5/6e-6,
         'worst-case leakage (20uA@2.5V -> 125k)': 2.5/20e-6}

print("="*84)
print("V_EN node ratio  Ven/Vbus  with R15=130k, R16=15k")
print("="*84)
res={}
for k,rl in Rleak.items():
    g = 1/R15 + 1/R16 + (0 if rl is None else 1/rl)
    ratio = (1/R15)/g
    res[k]=ratio
    print(f"  {k:42s} ratio={ratio:.6f}   Ven@9V={9*ratio:.3f}V  Ven@12.6V={12.6*ratio:.3f}V  Ven@16.8V={16.8*ratio:.3f}V")

print()
print("="*84)
print("Actual bus thresholds (typ EN thresholds)")
print("="*84)
for k,ratio in res.items():
    print(f"  {k}")
    print(f"      regulator OFF above Vbus = 1.6/ratio = {1.6/ratio:7.2f} V")
    print(f"      regulator ON  below Vbus = 0.8/ratio = {0.8/ratio:7.2f} V")
    print(f"      UNDEFINED band                {0.8/ratio:6.2f} V .. {1.6/ratio:6.2f} V")

print()
print("="*84)
print("Design claim vs reality at Vbus = 1.25*(130+15)/15")
print("="*84)
Vclaim = 1.25*(R15+R16)/R16
print(f"  claimed UVLO turn-on point = {Vclaim:.3f} V")
for k,ratio in res.items():
    print(f"  at that bus voltage Ven = {Vclaim*ratio:.3f} V  ({k}) -> inside undefined band? {0.8 < Vclaim*ratio < 1.6}")

print()
print("="*84)
print("3S / 4S bus coverage")
print("="*84)
for name,(lo,hi) in {'3S (9.0-12.6V)':(9.0,12.6),'4S (12.0-16.8V)':(12.0,16.8)}.items():
    print(f"  {name}")
    for k,ratio in res.items():
        print(f"      Ven range = {lo*ratio:.2f}..{hi*ratio:.2f} V  ({k})")

print()
print("="*84)
print("Option: keep regulator ALWAYS ON (guarantee Ven < 0.8V at Vbus=16.8V)")
print("="*84)
for target in (0.8, 0.4, 0.2):
    ratio = target/16.8
    R16max = R15*ratio/(1-ratio)
    print(f"  target Ven <= {target} V at 16.8V -> ratio <= {ratio:.4f} -> R16 <= {R16max:8.0f} ohm")

print()
print("="*84)
print("Option: invert with NPN, keep R16=15k as Rb, find Ra for UVLO at 12.1V")
print("="*84)
for Vbe in (0.60,0.65,0.70):
    Ra = (12.1/Vbe - 1)*R16
    print(f"  Vbe={Vbe:.2f}V -> Ra = {Ra:8.0f} ohm  (E24 near: 270k/240k/220k)")
print("  with Ra=270k, R16=15k: V_A = Vbus*15/285")
for Vbe in (0.60,0.65,0.70):
    print(f"      UVLO trip at Vbe={Vbe:.2f}V -> Vbus = {Vbe*285/15:.2f} V")

print()
print("="*84)
print("Buck headroom for Vout=12.1V (R2=8.66k, R1=1k)")
print("="*84)
for R2,R1 in ((8.66e3,1e3),):
    nom = 1.25*(1+R2/R1)
    print(f"  Vout nom = {nom:.3f} V ; VFB tol 1.225..1.275 -> Vout = {1.225*(1+R2/R1):.3f}..{1.275*(1+R2/R1):.3f} V")
print("  Rev1.9 min dropout 2V  -> Vin_min = %.1f V" % (12.1+2))
print("  Rev1.0 min dropout 1V  -> Vin_min = %.1f V" % (12.1+1))
print("  Rev1.9 Dmax 90%%        -> Vin_min ~ %.1f V (before losses)" % (12.1/0.90))
print("  Rev1.0 Dmax 100%%       -> Dmax not the limit")
