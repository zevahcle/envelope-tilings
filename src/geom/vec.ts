/** 2D vectors. Immutable plain objects so they serialise to JSON directly. */
export interface Vec {
  readonly x: number;
  readonly y: number;
}

export const EPS = 1e-9;

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const neg = (a: Vec): Vec => ({ x: -a.x, y: -a.y });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
/** z-component of a × b; positive when b is counter-clockwise from a. */
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const len2 = (a: Vec): number => a.x * a.x + a.y * a.y;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const normalize = (a: Vec): Vec => {
  const l = len(a);
  return l < EPS ? vec(0, 0) : scale(a, 1 / l);
};
/** Rotate by +90° (counter-clockwise). */
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const midpoint = (a: Vec, b: Vec): Vec => lerp(a, b, 0.5);
export const approxEq = (a: Vec, b: Vec, eps = 1e-7): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
export const angleOf = (a: Vec): number => Math.atan2(a.y, a.x);
export const rotate = (a: Vec, theta: number): Vec => {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: c * a.x - s * a.y, y: s * a.x + c * a.y };
};

/** Parameter t in [0,1] of the point on segment ab closest to p. */
export function projectParam(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const l2 = len2(ab);
  if (l2 < EPS * EPS) return 0;
  const t = dot(sub(p, a), ab) / l2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export interface Closest {
  point: Vec;
  t: number;
  dist: number;
}

export function closestOnSegment(p: Vec, a: Vec, b: Vec): Closest {
  const t = projectParam(p, a, b);
  const point = lerp(a, b, t);
  return { point, t, dist: dist(p, point) };
}

/** Signed distance of p from the infinite line through a,b (positive on the left of a→b). */
export function lineSide(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const l = len(ab);
  return l < EPS ? 0 : cross(ab, sub(p, a)) / l;
}
