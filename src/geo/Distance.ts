import { DEG2RAD, EARTH_RADIUS_M } from './GeoMath';

/**
 * Great-circle distance in metres between two WGS84 coordinates (haversine).
 * Accurate to ~0.5% which is far below GPS / sensor error for this use case.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * DEG2RAD;
  const φ2 = lat2 * DEG2RAD;
  const dφ = (lat2 - lat1) * DEG2RAD;
  const dλ = (lon2 - lon1) * DEG2RAD;
  const s1 = Math.sin(dφ / 2);
  const s2 = Math.sin(dλ / 2);
  const a = s1 * s1 + Math.cos(φ1) * Math.cos(φ2) * s2 * s2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/**
 * Cheap equirectangular approximation – good enough for filtering / sorting
 * within a few hundred kilometres, ~10× faster than haversine.
 */
export function approximateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const x = (lon2 - lon1) * DEG2RAD * Math.cos(((lat1 + lat2) / 2) * DEG2RAD);
  const y = (lat2 - lat1) * DEG2RAD;
  return Math.sqrt(x * x + y * y) * EARTH_RADIUS_M;
}
