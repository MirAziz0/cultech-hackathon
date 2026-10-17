# ZamanQapısı AI — reference demo (Shirvanshahs' Palace)

Working prototype built in a Claude chat. Use it as reference for the real platform.

- reference-demo/shirvanshahs-demo-built.html — the full single-file demo (open in a browser)
- reference-demo/app.js — exterior maquette viewer (three.js r128), labels, era toggle, gallery, interiors, walk-mode UI, zone photo cards
- reference-demo/walk.js — walkable palace interior: wall-with-arched-openings builder, octagonal halls, vaults, domes, muqarnas, shebeke windows, zones + collision, minimap
- reference-demo/interior.js — 4 small look-around interiors
- reference-demo/page.html — page template (CSS, layout); scripts get inlined by a build step
- reference-demo/*.glb — exterior models ("today" / "restored")
- scripts/build_model.py — Python (trimesh) generator for the exterior GLBs
- scripts/get_photos*.py, fetch_photo.py — Wikimedia Commons thumbnail downloader
- photos/ — downloaded Commons photos + index json (file names = Commons file titles; check licenses)

All geometry is an approximate artistic reconstruction, not measured data.
