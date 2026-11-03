# Envelope Tilings

Interactive editor for envelope unfoldings (Akiyama's tile-makers) and
matched-edge ("seam") deformations of tiles, with a companion paper.

* `npm install` then `npm run dev` and open http://localhost:5173/
* `npm test` runs the geometry and unfolding tests (Vitest)
* `node scripts/shot.mjs <url> <out.png>` takes a screenshot with a local Chromium-based browser

Documents: `docs/DESIGN.md` (specification), `docs/LITERATURE.md` (prior art),
`docs/CUT_CLASS.md` (rigidity computation for the hat and Spectre).

## Publishing

The editor is entirely client-side: no server, no network requests, no build-time data.

- `npm run build` writes a static site to `dist/` (index.html + one JS + one CSS file). Any static host serves it.
- `npm run build:single` writes `dist-single/index.html`, a single self-contained file (about 70 kB) that works opened from disk, attached to an email or dropped on any web page.
- `.github/workflows/pages.yml` builds, tests and deploys `dist/` to GitHub Pages on every push to `main`, and also publishes the single file as `envelope-tilings.html` next to it. To enable: GitHub repo → Settings → Pages → Source: "GitHub Actions".
