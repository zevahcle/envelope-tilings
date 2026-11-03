import { type Vec, vec, normalize, sub } from './vec';

/**
 * Affine map of the plane:  x' = a·x + b·y + e,  y' = c·x + d·y + f.
 * Used for isometries (direct: det = +1, mirrored: det = −1) and for the
 * fold animation (a scaling perpendicular to a hinge).
 */
export interface Iso {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export const IDENTITY: Iso = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const apply = (g: Iso, p: Vec): Vec => ({
  x: g.a * p.x + g.b * p.y + g.e,
  y: g.c * p.x + g.d * p.y + g.f,
});

/** Linear part only (for direction vectors). */
export const applyVector = (g: Iso, v: Vec): Vec => ({
  x: g.a * v.x + g.b * v.y,
  y: g.c * v.x + g.d * v.y,
});

/** g ∘ h : apply h first, then g. */
export const compose = (g: Iso, h: Iso): Iso => ({
  a: g.a * h.a + g.b * h.c,
  b: g.a * h.b + g.b * h.d,
  c: g.c * h.a + g.d * h.c,
  d: g.c * h.b + g.d * h.d,
  e: g.a * h.e + g.b * h.f + g.e,
  f: g.c * h.e + g.d * h.f + g.f,
});

export const det = (g: Iso): number => g.a * g.d - g.b * g.c;
export const isDirect = (g: Iso): boolean => det(g) > 0;

export function invert(g: Iso): Iso {
  const dt = det(g);
  const ia = g.d / dt;
  const ib = -g.b / dt;
  const ic = -g.c / dt;
  const id = g.a / dt;
  return { a: ia, b: ib, c: ic, d: id, e: -(ia * g.e + ib * g.f), f: -(ic * g.e + id * g.f) };
}

export const translation = (t: Vec): Iso => ({ ...IDENTITY, e: t.x, f: t.y });

export function rotation(theta: number, center: Vec = vec(0, 0)): Iso {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    a: c,
    b: -s,
    c: s,
    d: c,
    e: center.x - c * center.x + s * center.y,
    f: center.y - s * center.x - c * center.y,
  };
}

export const halfTurn = (center: Vec): Iso => ({
  a: -1,
  b: 0,
  c: 0,
  d: -1,
  e: 2 * center.x,
  f: 2 * center.y,
});

/** Reflection in the line through p and q. */
export function reflection(p: Vec, q: Vec): Iso {
  const u = normalize(sub(q, p));
  const a = 2 * u.x * u.x - 1;
  const b = 2 * u.x * u.y;
  const d = 2 * u.y * u.y - 1;
  // x' = a(x-px) + b(y-py) + px
  return { a, b, c: b, d, e: p.x - a * p.x - b * p.y, f: p.y - b * p.x - d * p.y };
}

/** Uniform scaling about a center. */
export const scaling = (s: number, center: Vec = vec(0, 0)): Iso => ({
  a: s,
  b: 0,
  c: 0,
  d: s,
  e: center.x * (1 - s),
  f: center.y * (1 - s),
});

/**
 * The isometry sending segment p0p1 onto q0q1 (p0 ↦ q0, p1 ↦ q1).
 * With `mirror` the map reverses orientation (it first reflects in the line p0p1).
 * Segments must have equal length; no check is made.
 */
export function mapSegment(p0: Vec, p1: Vec, q0: Vec, q1: Vec, mirror = false): Iso {
  const up = normalize(sub(p1, p0));
  const uq = normalize(sub(q1, q0));
  const theta = Math.atan2(uq.y, uq.x) - Math.atan2(up.y, up.x);
  const rot = rotation(theta);
  const rp0 = apply(rot, p0);
  const direct = compose(translation(sub(q0, rp0)), rot);
  return mirror ? compose(direct, reflection(p0, p1)) : direct;
}

/** Canonical string for de-duplicating isometries. */
export function isoKey(g: Iso, decimals = 5): string {
  const r = (x: number) => {
    const v = Number(x.toFixed(decimals));
    return Object.is(v, -0) ? 0 : v;
  };
  return `${r(g.a)},${r(g.b)},${r(g.c)},${r(g.d)},${r(g.e)},${r(g.f)}`;
}

/** Rotation angle of a direct isometry (undefined meaning for mirrored ones). */
export const rotationAngle = (g: Iso): number => Math.atan2(g.c, g.a);

export const toSvgTransform = (g: Iso): string =>
  `matrix(${g.a} ${g.c} ${g.b} ${g.d} ${g.e} ${g.f})`;
