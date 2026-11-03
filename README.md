# Envelope Tilings

Interactive editor for envelope unfoldings (Akiyama's tile-makers) and
matched-edge ("seam") deformations of tiles, with a companion paper.

**Try it online:** https://zevahcle.github.io/envelope-tilings/

## Use it without installing anything

The whole editor is one HTML file with no dependencies. It runs entirely in
your browser; nothing is sent anywhere.

1. Download [`standalone/envelope-tilings.html`](standalone/envelope-tilings.html)
   (open the link, then press the **Download raw file** button at the top right of the file view),
   or download it directly from
   https://raw.githubusercontent.com/zevahcle/envelope-tilings/main/standalone/envelope-tilings.html
   (save the page with ⌘S / Ctrl+S).
2. Double-click the file. It opens in your default browser (Chrome, Firefox, Safari, Edge; it also works offline).
3. **Envelope** tab: pick a tile, draw a cut on the front sheet (or click a preset), press **▶ Unfold**.
   Tick **Net only** to see the unfolded tile alone. The right panel tiles the plane with the net when it can.
4. **Seam** tab: pick a tile, draw a curve near an edge; the whole edge class follows with its forced symmetry.
   The right panel shows a patch of the tiling. Hat-family tiles are rigid (every edge stays straight); the Spectre has one free class.
5. **Share** copies a link that holds the full state; **SVG tile** / **SVG tiling** export the drawings.

A three-page PDF with the mathematical background and checked references for the interested reader:
[references.pdf](https://zevahcle.github.io/envelope-tilings/references.pdf) (source in `docs/references/`, rebuilt with `node scripts/pdf.mjs docs/references/index.html public/references.pdf`).

Keyboard: `D` draw, `H` hinge, `E` erase, `P` pan, `Space` unfold, `⌘Z` / `⌘⇧Z` undo and redo. Drag with the right mouse button or the Pan tool to move; scroll to zoom.

The same file is also served at https://zevahcle.github.io/envelope-tilings/envelope-tilings.html.

## Development

* `npm install` then `npm run dev` and open http://localhost:5173/
* `npm test` runs the geometry and unfolding tests (Vitest)
* `npm run standalone` rebuilds `standalone/envelope-tilings.html` (commit it after changes)
* `node scripts/shot.mjs <url> <out.png>` takes a screenshot with a local Chromium-based browser

Documents: `docs/DESIGN.md` (specification), `docs/LITERATURE.md` (prior art),
`docs/CUT_CLASS.md` (rigidity computation for the hat and Spectre), `docs/STATUS.md` (what is done).

## Publishing

The editor is entirely client-side: no server, no network requests, no build-time data.

- `npm run build` writes a static site to `dist/` (index.html + one JS + one CSS file). Any static host serves it.
- `npm run build:single` writes `dist-single/index.html`; `npm run standalone` copies it into `standalone/`.
- `.github/workflows/pages.yml` tests, builds and deploys `dist/` to GitHub Pages on every push to `main`,
  publishing the standalone file next to it as `envelope-tilings.html`.

## License

MIT. The hat substitution rules are ported from Craig Kaplan's hatviz (BSD-3).
