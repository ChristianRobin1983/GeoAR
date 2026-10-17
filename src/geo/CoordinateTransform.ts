import { DEFAULT_REFRACTION, DEG2RAD, EARTH_RADIUS_M } from './GeoMath';

/**
 * Local coordinate systems
 * ========================
 *
 * ENU (east / north / up), metres, origin at the observer's eye, tangent to
 * the WGS84 ellipsoid. Computed exactly via ECEF, so `up` naturally becomes
 * negative for distant targets at the observer's altitude (Earth curvature).
 *
 * Three.js world space (right-handed, used by the AR renderer):
 *   +X = East
 *   +Y = Up
 *   +Z = South   (i.e. North = -Z)
 * so a default Three.js camera (looking down -Z) with no rotation looks north.
 */

export interface ENU {
  east: number;
  north: number;
  up: number;
}

export interface LocalPosition {
  latitude: number;
  longitude: number;
  /** Metres above sea level. If missing, the observer's elevation is assumed. */
  elevation?: number;
}

// WGS84
const A = 6_378_137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);

export function geodeticToEcef(lat: number, lon: number, h: number): [number, number, number] {
  const φ = lat * DEG2RAD;
  const λ = lon * DEG2RAD;
  const sφ = Math.sin(φ);
  const cφ = Math.cos(φ);
  const N = A / Math.sqrt(1 - E2 * sφ * sφ);
  return [(N + h) * cφ * Math.cos(λ), (N + h) * cφ * Math.sin(λ), (N * (1 - E2) + h) * sφ];
}

/**
 * Precomputed local tangent frame for one observer – use this when converting
 * many targets (thousands of peaks) for the same observer position.
 */
export class LocalFrame {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number;
  private readonly ox: number;
  private readonly oy: number;
  private readonly oz: number;
  private readonly sφ: number;
  private readonly cφ: number;
  private readonly sλ: number;
  private readonly cλ: number;

  constructor(latitude: number, longitude: number, elevation = 0) {
    this.latitude = latitude;
    this.longitude = longitude;
    this.elevation = elevation;
    [this.ox, this.oy, this.oz] = geodeticToEcef(latitude, longitude, elevation);
    this.sφ = Math.sin(latitude * DEG2RAD);
    this.cφ = Math.cos(latitude * DEG2RAD);
    this.sλ = Math.sin(longitude * DEG2RAD);
    this.cλ = Math.cos(longitude * DEG2RAD);
  }

  /** Convert a target to ENU. Missing elevation → observer elevation. */
  toENU(lat: number, lon: number, elevation?: number, out: ENU = { east: 0, north: 0, up: 0 }): ENU {
    const [x, y, z] = geodeticToEcef(lat, lon, elevation ?? this.elevation);
    const dx = x - this.ox;
    const dy = y - this.oy;
    const dz = z - this.oz;
    out.east = -this.sλ * dx + this.cλ * dy;
    out.north = -this.sφ * this.cλ * dx - this.sφ * this.sλ * dy + this.cφ * dz;
    out.up = this.cφ * this.cλ * dx + this.cφ * this.sλ * dy + this.sφ * dz;
    return out;
  }
}

/** Convert a single target to ENU relative to the user (spec API). */
export function latLonToLocalCoordinates(user: LocalPosition, target: LocalPosition): ENU {
  const frame = new LocalFrame(user.latitude, user.longitude, user.elevation ?? 0);
  return frame.toENU(target.latitude, target.longitude, target.elevation ?? user.elevation ?? 0);
}

/**
 * Atmospheric refraction lifts distant objects slightly. Applying it to the
 * ENU `up` component keeps the projected position consistent with what the
 * eye (and the camera) actually sees.
 */
export function applyRefraction(enu: ENU, k = DEFAULT_REFRACTION): ENU {
  const d2 = enu.east * enu.east + enu.north * enu.north;
  enu.up += (k * d2) / (2 * EARTH_RADIUS_M);
  return enu;
}

/** ENU → Three.js world coordinates (X=E, Y=U, Z=-N). */
export function enuToWorld(enu: ENU): { x: number; y: number; z: number } {
  return { x: enu.east, y: enu.up, z: -enu.north };
}

export function horizontalDistance(enu: ENU): number {
  return Math.hypot(enu.east, enu.north);
}
