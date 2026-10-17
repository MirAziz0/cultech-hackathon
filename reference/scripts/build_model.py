"""
ZamanQapisi AI - Shirvanshahs' Palace complex, stylized maquette generator.
Builds two GLB models: "today" (current state, ruined bathhouse & walls)
and "restored" (artistic 15th-century reconstruction).
Geometry is an APPROXIMATE artistic reconstruction, not measured data.
Units while building: meters (approx). Final export scaled to tabletop size.
"""
import math, random, sys
import numpy as np
import trimesh
from trimesh.creation import box, cylinder, revolve, icosphere, extrude_polygon
from shapely.geometry import Polygon

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
SCALE = 0.008          # 80 m site -> ~0.64 m tabletop maquette

COL = {
    "base":     (92, 66, 48),
    "ground":   (196, 178, 140),
    "terrace":  (184, 164, 126),
    "stone":    (214, 192, 150),
    "stone_rs": (230, 211, 168),   # fresh restored stone
    "stone_old":(176, 156, 120),   # weathered / ruin
    "dome":     (205, 184, 140),
    "niche":    (92, 72, 52),
    "window":   (70, 56, 42),
    "water":    (58, 143, 160),
    "tree":     (94, 122, 58),
    "trunk":    (110, 84, 58),
    "tile":     (40, 128, 140),    # turquoise accent (restored only)
    "path":     (222, 206, 172),
}

class Model:
    def __init__(self):
        self.parts = {}
    def add(self, mesh, color):
        self.parts.setdefault(color, []).append(mesh)
    def export(self, path):
        scene = trimesh.Scene()
        for color, meshes in self.parts.items():
            m = trimesh.util.concatenate(meshes)
            m.apply_scale(SCALE)
            r, g, b = COL[color]
            mat = trimesh.visual.material.PBRMaterial(
                name=color,
                baseColorFactor=[r / 255, g / 255, b / 255, 1.0],
                metallicFactor=0.0,
                roughnessFactor=0.35 if color == "water" else 0.92,
            )
            m.visual = trimesh.visual.TextureVisuals(material=mat)
            scene.add_geometry(m, node_name=color, geom_name=color)
        # glTF is Y-up: rotate Z-up -> Y-up
        scene.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
        scene.export(path)
        tris = sum(len(g.faces) for g in scene.geometry.values())
        print(f"{path}: {tris} triangles")

# ---------- primitives ----------
def B(sx, sy, sz, x, y, z):
    """Box with bottom at z."""
    return box(extents=[sx, sy, sz], transform=trimesh.transformations.translation_matrix([x, y, z + sz / 2]))

def cyl(r, h, x, y, z, sections=16):
    return cylinder(radius=r, height=h, sections=sections,
                    transform=trimesh.transformations.translation_matrix([x, y, z + h / 2]))

def dome(r, h, x, y, z, sections=28, pointed=0.18):
    """Slightly pointed Shirvan-style dome via revolved profile."""
    pts = []
    n = 14
    for i in range(n + 1):
        t = i / n * (math.pi / 2)
        rr = r * math.cos(t)
        zz = h * math.sin(t) ** (1 - pointed)
        pts.append([rr, zz])
    pts[-1] = [0, h]
    m = revolve(np.array(pts), sections=sections)
    m.apply_translation([x, y, z])
    return m

def tent(r, h, x, y, z, sections=8):
    m = revolve(np.array([[r, 0], [0, h]]), sections=sections)
    m.apply_translation([x, y, z])
    return m

def arch_poly(w, hs, c_ratio=0.18, n=10):
    c = w * c_ratio
    r = w / 2 + c
    top = hs + math.sqrt(r * r - c * c)
    left = []
    a0 = math.pi
    a1 = math.atan2(top - hs, 0 - c)
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        left.append((c + r * math.cos(a), hs + r * math.sin(a)))
    right = [(-px, py) for px, py in reversed(left)]
    pts = [(-w / 2, 0)] + left + right[1:] + [(w / 2, 0)]
    return Polygon(pts)

def niche(w, hs, x, y, z, facing, depth=0.25):
    """Dark pointed-arch niche/opening standing on a facade.
    facing: angle (radians) of outward normal in XY; 0 = +x, pi/2 = +y."""
    m = extrude_polygon(arch_poly(w, hs), depth)          # in XY, extruded along z
    m.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, [1, 0, 0]))  # y->z
    # now arch stands in XZ plane, depth along -y; make normal face +y then rotate
    m.apply_translation([0, depth, 0])
    m.apply_transform(trimesh.transformations.rotation_matrix(facing - math.pi / 2, [0, 0, 1]))
    m.apply_translation([x, y, z])
    return m

def portal(md, w, h, x, y, z, facing, depth=1.0, stone="stone"):
    """Tall projecting portal (pishtaq) with deep arched niche."""
    ca, sa = math.cos(facing), math.sin(facing)
    # frame block: width along tangent
    frame = box(extents=[depth, w, h])
    frame.apply_transform(trimesh.transformations.rotation_matrix(facing, [0, 0, 1]))
    frame.apply_translation([x + ca * depth / 2, y + sa * depth / 2, z + h / 2])
    md.add(frame, stone)
    md.add(niche(w * 0.62, h * 0.55, x + ca * (depth + 0.02), y + sa * (depth + 0.02), z, facing, depth=0.3), "niche")
    # small cornice
    cor = box(extents=[depth + 0.3, w + 0.3, 0.35])
    cor.apply_transform(trimesh.transformations.rotation_matrix(facing, [0, 0, 1]))
    cor.apply_translation([x + ca * depth / 2, y + sa * depth / 2, z + h + 0.17])
    md.add(cor, stone)

def window_row(md, x0, x1, y, z, facing, n, w=1.1, hs=1.4):
    for i in range(n):
        x = x0 + (x1 - x0) * (i + 0.5) / n
        md.add(niche(w, hs, x, y, z, facing, depth=0.15), "window")

def window_row_y(md, y0, y1, x, z, facing, n, w=1.1, hs=1.4):
    for i in range(n):
        y = y0 + (y1 - y0) * (i + 0.5) / n
        md.add(niche(w, hs, x, y, z, facing, depth=0.15), "window")

def tree(md, x, y, z, s=1.0):
    md.add(cyl(0.25 * s, 1.6 * s, x, y, z, 6), "trunk")
    t = icosphere(subdivisions=1, radius=1.5 * s)
    t.apply_translation([x, y, z + 2.6 * s])
    md.add(t, "tree")

# ---------- buildings ----------
UP, MID, LOW = 4.0, 2.0, 0.0   # terrace heights

def site_base(md):
    md.add(B(86, 76, 1.6, 0, -4, -1.6), "base")
    md.add(B(84, 74, 0.08, 0, -4, -0.06), "ground")
    # terraces (upper / middle)
    md.add(B(62, 34, UP, -6, 14, 0), "terrace")
    md.add(B(46, 22, MID, 14, -11, 0), "terrace")
    # stairs between terraces
    for i in range(5):
        h = MID + (UP - MID) * (i + 1) / 5
        md.add(B(4, 0.9, h, -2, -2.6 - (4 - i) * 0.9 + 0.0, 0), "path")
    for i in range(5):
        h = (MID) * (i + 1) / 5
        md.add(B(4, 0.9, h, 30, -21.5 - (4 - i) * 0.9, 0), "path")

def palace(md, stone):
    # two-storey palace block (L-shape)
    x, y = -24, 18
    md.add(B(22, 14, 11, x, y, UP), stone)
    md.add(B(10, 10, 9, x - 6, y - 11, UP), stone)
    # parapet
    md.add(B(22.4, 14.4, 0.6, x, y, UP + 11), stone)
    md.add(B(10.4, 10.4, 0.6, x - 6, y - 11, UP + 9), stone)
    # windows south & east
    window_row(md, x - 10, x + 10, y - 7, UP + 1.0, -math.pi / 2, 7)
    window_row(md, x - 10, x + 10, y - 7, UP + 6.0, -math.pi / 2, 7)
    window_row_y(md, y - 6, y + 6, x + 11, UP + 1.0, 0, 4)
    window_row_y(md, y - 6, y + 6, x + 11, UP + 6.0, 0, 4)
    window_row(md, x - 10, x - 2, y - 16, UP + 1.0, -math.pi / 2, 3)
    window_row(md, x - 10, x - 2, y - 16, UP + 5.0, -math.pi / 2, 3)
    portal(md, 4.0, 8.5, x + 4, y - 7, UP, -math.pi / 2, depth=0.8, stone=stone)

def divankhana(md, stone, restored):
    cx, cy = 6, 20
    w, d = 20, 18
    # arcade around courtyard (3 sides): piers + continuous upper band
    h = 5.0
    for side in ("n", "e", "s"):
        if side == "n":
            md.add(B(w, 2.2, h, cx, cy + d / 2, UP), stone)
            window_row(md, cx - w / 2 + 1, cx + w / 2 - 1, cy + d / 2 - 1.1, UP, -math.pi / 2, 7, w=1.6, hs=2.6)
        if side == "s":
            md.add(B(w, 2.2, h, cx, cy - d / 2, UP), stone)
            window_row(md, cx - w / 2 + 1, cx + w / 2 - 1, cy - d / 2 + 1.1, UP, math.pi / 2, 7, w=1.6, hs=2.6)
            window_row(md, cx - w / 2 + 1, cx + w / 2 - 1, cy - d / 2 - 1.1, UP + 0.5, -math.pi / 2, 7, w=1.0, hs=1.6)
        if side == "e":
            md.add(B(2.2, d, h, cx + w / 2, cy, UP), stone)
            window_row_y(md, cy - d / 2 + 1, cy + d / 2 - 1, cx + w / 2 - 1.1, UP, math.pi, 6, w=1.6, hs=2.6)
    # west wall with grand portal facing west
    md.add(B(2.2, d, h + 1.0, cx - w / 2, cy, UP), stone)
    portal(md, 6.0, 11.0, cx - w / 2 - 1.1, cy, UP, math.pi, depth=1.2, stone=stone)
    # central octagonal rotunda on plinth
    md.add(cyl(4.6, 1.2, cx + 1, cy, UP, 8), stone)
    md.add(cyl(3.6, 5.0, cx + 1, cy, UP + 1.2, 8), stone)
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        md.add(niche(1.4, 2.2, cx + 1 + math.cos(a) * 3.35, cy + math.sin(a) * 3.35, UP + 1.6, a, depth=0.2), "niche")
    md.add(cyl(3.0, 1.0, cx + 1, cy, UP + 6.2, 16), stone)
    md.add(dome(3.0, 3.2, cx + 1, cy, UP + 7.2, pointed=0.25), "dome")
    if restored:
        # garden & fountain in courtyard
        md.add(B(2.0, 6.0, 0.3, cx - 5, cy, UP), "water")
        tree(md, cx - 6.5, cy + 5.5, UP, 0.7)
        tree(md, cx - 6.5, cy - 5.5, UP, 0.7)

def seyid_yahya(md, stone):
    # octagonal mausoleum with pyramidal tent roof (middle courtyard)
    x, y = -4, 0
    md.add(cyl(3.4, 0.8, x, y, UP, 8), stone)
    md.add(cyl(3.0, 7.0, x, y, UP + 0.8, 8), stone)
    md.add(tent(3.3, 4.2, x, y, UP + 7.8), "dome")
    a = -math.pi / 2 + math.pi / 8
    md.add(niche(1.3, 2.0, x + math.cos(a) * 2.8, y + math.sin(a) * 2.8, UP + 0.8, a, depth=0.15), "niche")

def mosque_and_minaret(md, stone, restored):
    x, y = 12, -10
    md.add(B(14, 10, 8, x, y, MID), stone)
    md.add(B(14.4, 10.4, 0.5, x, y, MID + 8), stone)
    md.add(cyl(3.2, 1.2, x + 1, y, MID + 8.5, 16), stone)
    md.add(dome(3.2, 3.0, x + 1, y, MID + 9.7, pointed=0.2), "dome")
    portal(md, 4.5, 9.5, x - 2, y - 5, MID, -math.pi / 2, depth=1.0, stone=stone)
    # minaret at NE corner
    mx, my = x + 6.0, y + 4.0
    md.add(cyl(1.6, 2.0, mx, my, MID + 8, 16), stone)
    md.add(cyl(1.25, 12.0, mx, my, MID + 10, 16), stone)
    md.add(cyl(2.0, 0.8, mx, my, MID + 19.0, 16), stone)       # balcony (sherefe)
    md.add(cyl(0.95, 3.0, mx, my, MID + 19.8, 16), stone)
    md.add(tent(1.05, 2.2, mx, my, MID + 22.8, 16), "tile" if restored else "dome")
    if restored:
        md.add(cyl(1.28, 0.6, mx, my, MID + 16.5, 16), "tile")  # glazed band

def turbe(md, stone, restored):
    # Shirvanshahs family mausoleum: cube + dome, tall south portal
    x, y = 26, -10
    md.add(B(9, 9, 8.5, x, y, MID), stone)
    md.add(cyl(3.4, 1.0, x, y, MID + 8.5, 16), stone)
    md.add(dome(3.4, 3.6, x, y, MID + 9.5, pointed=0.25), "tile" if restored else "dome")
    portal(md, 5.0, 10.5, x, y - 4.5, MID, -math.pi / 2, depth=1.0, stone=stone)

def murad_gate(md, stone):
    x, y = 26, 6
    md.add(B(1.5, 6.0, 7.0, x, y, UP), stone)
    md.add(niche(3.0, 3.5, x + 0.76, y, UP, 0, depth=0.15), "niche")
    md.add(niche(3.0, 3.5, x - 0.76, y, UP, math.pi, depth=0.15), "niche")
    md.add(B(1.9, 6.4, 0.4, x, y, UP + 7.0), stone)

def bathhouse(md, restored, rng):
    # lower terrace, south-east: cluster of domed rooms
    bx, by = 22, -30
    rooms = [(-6, 0, 6), (0, 0, 7), (6, 0, 6), (-3, -6, 5), (3, -6, 5), (0, 6, 5)]
    if restored:
        md.add(B(20, 18, 0.4, bx, by, LOW), "stone_rs")
        for dx, dy, s in rooms:
            md.add(B(s, s, 3.6, bx + dx, by + dy, LOW + 0.4), "stone_rs")
            md.add(cyl(s * 0.36, 0.5, bx + dx, by + dy, LOW + 4.0, 12), "stone_rs")
            md.add(dome(s * 0.36, s * 0.35, bx + dx, by + dy, LOW + 4.5, sections=16, pointed=0.15), "dome")
        portal(md, 3.0, 5.5, bx, by + 9, LOW + 0.4, math.pi / 2, depth=0.7, stone="stone_rs")
    else:
        # ruin: sunken floor, broken low walls, scattered stones
        md.add(B(20, 18, 0.25, bx, by, LOW), "stone_old")
        for dx, dy, s in rooms:
            for side in range(4):
                n = 4
                for i in range(n):
                    h = rng.uniform(0.3, 2.2) if rng.random() > 0.2 else 0.0
                    if h == 0: continue
                    seg = s / n
                    t = -s / 2 + seg * (i + 0.5)
                    if side == 0: md.add(B(seg * 0.95, 0.6, h, bx + dx + t, by + dy - s / 2, LOW + 0.25), "stone_old")
                    if side == 1: md.add(B(seg * 0.95, 0.6, h, bx + dx + t, by + dy + s / 2, LOW + 0.25), "stone_old")
                    if side == 2: md.add(B(0.6, seg * 0.95, h, bx + dx - s / 2, by + dy + t, LOW + 0.25), "stone_old")
                    if side == 3: md.add(B(0.6, seg * 0.95, h, bx + dx + s / 2, by + dy + t, LOW + 0.25), "stone_old")
        for _ in range(28):
            s = rng.uniform(0.3, 0.8)
            md.add(B(s, s * 0.8, s * 0.5, bx + rng.uniform(-11, 11), by + rng.uniform(-10, 10), LOW + 0.25), "stone_old")

def enclosure(md, restored, rng):
    # perimeter walls along the base edge
    segs = [((-40, -40), (40, -40)), ((40, -40), (40, 32)), ((40, 32), (-40, 32)), ((-40, 32), (-40, -40))]
    stone = "stone_rs" if restored else "stone"
    for (x0, y0), (x1, y1) in segs:
        L = math.hypot(x1 - x0, y1 - y0)
        n = int(L / 4)
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            xm, ym = x0 + (x1 - x0) * (t0 + t1) / 2, y0 + (y1 - y0) * (t0 + t1) / 2
            h = 3.2
            if not restored and rng.random() < 0.3:
                h = rng.uniform(0.6, 2.0)
            horiz = abs(y1 - y0) < 1e-6
            sx, sy = (L / n * 0.98, 1.0) if horiz else (1.0, L / n * 0.98)
            md.add(B(sx, sy, h, xm, ym, 0), stone)
            if h == 3.2 and i % 2 == 0:   # merlons
                md.add(B(sx * 0.4 if horiz else 1.0, 1.0 if horiz else sy * 0.4, 0.8, xm, ym, h), stone)
    # round towers at corners
    for cx, cy in [(-40, -40), (40, -40), (40, 32), (-40, 32)]:
        md.add(cyl(2.2, 5.0, cx, cy, 0, 16), stone)

def build(restored):
    rng = random.Random(7)
    md = Model()
    stone = "stone_rs" if restored else "stone"
    site_base(md)
    palace(md, stone)
    divankhana(md, stone, restored)
    seyid_yahya(md, stone)
    mosque_and_minaret(md, stone, restored)
    turbe(md, stone, restored)
    murad_gate(md, stone)
    bathhouse(md, restored, rng)
    enclosure(md, restored, rng)
    if restored:
        # lower garden with pool and tree rows (artistic)
        md.add(B(16, 5, 0.25, -22, -22, 0), "water")
        md.add(B(18, 7, 0.12, -22, -22, 0), "path")
        for i in range(5):
            tree(md, -30 + i * 4, -16.5, 0, 0.9)
            tree(md, -30 + i * 4, -27.5, 0, 0.9)
        for (x, y, z) in [(-34, 0, 0), (-8, -30, 0), (2, -34, 0), (36, -6, MID), (-34, 26, UP), (20, 26, UP)]:
            tree(md, x, y, z, 1.0)
    else:
        for (x, y, z) in [(-30, -20, 0), (0, -32, 0)]:
            tree(md, x, y, z, 0.8)
    return md

if __name__ == "__main__":
    build(False).export(f"{OUT}/shirvanshahs-today.glb")
    build(True).export(f"{OUT}/shirvanshahs-restored.glb")
