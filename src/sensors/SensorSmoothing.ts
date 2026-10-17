import { DEG2RAD, RAD2DEG, normalizeAngle, angleDifference } from '../geo/GeoMath';

/**
 * Sensor smoothing utilities.
 * Ensures compass values (especially around 0°/360°) and GPS noisy altitudes
 * interpolate smoothly without jumps or high-frequency jitter.
 */

/**
 * Smooth an angular value (in degrees, [0, 360)) across circular wrap-around.
 * Alpha is the weight for the new value: [0, 1].
 * For example alpha = 0.15 gives smooth response with low lag.
 */
export function smoothAngle(previous: number, current: number, alpha: number): number {
  if (!Number.isFinite(previous)) return normalizeAngle(current);
  if (!Number.isFinite(current)) return normalizeAngle(previous);

  // Shortest angular distance from previous to current
  const diff = angleDifference(current, previous);
  return normalizeAngle(previous + diff * alpha);
}

/**
 * Smooth an angle using vector components (sin/cos averaging).
 * Very stable even under rapid sensor fluctuation.
 */
export function smoothAngleVector(previous: number, current: number, alpha: number): number {
  if (!Number.isFinite(previous)) return normalizeAngle(current);
  if (!Number.isFinite(current)) return normalizeAngle(previous);

  const prevRad = previous * DEG2RAD;
  const currRad = current * DEG2RAD;

  const sinAvg = (1 - alpha) * Math.sin(prevRad) + alpha * Math.sin(currRad);
  const cosAvg = (1 - alpha) * Math.cos(prevRad) + alpha * Math.cos(currRad);

  return normalizeAngle(Math.atan2(sinAvg, cosAvg) * RAD2DEG);
}

/**
 * Exponential Moving Average (EMA) for scalar quantities like altitude or position.
 */
export function smoothScalar(previous: number | undefined, current: number, alpha: number): number {
  if (previous === undefined || !Number.isFinite(previous)) return current;
  return previous + (current - previous) * alpha;
}

/**
 * Filters out jitter below a deadband threshold.
 */
export function applyDeadband(previous: number, current: number, threshold: number): number {
  if (Math.abs(current - previous) < threshold) {
    return previous;
  }
  return current;
}
