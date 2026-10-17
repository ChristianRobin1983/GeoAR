import { DEG2RAD, EARTH_RADIUS_M, RAD2DEG, normalizeAngle } from './GeoMath';
import type { GeoPoint } from '../models/GeoObject';

/**
 * Initial great-circle bearing from point 1 to point 2, degrees clockwise
 * from true north in [0, 360).
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * DEG2RAD;
  const φ2 = lat2 * DEG2RAD;
  const dλ = (lon2 - lon1) * DEG2RAD;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  if (x === 0 && y === 0) return 0;
  return normalizeAngle(Math.atan2(y, x) * RAD2DEG);
}

/** Destination point given start, bearing (deg) and distance (m) on a sphere. */
export function destinationPoint(lat: number, lon: number, bearing: number, distance: number): GeoPoint {
  const δ = distance / EARTH_RADIUS_M;
  const θ = bearing * DEG2RAD;
  const φ1 = lat * DEG2RAD;
  const λ1 = lon * DEG2RAD;
  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);
  return {
    latitude: φ2 * RAD2DEG,
    longitude: ((λ2 * RAD2DEG + 540) % 360) - 180,
  };
}
