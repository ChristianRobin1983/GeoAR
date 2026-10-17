import { describe, it, expect } from 'vitest';
import {
  normalizeAngle,
  normalizeSignedAngle,
  angleDifference,
  relativeBearing,
  calculateElevationAngle,
  headingToCardinal,
  clamp,
} from '../../src/geo/GeoMath';
import { calculateDistance, approximateDistance } from '../../src/geo/Distance';
import { calculateBearing, destinationPoint } from '../../src/geo/Bearing';
import { latLonToLocalCoordinates, LocalFrame } from '../../src/geo/CoordinateTransform';
import { simplifyLine, mergeLines } from '../../src/geo/Geometry';

describe('GeoMath angle normalization', () => {
  it('normalizes angles to [0, 360)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(720)).toBe(0);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-360)).toBe(0);
  });

  it('normalizes signed angles to (-180, 180]', () => {
    expect(normalizeSignedAngle(0)).toBe(0);
    expect(normalizeSignedAngle(180)).toBe(180);
    expect(normalizeSignedAngle(-180)).toBe(180);
    expect(normalizeSignedAngle(270)).toBe(-90);
    expect(normalizeSignedAngle(-270)).toBe(90);
  });

  it('calculates angle differences across 0/360 boundary', () => {
    expect(angleDifference(10, 350)).toBe(20);
    expect(angleDifference(350, 10)).toBe(-20);
    expect(angleDifference(0, 0)).toBe(0);
    expect(angleDifference(180, 0)).toBe(180);
  });

  it('calculates relative bearing', () => {
    // Object to the right: heading 0, object at 30 deg -> +30
    expect(relativeBearing(30, 0)).toBe(30);
    // Object to the left: heading 0, object at 330 deg -> -30
    expect(relativeBearing(330, 0)).toBe(-30);
    // Crossing north: heading 350, object at 10 -> +20
    expect(relativeBearing(10, 350)).toBe(20);
  });

  it('converts headings to 8 cardinal directions', () => {
    expect(headingToCardinal(0)).toBe('N');
    expect(headingToCardinal(45)).toBe('NE');
    expect(headingToCardinal(90)).toBe('E');
    expect(headingToCardinal(180)).toBe('S');
    expect(headingToCardinal(270)).toBe('W');
    expect(headingToCardinal(355)).toBe('N');
  });

  it('calculates elevation angle correctly', () => {
    // Object 1000m away, 1000m higher: ~45 degrees
    const angle = calculateElevationAngle(1000, 500, 1500);
    expect(angle).toBeCloseTo(45, 1);

    // Flat target: 0 degrees
    expect(calculateElevationAngle(5000, 1000, 1000)).toBe(0);

    // Target below observer
    expect(calculateElevationAngle(1000, 2000, 1000)).toBeCloseTo(-45, 1);
  });

  it('clamps values to range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('Geographic Distance and Bearing', () => {
  // Test coordinates: Innsbruck (47.2692, 11.4041) to Zugspitze (47.4211, 10.9850)
  const innsbruck = { lat: 47.2692, lon: 11.4041 };
  const zugspitze = { lat: 47.4211, lon: 10.9850 };

  it('calculates distance between known points', () => {
    const dist = calculateDistance(innsbruck.lat, innsbruck.lon, zugspitze.lat, zugspitze.lon);
    // Innsbruck to Zugspitze is approx 35.7 km
    expect(dist).toBeGreaterThan(34_000);
    expect(dist).toBeLessThan(37_000);

    const approxDist = approximateDistance(innsbruck.lat, innsbruck.lon, zugspitze.lat, zugspitze.lon);
    expect(approxDist).toBeGreaterThan(34_000);
    expect(approxDist).toBeLessThan(37_000);
  });

  it('calculates bearing correctly for cardinal points', () => {
    // True North from (0, 0) to (1, 0)
    expect(calculateBearing(0, 0, 1, 0)).toBeCloseTo(0, 1);
    // True South from (1, 0) to (0, 0)
    expect(calculateBearing(1, 0, 0, 0)).toBeCloseTo(180, 1);
    // True East from (0, 0) to (0, 1)
    expect(calculateBearing(0, 0, 0, 1)).toBeCloseTo(90, 1);
    // True West from (0, 1) to (0, 0)
    expect(calculateBearing(0, 1, 0, 0)).toBeCloseTo(270, 1);
  });

  it('calculates bearing from Innsbruck to Zugspitze (North-West)', () => {
    const bearing = calculateBearing(innsbruck.lat, innsbruck.lon, zugspitze.lat, zugspitze.lon);
    // Northwest bearing: roughly ~300° - 325°
    expect(bearing).toBeGreaterThan(290);
    expect(bearing).toBeLessThan(335);
  });

  it('recovers target location using destinationPoint', () => {
    const start = { lat: 47.0, lon: 11.0 };
    const bearing = 45;
    const dist = 10_000; // 10 km
    const dest = destinationPoint(start.lat, start.lon, bearing, dist);

    const checkDist = calculateDistance(start.lat, start.lon, dest.latitude, dest.longitude);
    const checkBearing = calculateBearing(start.lat, start.lon, dest.latitude, dest.longitude);

    expect(checkDist).toBeCloseTo(dist, -1);
    expect(checkBearing).toBeCloseTo(bearing, 1);
  });
});

describe('CoordinateTransform (ENU and LocalFrame)', () => {
  it('converts cardinal offsets to local ENU coordinates', () => {
    const user = { latitude: 47.0, longitude: 11.0, elevation: 500 };
    // Point directly North (~1.11 km away)
    const targetNorth = { latitude: 47.01, longitude: 11.0, elevation: 500 };
    const enuNorth = latLonToLocalCoordinates(user, targetNorth);

    expect(enuNorth.north).toBeGreaterThan(1000);
    expect(Math.abs(enuNorth.east)).toBeLessThan(5);

    // Point directly East
    const targetEast = { latitude: 47.0, longitude: 11.01, elevation: 500 };
    const enuEast = latLonToLocalCoordinates(user, targetEast);
    expect(enuEast.east).toBeGreaterThan(700);
    expect(Math.abs(enuEast.north)).toBeLessThan(5);
  });

  it('LocalFrame produces identical results to standalone conversion', () => {
    const user = { latitude: 47.2692, longitude: 11.4041, elevation: 574 };
    const target = { latitude: 47.4211, longitude: 10.985, elevation: 2962 };

    const frame = new LocalFrame(user.latitude, user.longitude, user.elevation);
    const enuFrame = frame.toENU(target.latitude, target.longitude, target.elevation);
    const enuDirect = latLonToLocalCoordinates(user, target);

    expect(enuFrame.east).toBeCloseTo(enuDirect.east, 1);
    expect(enuFrame.north).toBeCloseTo(enuDirect.north, 1);
    expect(enuFrame.up).toBeCloseTo(enuDirect.up, 1);
    // Zugspitze is west and north of Innsbruck
    expect(enuFrame.east).toBeLessThan(0); // West is negative East
    expect(enuFrame.north).toBeGreaterThan(0);
    expect(enuFrame.up).toBeGreaterThan(2000); // 2962 - 574 > 2000
  });
});

describe('Geometry utilities', () => {
  it('simplifies lines with Douglas-Peucker', () => {
    const straight = [
      { latitude: 47.0, longitude: 11.0 },
      { latitude: 47.001, longitude: 11.001 },
      { latitude: 47.002, longitude: 11.002 },
      { latitude: 47.003, longitude: 11.003 },
    ];
    const simplified = simplifyLine(straight, 10);
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual(straight[0]);
    expect(simplified[1]).toEqual(straight[3]);
  });

  it('merges contiguous polyline segments', () => {
    const seg1 = [
      { latitude: 47.0, longitude: 11.0 },
      { latitude: 47.1, longitude: 11.1 },
    ];
    const seg2 = [
      { latitude: 47.1, longitude: 11.1 },
      { latitude: 47.2, longitude: 11.2 },
    ];
    const merged = mergeLines([seg1, seg2]);
    expect(merged.length).toBe(1);
    expect(merged[0].length).toBe(3);
    expect(merged[0][0]).toEqual(seg1[0]);
    expect(merged[0][2]).toEqual(seg2[1]);
  });
});
