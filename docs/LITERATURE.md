# Literature check — what is already published

Date: 2026-11-03. Purpose: make sure the paper does not claim known results.
Items are ordered from "exactly our observation" to "background".

## A. The envelope observation is published (several times)

1. **J. Akiyama, "Tile-Makers and Semi-Tile-Makers", Amer. Math. Monthly
   114(7) (2007) 602–609, doi:10.1080/00029890.2007.11920450.**
   Defines a *tile-maker*: a polyhedron or dihedron (doubly covered polygon)
   all of whose nets tile the plane. Gives five classes: almost-regular
   (isosceles) tetrahedra, doubly covered rectangles, doubly covered
   equilateral triangles, doubly covered isosceles right triangles, doubly
   covered half-equilateral (30-60-90) triangles, and proves these are all the
   convex tile-makers. This is exactly our "Theorem A" (rectangle + the three
   Coxeter triangles), including the classification. The "pillowcase"
   terminology and the envelope picture are from Akiyama's school.

2. **J. Akiyama, K. Matsunaga, "Unfoldings of an envelope", European J.
   Combin. 80 (2019) 3–16, doi:10.1016/j.ejc.2018.02.023.**
   Same title as our idea. An envelope is a rectangle dihedron; cut it open
   along any spanning tree of its four corners (cuts may run on both faces);
   Theorem 1: every such unfolding satisfies the Conway criterion, hence tiles
   by translations and 180° rotations. Theorem 2: two unfoldings of the same
   envelope along non-crossing trees are "equi-rotational" (hinged
   dissection). Theorems 3–4: sufficient conditions for a Conway tile to fold
   into an envelope.

3. **J. Akiyama, K. Matsunaga, "An Algorithm for Folding a Conway Tile into an
   Isotetrahedron or a Rectangle Dihedron", J. Information Processing 28
   (2020) 750–758, doi:10.2197/ipsjjip.28.750.**
   Every net of an isotetrahedron or rectangle dihedron is a Conway tile and,
   by Alexandrov's theorem, every Conway tile folds into one of them; gives the
   algorithm. So the converse direction (which Conway tiles come from
   envelopes) is also done.

4. **J. Akiyama, K. Matsunaga, *Treks into Intuitive Geometry*, Springer
   (2015; 2nd ed. 2023).** The book the idea was found in. Relevant parts
   (2nd ed. table of contents): Ch. 2 "The Tile-Maker Theorem and Its
   Applications to Art and Designs" — §2 Tile-Makers, §5 *Dihedral Tile-Maker
   Theorem*, §6 Polyhedral Stampers, §8–10 *Topologically Extended / Flat
   Closed Surface Tile-maker Theorem* and "How to make tiles from flat
   closed-surface tile-makers"; Ch. 5 "Reversible Pairs of Figures" — §1
   *Envelope Magic*, §2 The Envelope Magic Trick, §3 *Trapezoidal Envelope
   Magic*, §4 *Generalized Envelope Magic*; Ch. 6 "Reversibility and
   Foldability of Conway Tiles" — §6 Folding strips into isotetrahedra or
   rectangular dihedra. Also J. Akiyama, T. Tsukamoto, "Envelope magic"
   (cited as "to appear" in Akiyama–Langerman–Matsunaga 2016) and
   J. Akiyama, E. Demaine, S. Langerman, "Polyhedral characterization of
   reversible hinged dissections" (arXiv:1803.01172), where "envelope magic"
   is the dihedral case of "parcel magic".

5. **S. Langerman, A. Winslow, "A Complete Classification of Tile-makers",
   JCDCGG 2015** (andrewwinslow.com/papers/tilemakers-jcdcgg15.pdf).
   Theorem 2.1: the developments of Akiyama's tile-makers are exactly the
   prototiles of isohedral tilings that use at least two rotations and no
   reflections. Lemma 3.1 ("Gauss–Bonnet for tile-makers"): a closed surface
   is a tile-maker iff every point has curvature κ ≥ 0 with 360° − κ dividing
   360° — this is precisely our orbifold criterion (cone angles 2π/m).
   Theorem 4.1: the only other closed tile-makers are flat tori, flat Klein
   bottles and projective planes flat except at two points; Theorem 4.2: all
   closed tile-makers together are complete for isohedral prototiles.
   Consequence for us: **closed surfaces can never be "aperiodic
   tile-makers"** — every development of a closed tile-maker is isohedral.

6. Related: J. Akiyama, C. Nara, "Tilings and fractals from developments of
   doubly-covered squares" (2006); J. Akiyama, K. Hirata, "On convex
   developments of a doubly-covered square" (LNCS 3330, 2005); flat
   2-foldings of convex polygons (Akiyama, Hirata, Kobayashi, Nakamura);
   Akiyama–Langerman–Matsunaga, "Reversible nets of polyhedra" (2016).

**Conclusion A.** The envelope theorem, its classification, the Conway-tile
characterisation of the nets, and the "flat closed surface" generalisation
are all published. Our paper may *expose* them (with the orbifold proof and
the editor) but cannot claim them.

## B. The hat / Spectre side

7. **D. Smith, J. S. Myers, C. S. Kaplan, C. Goodman-Strauss, "An aperiodic
   monotile", Combinatorial Theory 4(1) (2024) #6, arXiv:2303.10798.**
   Facts we rely on (checked in the text): the hat is a 13-gon, treated as a
   14-gon (the side of length 2 counted as two unit sides with a 180° angle)
   for Tile(a,b) (§6); Tile(a,b) is aperiodic for all r = b/a ≠ 1 with a,b>0
   (degenerate cases tile periodically); Lemma A.6: all hat tilings are
   aligned to a [3.4.6.4] Laves tiling; every tiling decomposes uniquely into
   H, T, P, F metatiles (Sections 4–5), with H containing one reflected hat
   and three unreflected ones and T, P, F containing none — hence the
   reflected fraction is at most 1/4 in every hat tiling (this replaces the
   φ⁴ ratio, which the paper does not state explicitly; the paper's φ⁴ is the
   area inflation factor). Footnote 5 / §7: "Tile(1,1) is such a tile if its
   boundary is modified to prevent the use of reflections".

8. **D. Smith, J. S. Myers, C. S. Kaplan, C. Goodman-Strauss, "A chiral
   aperiodic monotile", arXiv:2305.17743 (Combinatorial Theory 2024).**
   §2, Lemma 2.1: Spectres are obtained by "replacing every edge of Tile(1,1)
   by a translated and rotated copy of σ, fit to the edge's vertices", with
   consecutive copies "related by a rotation around the vertex between them
   (so that the paths alternately face 'in' and 'out')", or by an *s-curve*
   (a simple path symmetric under 180° rotation about its centre); valid
   "provided that γ is chosen so that this process yields a topological disk";
   "Every tiling admitted by X corresponds to one by Tile(1,1)". §6: the
   Spectres "are all essentially the same up to trivial modifications of
   tiling edges". So for the Spectre, the curved-edge family and the
   straightening correspondence are published, and the authors regard edge
   modification as *trivial*.

9. **M. Baake, F. Gähler, L. Sadun, "Dynamics and topology of the Hat family
   of tilings", Israel J. Math. (2025), arXiv:2305.05639.** The hat admits a
   4-dimensional family of (linear) shape deformations; the space of shape
   changes modulo MLD equivalence is 8-dimensional; all versions are
   topologically conjugate up to linear transformation. Curving edges is an
   MLD-trivial change in this framework.

10. **A. Clark, L. Sadun, "When shape matters: deformations of tiling
    spaces", Ergodic Theory Dynam. Systems 26 (2006) 69–86,
    doi:10.1017/S0143385705000623.** The general theory of shape
    deformations of tilings; MLD (mutual local derivability) goes back to
    Baake–Schlottmann–Jarvis 1991.

11. Classical: Heesch–Kienzle (1963) and Grünbaum–Shephard, *Tilings and
    Patterns* (1987), on modifying edges of isohedral prototiles
    ("Escherization"); Conway criterion (Schattschneider 1980).

**Conclusion B.** Replacing the edges of an aperiodic monotile by compatible
curves is known and considered routine by the hat's authors ("trivial
modifications of tiling edges"), and the dynamical-systems community
treats it as MLD-trivial. "An infinite family of aperiodic monotiles from the
hat" would not be accepted as a new result. What is *not* in print, as far as
this search shows:

* an edge-by-edge analysis for the **hat** (which uses reflections), i.e. the
  contact graph Γ, its Klein-group labels, the classes, and which classes are
  forced centrally symmetric / mirror symmetric / straight;
* the observation that the literal envelope unfolding of a hat never tiles
  (easy, but a nice "why the hypothesis is needed" example);
* the reformulation "envelope cut = deformation of a matched edge pair of the
  doubled rectangle", connecting Akiyama's envelope to Escher-style edge
  modification and to the Spectre construction;
* an interactive editor doing all of the above.

## C. Recommendation for the paper

Reposition it as an **expository + software paper** (Bridges, *Journal of
Mathematics and the Arts*, *Mathematical Intelligencer*, or a Monthly note),
built around the editor:

1. Akiyama's envelope (cite 1–5), with the orbifold/Gauss–Bonnet viewpoint as
   the exposition (Langerman–Winslow's Lemma 3.1 is the citation);
2. why it stops at rectangles and three triangles, with the hat as the
   failing example (both the "cannot flatten" and the "flattens but does not
   tile" cases);
3. the seam principle as the common mechanism behind envelopes, Escher,
   Tile(a,b)-style continua and the Spectre (cite 7–11), with the new
   contact-class computation for the hat and turtle as the concrete content;
4. the editor, with every figure reproducible from a URL.

A new *theorem* would need a genuinely new question. Candidates worth
thinking about (not yet checked against the literature):

* "Tile-makers relative to a cut class": glue the matched edges of the hat
  according to Γ to obtain a closed flat surface with cone points; by
  Langerman–Winslow it is not a tile-maker, but every development along a
  curve system isotopic to the edge system tiles aperiodically. Is there a
  clean characterisation of such pairs (surface, isotopy class of cut)?
* Non-closed or branched generalisations (surfaces with boundary) that are
  "aperiodic tile-makers".

## D. Sources consulted

- https://andrewwinslow.com/papers/tilemakers-jcdcgg15.pdf
- https://www.sciencedirect.com/science/article/pii/S0195669818300362
- https://www.jstage.jst.go.jp/article/ipsjjip/28/0/28_750/_article/-char/en
- https://api.crossref.org/ (bibliographic data for 1, 2, 10)
- https://content.e-bookshelf.de/media/reading/L-22404523-f18bd45564.pdf
  (Treks, 2nd ed. front matter and table of contents)
- https://arxiv.org/abs/2303.10798 , https://arxiv.org/html/2305.17743v2
- https://arxiv.org/abs/2305.05639 , https://arxiv.org/abs/1803.01172
- https://cs.uwaterloo.ca/~csk/spectre/
