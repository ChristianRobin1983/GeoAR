/**
 * Core angle / scalar helpers used throughout the app.
 *
 * Angle conventions:
 *  - Bearings / headings are in degrees, clockwise from true north, [0, 360).
 *  - Signed angle differences are in degrees, in (-180, 180].
 */

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** Mean Earth radius (IUGG) in metres. */
export const EARTH_RADIUS_M = 6_371_008.8;

/** Typical atmospheric refraction coefficient used in surveying. */
export const DEFAULT_REFRACTION = 0.13;

/** Normalize an angle in degrees to [0, 360). */
export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const a = angle % 360;
  const r = a < 0 ? a + 360 : a;
  // Guard against -0 and floating point 360 results.
  return r >= 360 ? 0 : r === 0 ? 0 : r;
}

/** Normalize an angle in degrees to (-180, 180]. */
export function normalizeSignedAngle(angle: number): number {
  const a = normalizeAngle(angle);
  return a > 180 ? a - 360 : a;
}

/**
 * Signed shortest angular difference `a - b` in degrees, in (-180, 180].
 * Positive means `a` is clockwise (to the right) of `b`.
 */
export function angleDifference(a: number, b: number): number {
  return normalizeSignedAngle(a - b);
}

/**
 * Relative bearing of an object with respect to the device heading.
 * 0 = straight ahead, negative = left, positive = right.
 */
export function relativeBearing(objectBearing: number, deviceHeading: number): number {
  return angleDifference(objectBearing, deviceHeading);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hermite smoothstep between edge0 and edge1. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

const CARDINALS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
const CARDINALS_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

/** 8-point compass direction for a heading. */
export function headingToCardinal(heading: number): string {
  return CARDINALS_8[Math.round(normalizeAngle(heading) / 45) % 8];
}

export function headingToCardinal16(heading: number): string {
  return CARDINALS_16[Math.round(normalizeAngle(heading) / 22.5) % 16];
}

export interface ElevationAngleOptions {
  /** Account for the drop of the target below the observer's tangent plane. */
  earthCurvature?: boolean;
  /** Refraction coefficient (only used with earthCurvature). */
  refraction?: number;
}

/**
 * Vertical angle (degrees) from observer to target.
 * Positive = above the observer's horizon.
 *
 * Base formula (spec): atan2(targetElevation - observerElevation, horizontalDistance).
 * Optionally corrects for Earth curvature + standard refraction, which is
 * significant beyond ~20 km (≈ 27 m drop at 20 km, ≈ 680 m at 100 km).
 */
export function calculateElevationAngle(
  horizontalDistance: number,
  observerElevation: number,
  targetElevation: number,
  options: ElevationAngleOptions = {},
): number {
  let dh = targetElevation - observerElevation;
  if (options.earthCurvature) {
    const k = options.refraction ?? DEFAULT_REFRACTION;
    dh -= ((1 - k) * horizontalDistance * horizontalDistance) / (2 * EARTH_RADIUS_M);
  }
  return Math.atan2(dh, Math.max(horizontalDistance, 1e-6)) * RAD2DEG;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '–';
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

export function formatCoordinate(value: number, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '–';
}
