# Envelope Tilings

Interactive editor for envelope unfoldings (Akiyama's tile-makers) and
matched-edge ("seam") deformations of tiles, with a companion paper.

* `npm install` then `npm run dev` and open http://localhost:5173/
* `npm test` runs the geometry and unfolding tests (Vitest)
* `node scripts/shot.mjs <url> <out.png>` takes a screenshot with a local Chromium-based browser

Documents: `docs/DESIGN.md` (specification), `docs/LITERATURE.md` (prior art),
`docs/CUT_CLASS.md` (rigidity computation for the hat and Spectre).
