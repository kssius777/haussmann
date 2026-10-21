"""Les toits de Paris pour l'écran de chargement : un SVG en silhouettes (lointain, la tour Eiffel ; milieu ; devant, avec
lucarnes et cheminées), quelques fenêtres allumées. Écrit le SVG sur stdout."""
import random
R = random.Random(75)
W, H = 1200, 360
f = lambda v: f"{v:.0f}" if abs(v - round(v)) < 1e-6 else f"{v:.1f}"
def row(y0, y1, wmin, wmax, chim, dorm, slope, x0=-20, x1=W + 20):
    """une rangée d'immeubles : toits à la Mansart (pente), cheminées, lucarnes ; rend (chemin, fenêtres allumées)"""
    pts = [(x0, H)]; wins = []; x = x0
    while x < x1:
        w = R.uniform(wmin, wmax); top = R.uniform(y0, y1); s = slope * R.uniform(.6, 1.1)
        pts += [(x, top + s), (x + s * .55, top)]
        # cheminées sur le toit
        cx = x + s * .55 + R.uniform(4, 10)
        while cx < x + w - s * .55 - 10:
            if R.random() < chim:
                cw, ch = R.uniform(6, 11), R.uniform(9, 20)
                pts += [(cx, top), (cx, top - ch), (cx + 1.5, top - ch), (cx + 1.5, top - ch - 3), (cx + cw - 1.5, top - ch - 3), (cx + cw - 1.5, top - ch), (cx + cw, top - ch), (cx + cw, top)]
                cx += cw + R.uniform(8, 22)
            else: cx += R.uniform(10, 26)
        pts += [(x + w - s * .55, top), (x + w, top + s)]
        # lucarnes dans la pente : petites maisons, une fenêtre parfois allumée
        if dorm:
            n = int((w - 2 * s) / 26)
            for k in range(n):
                if R.random() < dorm:
                    dx = x + s + 8 + k * 26; wins.append((dx + 2.5, top + s * .55, 5, 6.5, R.random() < .35))
        x += w
    pts += [(x, H)]
    d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts) + "Z"
    return d, wins
def eiffel(cx, base, h):
    """la tour Eiffel de profil : jambes évasées et grande arche, 1er et 2e étages en corniche, flèche jusqu'au 3e, antenne"""
    b = .38 * h; X = lambda u: f(cx + u * b); Y = lambda v: f(base - v * h)
    L = [f"M{X(-.5)} {Y(0)}", f"Q{X(-.36)} {Y(.07)} {X(-.25)} {Y(.165)}", f"L{X(-.275)} {Y(.165)}", f"L{X(-.275)} {Y(.182)}", f"L{X(-.205)} {Y(.182)}",
         f"Q{X(-.15)} {Y(.27)} {X(-.13)} {Y(.345)}", f"L{X(-.15)} {Y(.345)}", f"L{X(-.15)} {Y(.358)}", f"L{X(-.105)} {Y(.358)}",
         f"Q{X(-.045)} {Y(.6)} {X(-.032)} {Y(.835)}", f"L{X(-.05)} {Y(.835)}", f"L{X(-.05)} {Y(.846)}", f"L{X(-.022)} {Y(.846)}",
         f"L{X(-.014)} {Y(.93)}", f"L{X(-.005)} {Y(.95)}", f"L{X(-.005)} {Y(1)}", f"L{X(.005)} {Y(1)}", f"L{X(.005)} {Y(.95)}", f"L{X(.014)} {Y(.93)}",
         f"L{X(.022)} {Y(.846)}", f"L{X(.05)} {Y(.846)}", f"L{X(.05)} {Y(.835)}", f"L{X(.032)} {Y(.835)}", f"Q{X(.045)} {Y(.6)} {X(.105)} {Y(.358)}",
         f"L{X(.15)} {Y(.358)}", f"L{X(.15)} {Y(.345)}", f"L{X(.13)} {Y(.345)}", f"Q{X(.15)} {Y(.27)} {X(.205)} {Y(.182)}",
         f"L{X(.275)} {Y(.182)}", f"L{X(.275)} {Y(.165)}", f"L{X(.25)} {Y(.165)}", f"Q{X(.36)} {Y(.07)} {X(.5)} {Y(0)}",
         f"L{X(.31)} {Y(0)}", f"Q{X(.27)} {Y(.118)} {X(0)} {Y(.122)}", f"Q{X(-.27)} {Y(.118)} {X(-.31)} {Y(0)}Z",
         f"M{X(-.055)} {Y(.182)}L{X(0)} {Y(.3)}L{X(.055)} {Y(.182)}Z"]   # (entre le 1er et le 2e étage, les jambes sont encore séparées)
    return "".join(L)
def dome(cx, base, r):
    """un dôme lointain (le Panthéon) : le socle, le tambour à colonnes, le dôme, la lanterne"""
    return (f"M{f(cx - 1.55 * r)} {base}V{f(base - .5 * r)}H{f(cx - .78 * r)}V{f(base - 1.15 * r)}H{f(cx - .72 * r)}"
            f"A{f(.72 * r)} {f(.8 * r)} 0 0 1 {f(cx + .72 * r)} {f(base - 1.15 * r)}H{f(cx + .78 * r)}V{f(base - .5 * r)}H{f(cx + 1.55 * r)}V{base}Z"
            f"M{f(cx - .1 * r)} {f(base - 1.9 * r)}V{f(base - 2.25 * r)}H{f(cx + .1 * r)}V{f(base - 1.9 * r)}Z")
far = row(214, 236, 70, 140, .15, 0, 14)[0] + eiffel(700, 238, 222) + dome(470, 226, 30)
mid, wm = row(244, 268, 60, 120, .5, .45, 20)
near, wn = row(270, 294, 80, 150, .7, .6, 26)
rects = lambda ws, on: "".join(f"M{f(x)} {f(y)}h{f(w)}v{f(h)}h-{f(w)}Z" for x, y, w, h, l in ws if l == on)
svg = (f'<svg class="ld-city" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">'
       f'<defs><radialGradient id="ldsun" cx="58%" cy="64%" r="46%"><stop offset="0" stop-color="#FFE7B8" stop-opacity=".95"/><stop offset=".35" stop-color="#FFC68A" stop-opacity=".42"/><stop offset="1" stop-color="#FFC68A" stop-opacity="0"/></radialGradient></defs>'
       f'<rect width="{W}" height="{H}" fill="url(#ldsun)"/><path d="{far}" fill="#7D74B4" fill-opacity=".6" fill-rule="evenodd"/>'
       f'<path d="{mid}" fill="#3B3A7A"/><path d="{rects(wm, False)}" fill="#4A4A8E"/><path d="{rects(wm, True)}" fill="#FFCB72"/>'
       f'<path d="{near}" fill="#1B1C46"/><path d="{rects(wn, False) + rects(wn, True)}" fill="#26275A"/></svg>')
print(svg)
import sys; print(len(svg), "octets", file=sys.stderr)
