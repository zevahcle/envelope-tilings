# Implementation status (2026-11-03)

Run: `npm run dev` → http://localhost:5173/. Tests: `npm test` (57 passing).

## Envelope mode
- Base tiles: rectangle (aspect), square, the three Coxeter triangles, hexagon,
  parallelogram, the hat (as a non-tile-maker demo).
- Freehand cuts snapped to the border or to other cuts; hinge tool; erase;
  undo/redo; presets; fold animation; net outline.
- Verdicts: *flattens* (no flap over the back sheet or another flap) and
  *tiles*:
  - Coxeter tiles: the net is placed under the orientation-preserving
    development group (p2/p3/p4/p6), overlap-checked.
  - Other tiles: Conway-criterion search over corner break points; if a
    decomposition is found the net is tiled by the p2 group it generates
    (overlap-checked); otherwise the first ring of the development is shown
    with overlaps in red and the status says "no p2 tiling found" (not a proof
    of non-tiling).
- Numerical confirmation of Akiyama–Matsunaga: every preset on the rectangle
  and square passes the Conway search (test suite).

## Seam mode
- Tiles: parallelogram and hexagon (translations), Spectre (chiral hull,
  substitution levels 1–3), hat family Tile(a,b) (levels 1–3, re-placed along
  the hat contacts).
- Contact graph Γ from the patch, Klein-group edge classes with verdicts
  free / centrally symmetric / mirror symmetric / straight; patch validation
  (edge-to-edge, angle sums, crossings).
- Draw a curve near an edge: it is projected into the edge frame, pinned,
  resampled, symmetrised by the class subgroup H and propagated to the class.
  Presets: bump, S-curve, puzzle tab, zigzag, random; amplitude slider.
- Patch preview with one shared path and per-tile transforms; overlap check.
- Results: hat/turtle/Tile(a,b): two classes, both straight (rigid); Spectre:
  one free class with alternating labels; lattice tiles: one free class per
  pair of opposite edges.

## Shared
- Share link (`#s=` deflate+base64 of the document state), SVG export of both
  panes, keyboard shortcuts, light/dark theme, responsive layout.
- Screenshot helper: `node scripts/shot.mjs <url> <out.png>`.

- Envelope mode: "Net only" checkbox draws the unfolded net as a single filled shape (no envelope border, hinges or cut lines on top); SVG tile export follows the view.

## Not yet done
- Explain stepper / guided tour; gallery of paper figures as preset links.
- Conway decomposition drawn on the net (break points, half-turn centres).
- Curve editing by control points; corridors ("safe zones") in Seam mode.
- Done: Pages workflow (.github/workflows/pages.yml) and `npm run build:single` standalone file.
- Paper draft (`paper/`).
