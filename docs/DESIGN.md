# Envelope Tilings — Design Document

Status: v0.2, 2026-11-03. Specification for (1) the interactive editor and
(2) the companion paper. Implementation status: Envelope mode and Seam mode
are built (see `docs/STATUS.md`); the hat was found to be rigid under edge
curving (`docs/CUT_CLASS.md`), so Theorem B applies non-trivially to lattice
tiles and the Spectre only. Everything here is the plan we agreed to
build; items marked **[verify]** are claims or citations to confirm before they
go into the paper.

---

## 0. One-paragraph summary

A mail envelope is a doubly-covered rectangle (a "pillowcase": two congruent
sheets glued along their common boundary). Cut the front sheet along any curve,
leave each resulting flap hinged on one straight edge, and open the envelope
flat. The flat shape ("net") always tiles the plane, periodically, with twice
the area of the rectangle. We call this the **envelope construction**.
We will build a browser editor that lets anyone draw the cut and immediately
see the unfolding and the tiling, and we will write a paper that (a) proves the
observation and characterises exactly which base tiles it works for
(rectangles and the three Coxeter triangles), (b) shows that the literal
unfolding does *not* work for an aperiodic monotile such as the hat, and (c)
identifies the general principle behind the envelope — the **seam
principle**: matched edges of a tile can be cut along the same curve — which
*does* apply to the hat, the turtle, the whole Tile(a,b) continuum and the
Spectre, and produces infinite (infinite-dimensional) families of aperiodic
monotiles whose tilings are in bijection with the original ones. The editor
implements both constructions, derives the edge-matching structure of the
hat/Spectre tilings computationally, and exports publication-quality figures.

---

## 1. Mathematics

### 1.1 Notation

* `P` — a simple polygon (the base tile), vertices `v_0 … v_{n-1}`
  counter-clockwise, edges `e_i = [v_i, v_{i+1}]`. We allow "straight"
  vertices (interior angle π) when tilings can have a vertex there (the hat
  needs this: it is a 13-gon that behaves as a 14-gon).
* `S(P)` — the **pillowcase** of `P`: two copies of `P` (front `F`, back `B`)
  glued by the identity along `∂P`. Topologically a sphere; metrically a flat
  surface with a cone point of angle `2·θ_v` at each vertex `v` (interior
  angle `θ_v`).
* `ρ_ℓ` — reflection of the plane in the line `ℓ`; `ρ_e` for the line through
  edge `e`.
* A **tiling** by `P` is a covering of the plane by isometric copies `g(P)`
  (direct or mirrored isometries allowed unless stated otherwise) with
  pairwise disjoint interiors.

### 1.2 Mode A — the envelope construction

**Cut data.** A *cut set* on `S(P)` consists of

1. finitely many simple curves drawn on the front face `F`, pairwise disjoint
   except at endpoints, meeting `∂P` only at endpoints (a cut may also end on
   another cut, so the cuts form a planar forest in `F`);
2. all of `∂P` except a finite set of **hinges**: each hinge is a closed
   sub-segment of a *single* edge of `P`.

The cuts split `F` into pieces `F_1 … F_k` (the faces of the planar
subdivision). We require that each piece contains exactly one hinge `h_i`, and
that the cut set `C` (cuts ∪ (∂P \ hinges)) is connected. Then `C` is a tree
that passes through every vertex of `P` and `S(P) \ C` is an open disk.

**Unfolding.** Keep `B` fixed, rotate each flap `F_i` about its hinge line
until it lies flat outside `B`. The result is the **net**

    N = B ∪ ρ_{h_1}(F_1) ∪ … ∪ ρ_{h_k}(F_k),   area(N) = 2·area(P).

(Physically: a piece of paper flipped over is reflected; this is why
reflections appear.)

**Theorem A (envelope theorem).** Suppose the reflections in the edge lines of
`P` generate a discrete group `G_P` having `P` as a fundamental domain. Then for
*every* cut set as above the net `N` is a simple polygon (no overlap) and `N`
tiles the plane. More precisely `N` is a fundamental domain of the
orientation-preserving subgroup `G⁺ ⊂ G_P` (index 2), so the tiling is
isohedral and periodic.

*Which polygons satisfy the hypothesis.* `P` must be a Coxeter polygon: every
interior angle is `π/m` with integer `m ≥ 2`. In the Euclidean plane the angle
sum `(n−2)π ≤ n·π/2` forces `n ≤ 4`, hence exactly:

| base tile `P`                       | `G⁺`  | cone angles of `S(P)` |
|-------------------------------------|-------|-----------------------|
| any rectangle (incl. square)        | p2    | π, π, π, π            |
| triangle (π/2, π/4, π/4)            | p4    | π, π/2, π/2           |
| triangle (π/2, π/3, π/6)            | p6    | π, 2π/3, π/3          |
| equilateral triangle (π/3,π/3,π/3)  | p3    | 2π/3 ×3               |

*Proof sketch.* The quotient map `π: ℝ² → ℝ²/G⁺` identifies `ℝ²/G⁺` with
`S(P)` (the two faces are the images of `P` and `ρ_e(P)`; the cone points of
`S(P)` are exactly the rotation centres of `G⁺`, with angles `2π/m`). The lift
`π⁻¹(C)` is a `G⁺`-invariant closed set whose complement is a disjoint union of
open sets each mapped homeomorphically onto the disk `S(P) \ C`. One such
component is `N°` (the back face together with each flap developed across its
hinge — developing across hinge `h_i` is exactly `ρ_{h_i}`). Hence
`{g(N°) : g ∈ G⁺}` are the components, they are pairwise disjoint and their
closures cover the plane: `N` is a fundamental domain. ∎

*Relation to the literature (see `docs/LITERATURE.md`).* **Theorem A is
not new.** It is Akiyama's *Dihedral Tile-Maker Theorem* (Amer. Math. Monthly
2007; *Treks into Intuitive Geometry* Ch. 2), with the same five-class
classification, and the rectangle case is the subject of Akiyama–Matsunaga,
"Unfoldings of an envelope" (European J. Combin. 2019: every unfolding of an
envelope is a Conway tile). The orbifold criterion is Langerman–Winslow's
Lemma 3.1 (2015), who also prove that developments of tile-makers are exactly
the isohedral prototiles using rotations. The paper will present Theorem A as
exposition with these citations.

**Worked examples (become figures).**

* Rectangle `w×h`, one cut from the left edge to the right edge, hinges = top
  edge and bottom edge: `N` is the region between a curve `γ'` and its
  translate by `(0, 2h)`. Tiles by translations `(w,0), (0,2h)`.
* Rectangle cut along both diagonals, four flaps (the real mail envelope):
  `N` is the rhombus with vertices `(w/2, 3h/2), (3w/2, h/2), (w/2, −h/2),
  (−w/2, h/2)`.
* Trivial cut (no interior cut, one hinge = a whole edge `e`):
  `N = P ∪ ρ_e(P)`.

### 1.3 Why the literal envelope fails for the hat

**Proposition.** Let `P` be the hat and `e` any edge. `N_e = P ∪ ρ_e(P)` does
not tile the plane. Consequently Theorem A cannot be extended to the hat (the
trivial cut already fails, and generic cuts fail numerically — the editor will
show the overlaps).

*Proof.* A tiling by copies of `N_e` is in particular a tiling by hats in which
exactly half of the hats are reflected (each copy of `N_e` contributes one hat
and one mirror hat). But every hat tiling decomposes uniquely into the
metatiles H, T, P, F (SMKGS 2024, Sections 4–5), of which only H contains a
reflected hat (one, together with three unreflected ones), so the reflected
fraction of any hat tiling is at most 1/4. ∎

Geometrically: `S(hat)` has cone angles `2θ_v ∉ {2π/m}`, so it is not a
quotient of the plane by a crystallographic group; the developing map of its
universal cover overlaps itself.

**Flatness is a separate obstruction.** Opening a flap means reflecting it in
its hinge line. For a convex `P` the reflected flap lies on the far side of
that line and can only collide with *other* flaps; for a non-convex `P` such
as the hat, the hinge line re-enters the polygon, so the reflected flap can
land on the back sheet itself: the paper cannot be opened flat at all. Hence
for the hat only special cut sets flatten (hinges on edges whose line does not
cut back into the tile, flaps whose mirror image stays clear of `B` and of the
other flaps — in practice flaps that are "small" or placed symmetrically with
respect to the hinge). For the Coxeter base tiles flatness is automatic: it is
part of Theorem A (the net is a fundamental domain, so it cannot overlap
itself). The editor therefore reports two independent verdicts in Mode A:
*flattens* (net has no self-overlap) and *tiles* (the `G⁺`-copies do not
overlap). The hat can pass the first with a well-chosen cut and still fails
the second, by the Proposition above.

So "use the aperiodic monotile instead of the rectangle" needs a different
reading. The right reading is below.

### 1.4 Mode B — the seam principle (edge deformation with matching)

**Observation.** In the single-cut example of §1.2 the net is the `w × 2h`
rectangle whose top and bottom edges have been replaced by congruent copies of
one curve. The cut through the *face* of the small envelope is the same thing
as a deformation of a matched *pair of edges* of the doubled rectangle. The
envelope is thus a model of the following general principle: whenever an edge
of a tile always meets the same edge of a neighbour in the same way, the two
edges can be cut along one common curve ("a seam") without changing how the
tiles fit together.

**Contacts.** Fix a family `𝒯` of tilings by `P` (all tilings, or the
substitution hull). In a tiling `T ∈ 𝒯` two tiles `A = g_A(P)`, `B = g_B(P)`
are in **contact along edges** `(i, j)` if `g_A(e_i) = g_B(e_j)` as segments.
The contact is **direct** if `g_B⁻¹ g_A` is orientation preserving, and
**mirrored** otherwise.

**Hypothesis (edge-to-edge).** In every `T ∈ 𝒯`, every edge of every tile
coincides with exactly one edge of exactly one neighbour. (True for the hat,
turtle, Tile(a,b), Spectre when the straight-angle vertex is counted
**[verify in code]**; true for lattice tilings of parallelograms and
centrally-symmetric hexagons.)

**Contact graph `Γ`.** Vertices = edges `e_0 … e_{n-1}` of `P`; an edge of `Γ`
between `e_i` and `e_j` labelled `direct` or `mirrored` for every contact type
that occurs in `𝒯`. Self-loops `(i,i)` are allowed.

**Edge curves.** Replace each edge `e_i` by a simple curve `c_i` from `v_i` to
`v_{i+1}`. Write it in the local frame of the edge: unit tangent `u_i`,
outward normal `n_i`, length `L_i`,

    c_i(t) = v_i + x_i(t)·u_i + y_i(t)·n_i,   (x_i,y_i)(0) = (0,0),  (x_i,y_i)(1) = (L_i,0).

**Compatibility.** Two tiles in contact must share the deformed edge as a set.
Working out the frames (the shared segment is traversed in opposite directions
by the two tiles' boundaries, outward normals are opposite) gives:

* direct contact `(i,j)`:    `c_j = R(c_i)`,  `R:(x,y)(t) ↦ (L − x(1−t), −y(1−t))`
  (half-turn about the midpoint of the edge);
* mirrored contact `(i,j)`:  `c_j = M(c_i)`,  `M:(x,y)(t) ↦ (x(t), −y(t))`
  (reflection in the edge line).

`R` and `M` commute and generate the Klein four-group `V = {I, R, M, RM}`;
`RM:(x,y)(t) ↦ (L − x(1−t), y(1−t))` is the reflection in the perpendicular
bisector of the edge.

**Classes and forced symmetry.** Propagating along `Γ` (union–find with labels
in `V`) partitions the edges into **classes**; within a class every curve is
determined by one representative. If `Γ` has a cycle whose label product is
`h ≠ I`, the representative must satisfy `c = h(c)`. Let `H ⊂ V` be the
subgroup generated by all cycle products of the class. Then:

| `H`          | allowed curves                                     |
|--------------|----------------------------------------------------|
| `{I}`        | any simple curve                                   |
| `⟨R⟩`        | centrally symmetric about the midpoint ("S" curve) |
| `⟨RM⟩`       | mirror-symmetric about the perpendicular bisector  |
| `H ∋ M`      | straight only (`y ≡ 0` forces the segment)         |

The editor computes `Γ`, the classes and `H`, and *symmetrises* whatever the
user draws by averaging over `H` (`c ↦ |H|⁻¹ Σ_{h∈H} h(c)`), so every
drawable curve is automatically valid.

**Safe zone (non-overlap).** Let `V_i` be the Voronoi cell of edge `e_i`
inside `P` (points of `P` closer to `e_i` than to any other edge). For each
contact type `(i,j,·)` let `τ` be the isometry placing the neighbour; the
**corridor** of `e_i` is `K_i = V_i ∪ ⋂_{contacts} τ(V_j)`. If every `c_i`
stays inside `K_i` then flaps from different edges can never collide and a
flap never leaves the neighbour it is pushed into.

**Theorem B (seam theorem).** Let `𝒯` be the set of all tilings by `P` whose
contacts all belong to `Γ` (edge-to-edge). Let `c = (c_i)` be a compatible,
generic family of curves inside their corridors, and let `P_c` be the deformed
tile. Then

1. for every `T ∈ 𝒯`, replacing each `g(P)` by `g(P_c)` gives a tiling `T_c`
   by `P_c`;
2. every tiling by `P_c` is `T_c` for a unique `T ∈ 𝒯` (straightening);
3. `T` and `T_c` have the same symmetry group; in particular if no tiling in
   `𝒯` is periodic, `P_c` is an aperiodic monotile, and the hulls of `P` and
   `P_c` are isomorphic as dynamical systems.

*Genericity* means: no sub-arc of a curve of one class is congruent to a
sub-arc of a curve of another class, and a curve has no congruent sub-arcs
beyond those forced by `H`; freehand curves have this property. *Proof sketch
of (2):* in a tiling by `P_c`, the arc `c_i` on a tile must be covered by
boundary arcs of neighbours; by genericity only a full curve of the same class,
placed by an `H`-compatible contact, can do it, so the two tiles sit exactly as
in a `Γ`-contact; the corridor condition makes "straighten every edge" a local
exchange of flaps that preserves the partition of the plane. (3) is because the
deformation is canonical in each tile's frame.

**Remarks.**

* The deformation space of a class with `H = {I}` is infinite-dimensional, so
  "infinite family" is an understatement; the paper will say: for the hat we
  obtain a family parametrised by `k` free curves (`k` = number of free classes,
  computed in §1.6).
* The Spectre paper already uses the special case "Tile(1,1) with all 14 edges
  replaced by one curve placed alternately" to kill the reflected tilings.
  Theorem B explains it: take `𝒯` = chiral hull only; the deformed tile's
  tilings are the tilings of `P` *compatible with `Γ`*, which excludes the
  periodic tilings of Tile(1,1) that use reflections. So Mode B can both
  preserve aperiodicity (hat) and *create* it from a non-aperiodic `P`
  (Tile(1,1) → Spectre). **[verify]** how SMKGS/Spectre phrase this and cite.
* Escher-style "give and take" on a lattice tile is Mode B with `P` a
  parallelogram or hexagon, `Γ` = opposite edges, direct. Heesch–Kienzle
  classification is the isohedral precedent; cite.

### 1.5 Mode A ⊂ Mode B

**Proposition.** For the rectangle with one cut `γ` from the left edge to the
right edge (hinges top and bottom), the envelope net equals the Mode-B
deformation of the `w × 2h` rectangle with `Γ = {(top,bottom,direct),
(left,right,direct)}`, curve `γ'` on the bottom and `R(γ')` on the top.
More generally every Mode-A net is a p2-isohedral tile (Theorem A), hence a
Heesch-type deformation of a parallelogram or a centrally symmetric hexagon.
The envelope is the "physical" way to produce the matched pair.

### 1.6 Aperiodic families — what the editor computes

For each of the hat `Tile(1,√3)`, turtle `Tile(√3,1)`, general `Tile(a,b)` and
the Spectre `Tile(1,1)` (chiral hull):

1. generate a patch from the published substitution rules (level `k`);
2. detect all edge contacts, with type; verify edge-to-edge (no partial
   contacts) and report the unmatched edges (patch boundary only);
3. build `Γ` at levels `k` and `k+1` and check that it has **stabilised**
   (same contact set) — the computational evidence that `Γ` is complete, to be
   backed in the paper by the fact that all tilings are generated by the
   substitution (SMKGS Thm. **[verify number]**) and that two-tile contacts are
   local;
4. compute classes, `H` per class, number of free classes — these numbers go
   into the paper as a table;
5. compute corridors.

Expected (to be confirmed by the computation): the hat has several free
classes plus some classes forced symmetric because reflected hats are
involved; the Spectre has a single class with `H = {I}` whose curve is placed
alternately `c, R(c), c, …` around the tile, reproducing the published curved
Spectre.

### 1.7 Literature status (2026-11-03)

Resolved; details and citations in `docs/LITERATURE.md`. Summary: Mode A is
fully published (Akiyama 2007; Akiyama–Matsunaga 2019, 2020; Langerman–Winslow
2015; *Treks* Ch. 2, 5, 6). Edge modification of aperiodic monotiles is
published for the Spectre and regarded as "trivial modifications of tiling
edges" by its authors; shape deformations of the hat are studied by
Baake–Gähler–Sadun (2025) in the Clark–Sadun framework. Not found in print:
the contact-class (Klein-group) analysis of the hat's 14 edges, the
hat-envelope failure example, the envelope-equals-seam reformulation, and an
editor. The paper is therefore repositioned as expository + software (§3).

---

## 2. The editor

### 2.1 Goals

* Illustrate the envelope concept so clearly that a reader with no background
  understands it in one minute: envelope → cut → unfold → it tiles.
* Be a real tool: freehand and precise curve editing, live validation, live
  tiling, export of print-quality figures (all figures of the paper come out of
  the editor).
* Be honest: show overlaps when a construction fails (hat in Mode A).
* Run anywhere: static site, no backend, works on a phone (touch), shareable
  URLs, single-file HTML build for supplementary material.

### 2.2 Stack and principles

* **Vite + TypeScript, no UI framework.** Vanilla DOM with a small reactive
  store; fewer dependencies, trivially embeddable, single-file build via
  `vite-plugin-singlefile`.
* **SVG** for the editor canvases (crisp, native hit-testing, direct SVG
  export). **Canvas 2D** for large tiling patches (thousands of hats); the
  same scene graph renders to both so SVG export of a patch is one call.
* **Vitest** for geometry and combinatorics tests. **ESLint + Prettier**.
* All geometry in plain `{x,y}` with a tolerance `EPS = 1e-7` relative to
  tile size; isometries as 2×3 affine matrices with an orientation sign.
* State is a plain JSON document (undo = snapshot stack, share = compressed
  JSON in the URL hash).
* Deploy: GitHub Pages (static). Licence: MIT for our code; substitution data
  ported from Craig Kaplan's `hatviz`/`spectre` code with attribution
  **[check licence]**.

### 2.3 Information architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Envelope Tilings      [Envelope] [Seam]     tile ▾   ↶ ↷   share ⤓   │  top bar
├──────────┬───────────────────────────────┬───────────────────────────┤
│ tools    │  EDITOR CANVAS                │  TILING PREVIEW           │
│ ─────    │  (the envelope / the tile)    │  (live, pan/zoom,         │
│ draw     │                               │   colours by orientation) │
│ select   │                               │                           │
│ hinge    │                               │                           │
│ erase    │                               │                           │
│ presets  │                               │                           │
│ ─────    │                               │                           │
│ step 1-4 ├───────────────────────────────┴───────────────────────────┤
│ explain  │ status: valid ✓ · area 2.00·A · classes 5 (3 free) · …    │
└──────────┴───────────────────────────────────────────────────────────┘
```

* The split between editor and preview is draggable; on narrow screens the two
  stack vertically with a tab switch.
* A right-hand drawer ("Properties / Explain") opens on demand: numeric
  parameters (rectangle aspect, `a`, `b`, substitution level), curve
  smoothing, symmetry info of the selected class, and a four-step guided
  explanation with the current state drawn into each step.

### 2.4 Mode A (Envelope) — detailed UX

**Base tiles:** rectangle (aspect slider, square preset), the three Coxeter
triangles, and — deliberately — the regular hexagon and the hat, which fail,
so that the tool shows *why* the theorem has a hypothesis.

**Canvas:** the envelope drawn as two sheets: back sheet (paper colour) and
front sheet (slightly darker, with a subtle shadow at the seam). The user
draws on the front sheet.

**Tools**

* *Draw cut*: freehand (pointer down → move → up). Points are simplified
  (Ramer–Douglas–Peucker) and fitted to a Catmull-Rom/cubic spline; endpoints
  snap to `∂P` or to an existing cut (snap radius 8 px) — otherwise the cut is
  rejected with a hint ("a cut must start and end on the border or on another
  cut"). Cuts cannot cross each other or themselves (rejected with highlight).
  *Straight line* and *polyline* variants with Shift.
* *Select/edit*: drag control points; double-click a cut to add a point;
  Delete removes a point or the whole cut.
* *Hinge*: each flap shows its default hinge (longest straight boundary
  segment on a single edge); click any border segment of a flap to move its
  hinge there. The hinge is drawn as a dashed "fold" line.
* *Presets*: single wavy cut; mail-envelope diagonals; zigzag; random tree.

**Live feedback**

* Validity of the cut set: each flap has exactly one hinge; cut set connected.
  Problems are listed in the status bar and the offending flap is tinted red.
* The **net** `N` is drawn in the editor canvas as a ghost outline around the
  envelope; a slider (or ▶ button) animates the unfolding: each flap is
  rotated about its hinge; with the orthographic top view the rotation by
  angle `θ` is the affine map "scale by `cos θ` perpendicular to the hinge",
  animated from `θ = π` (closed) to `0` (open), with a shading that darkens at
  `cos θ ≈ 0` to sell the fold. (Pure 2D SVG transforms, no WebGL.)
* The **tiling preview** shows `{g(N)}` for `g ∈ G⁺` in the viewport, coloured
  by `g`'s rotation class (two colours for p2). For hexagon/hat the preview
  shows the attempted placements with overlaps hatched in red and a message
  "the pillowcase of this tile is not a quotient of the plane: unfolding does
  not tile".
* Numbers: `area(N) = 2·area(P)`; two verdicts: *flattens* (net simple, no
  flap over the back sheet or another flap) ✓/✗ and *tiles* ✓/✗. A flap that
  cannot open is drawn semi-transparent over the sheet it collides with.

### 2.5 Mode B (Seam) — detailed UX

**Base tiles:** rectangle/parallelogram/hexagon (translation tilings), the hat,
the turtle, `Tile(a,b)` with sliders for `a,b`, the Spectre (chiral hull), and
*custom*: any polygon imported as JSON together with a patch generator
(isohedral lattice only, for now).

**Canvas:** the tile `P` drawn large, edges coloured by class; the selected
class is highlighted on all its edges; the corridor of the selected edge is
shaded; the vertex `v_i` gets a small arrow showing the local orientation
`u_i`.

**Tools**

* *Draw*: draw a curve near an edge — it is projected into the edge's local
  frame, resampled to `M = 64` points, symmetrised by `H`, and propagated to
  the whole class (via `R`, `M`, `RM`). Dragging near a different edge edits
  that class.
* *Edit*: control points as in Mode A.
* *Presets per class*: bump, S-curve, puzzle tab, sine, zigzag, random; an
  amplitude slider; "reset to straight".
* *Randomise all* for a quick demo of the infinite family.

**Analysis panel** (collapsible): the computed `Γ` as a small diagram, the
table of classes (edges, `H`, free/symmetric/straight), the stabilisation
check across two substitution levels, contact counts, and any edge-to-edge
violations (none expected; if any appear, the tool reports it rather than
hiding it).

**Live feedback**

* `P_c` simple ✓/✗ (segment self-intersection test on the sampled boundary).
* Patch non-overlap ✓/✗: boundary crossings between tiles that share a vertex
  or an edge (grid-accelerated segment intersection); crossings drawn in red.
* The preview re-renders the whole patch using the deformed tile; reflected
  tiles in a second colour; level selector 1–5; "straighten" toggle to compare.

### 2.6 Shared features

* Undo/redo (⌘Z/⇧⌘Z), keyboard shortcuts for tools (V select, D draw, H hinge,
  E erase), Space-drag pan, wheel/pinch zoom, Esc cancels a stroke.
* Touch: pointer events, 44 px targets, palm rejection by single-pointer
  drawing.
* Export: SVG and PNG of the editor canvas, the net/tile alone, and the
  preview (with a "figure mode": outline weights in pt, optional colouring,
  transparent background, chosen clip rectangle). JSON save/load. Share URL
  (`#s=<deflate+base64>` via `CompressionStream`).
* Gallery: curated presets that double as the paper's figures (see §3.3),
  each loading the full state.
* Theme: light default, dark via `prefers-color-scheme` and a toggle. Colour
  palette: paper tones for the envelope, two hues for orientation classes,
  categorical colours for edge classes, red reserved for errors.
* Accessibility: all tools reachable by keyboard; ARIA labels; status bar
  mirrored in an `aria-live` region; colour never the only signal.

### 2.7 Geometry core (`src/geom`)

* `vec.ts` — vectors, dot/cross, angles, `EPS` comparisons.
* `isometry.ts` — affine 2×3 with `det` sign, compose/invert/apply, from
  (edge → edge) correspondence, canonical key for de-duplication.
* `polygon.ts` — area, orientation, simplicity test (O(n log n) sweep or grid
  for ≤ 2000 segments), point-in-polygon, Voronoi cell of an edge within a
  polygon (sampled on a fine grid, polygonised by marching squares — enough for
  display and the corridor test).
* `curve.ts` — polyline ops, RDP simplification, Catmull-Rom → cubic Béziers,
  flattening, arc-length resampling, local-frame conversion, `R/M/RM`
  operators and `H`-symmetrisation.
* `arrangement.ts` — planar straight-line graph with intersections only at
  vertices, face extraction (sort half-edges by angle, trace faces).
* `intersect.ts` — segment–segment, polyline–polyline with uniform-grid
  broad phase.

### 2.8 Tiling generators (`src/tiles`)

* `lattice.ts` — translation groups for parallelogram/hexagon/rectangle;
  `Γ` known in closed form.
* `coxeter.ts` — reflection groups of the rectangle and three triangles: BFS
  over edge reflections, de-dup by canonical isometry key, keep the
  orientation-preserving elements → `G⁺` placements in a viewport. The same
  BFS, run for the hexagon or the hat, produces the overlapping development
  shown in the failure demo.
* `hat.ts` — `Tile(a,b)` polygon from the kite construction (angles multiples
  of 30°, 14 edges counting the straight one) and the H/T/P/F metatile
  substitution. Rules ported from Kaplan's `hatviz` (`WebFetch` the source
  during implementation; attribute). Output: list of (isometry, reflected?)
  for level `k`.
* `spectre.ts` — the Spectre substitution (9 metatiles: Gamma, Delta, …) from
  the Spectre paper/`spectreviz`; chiral only.
* `contacts.ts` (in `src/seam`) — spatial hash of edge midpoints → contacts;
  types; `Γ`; union–find with `V`-labels; classes; `H`; stabilisation check.

### 2.9 Validation and tests (`test/`)

* Geometry unit tests: simplicity, area, arrangement faces on known inputs,
  `R/M/RM` algebra (`R² = M² = I`, `RM = MR`), symmetrisation idempotent.
* Theorem A tests: random cut trees on a rectangle and the three triangles →
  net simple, `area = 2·area(P)`, union of `G⁺`-copies in a window equals the
  window area (coverage by rasterisation), zero boundary crossings.
* Mode B tests: lattice tiles with random curves → patch overlap-free;
  hat/Spectre patches: no gaps/overlaps at level ≤ 3 (area check), every
  interior edge has exactly one contact, `Γ` stable between levels 3 and 4,
  class table matches a snapshot; random compatible curves inside corridors →
  overlap-free patch.
* Negative tests: hat in Mode A produces overlaps (so the failure demo is
  itself tested).

### 2.10 Repository layout

```
tiling/
  index.html                vite entry
  package.json  vite.config.ts  tsconfig.json  .eslintrc  .prettierrc
  src/
    main.ts                 bootstrap
    app/      store.ts undo.ts url.ts persistence.ts
    geom/     vec.ts isometry.ts polygon.ts curve.ts arrangement.ts intersect.ts
    tiles/    library.ts lattice.ts coxeter.ts hat.ts spectre.ts
    envelope/ cuts.ts faces.ts unfold.ts validate.ts
    seam/     contacts.ts classes.ts deform.ts validate.ts corridor.ts
    render/   scene.ts svg.ts canvas.ts export.ts
    ui/       layout.ts toolbar.ts tools/*.ts panels/*.ts explain.ts
    presets/  gallery.ts
    styles/   base.css theme.css
  test/                     vitest
  docs/DESIGN.md            this file
  paper/                    main.tex refs.bib figures/ (SVG → PDF)
```

### 2.11 Performance budget

* Level-4 hat patch ≈ 3 000 tiles × 14 edges × 64 samples ≈ 2.7 M points:
  render to Canvas with one cached `Path2D` per orientation class and
  per-tile `setTransform`; redraw < 16 ms on a laptop, < 50 ms on a phone.
* Contact analysis is incremental: computed once per (tile, level), cached;
  curve edits only re-render.
* Validation runs on a debounced worker (Web Worker) for patches > 500 tiles.

---

## 3. Companion paper

### 3.1 Working title and abstract

*Title candidates:* "Envelopes, seams, and families of aperiodic monotiles";
"The envelope construction: from mail envelopes to aperiodic monotiles".

*Abstract (draft):* Cut the front of a sealed envelope along any curve, keep
each flap hinged on one straight edge, and open it flat: the resulting shape
tiles the plane. This is Akiyama's envelope theorem; we give a short orbifold
proof that also explains why it holds exactly for rectangles and the three
Coxeter triangles. The construction fails for the aperiodic hat, but the principle
behind it — matched edges may be cut along a common curve — survives: using
the complete list of edge contacts in hat, turtle, Tile(a,b) and Spectre
tilings, computed from the substitution rules, we obtain infinite-dimensional
families of aperiodic monotiles whose tilings are mutually locally derivable
from the originals. An open-source interactive editor accompanies the paper.

### 3.2 Outline

1. Introduction — the envelope in one figure; statement of results; related
   work (Akiyama; Heesch–Kienzle/Escher; SMKGS hat and Spectre; Tile(a,b)).
2. The envelope theorem (Theorem A) — pillowcases, cut sets, nets, orbifold
   proof, classification of base tiles, examples (mail envelope → rhombus).
3. The hat does not unfold — Proposition of §1.3, pictures of the overlap.
4. The seam principle (Theorem B) — contacts, `Γ`, the Klein group `V`,
   classes and forced symmetry, corridors, proof, MLD statement.
5. Aperiodic families — computation of `Γ` for hat/turtle/Tile(a,b)/Spectre;
   table of classes; gallery of curved monotiles; the Spectre as the special
   case; remarks on chirality.
6. The editor — architecture, algorithms (face extraction, contact
   detection, symmetrisation), reproducibility (every figure is a preset URL).
7. Questions — other "tile-makers" among non-convex or non-simply-connected
   base shapes; 3D analogue (cut the surface of a space-filling polyhedron);
   which non-edge-to-edge aperiodic tiles admit seams; connecting `Γ` to the
   substitution directly (a proof of completeness without enumeration).

### 3.3 Figures (all produced by the editor's figure mode)

1. The envelope, cut, unfolding (three animation frames), tiling — rectangle,
   wavy cut.
2. Mail envelope diagonals → rhombus → tiling.
3. The four base tiles and their `G⁺` tilings of a sample net each.
4. Hat pillowcase: unfolding with overlap hatched.
5. `Γ` of the hat (diagram) and the class colouring on the tile.
6. Gallery: six curved hats, two turtles, a curved Tile(a,b), the Spectre.
7. A patch of curved hats at level 3 (colour by orientation).
8. Screenshot of the editor.

### 3.4 Format and venue

Given the literature status (§1.7), the paper is an expository + software
paper, not a research announcement; the title should not promise "new
aperiodic monotiles".

LaTeX (amsart or the venue's class), figures as SVG → PDF (Inkscape batch or
`rsvg-convert`), bibliography in `refs.bib`. Venues to consider: *Journal of
Mathematics and the Arts*, *Bridges* conference (tool + math, short format),
*The Mathematical Intelligencer*, *Amer. Math. Monthly*; post to arXiv
(math.MG, cs.CG) with the editor URL in the abstract.

---

## 4. Milestones

| #  | Deliverable                                                                          |
|----|--------------------------------------------------------------------------------------|
| M0 | Scaffold: Vite+TS, lint, tests, layout shell, store/undo, SVG canvas with pan/zoom     |
| M1 | Geometry core; Mode A on the rectangle: cuts, faces, hinges, net, p2 preview, validity |
| M2 | Unfold animation; Coxeter triangles; failure demo (hexagon, hat); export/share; presets|
| M3 | Hat/Spectre substitution; contact analysis; classes; Mode B editing; validation        |
| M4 | Gallery, explain panel, touch polish, dark theme, worker validation, deploy to Pages   |
| M5 | Paper draft with figures from the editor; verify citations (§1.7); submit             |

Each milestone ends with its tests green and a demo URL.

---

## 5. Decisions assumed (say so if you want otherwise)

* Vanilla TypeScript + Vite, SVG editor + Canvas preview, Vitest. No React.
* `npm`; initialise a git repository in this folder; MIT licence.
* Port substitution rules from Kaplan's public code with attribution.
* The hat is handled by the seam principle (Mode B), not by literal unfolding;
  Mode A still offers the hat to *show* the failure.
* Paper in LaTeX; author list, affiliations and venue to be decided by you.
