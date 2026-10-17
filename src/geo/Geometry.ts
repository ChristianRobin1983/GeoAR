import type { GeoPoint } from '../models/GeoObject';
import { DEG2RAD, EARTH_RADIUS_M } from './GeoMath';
import { approximateDistance } from './Distance';

/**
 * Polyline utilities for waterway geometry. All operations work in a local
 * equirectangular projection (metres), which is accurate enough for
 * simplification / nearest-point queries at regional scale.
 */

interface XY {
  x: number;
  y: number;
}

function project(p: GeoPoint, refLat: number): XY {
  return {
    x: p.longitude * DEG2RAD * Math.cos(refLat * DEG2RAD) * EARTH_RADIUS_M,
    y: p.latitude * DEG2RAD * EARTH_RADIUS_M,
  };
}

function sqSegDist(p: XY, a: XY, b: XY): number {
  let x = a.x;
  let y = a.y;
  let dx = b.x - x;
  let dy = b.y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b.x;
      y = b.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p.x - x;
  dy = p.y - y;
  return dx * dx + dy * dy;
}

/** Douglas–Peucker simplification with a tolerance in metres. */
export function simplifyLine<T extends GeoPoint>(points: T[], toleranceM: number): T[] {
  if (points.length <= 2) return points.slice();
  const refLat = points[0].latitude;
  const xy = points.map((p) => project(p, refLat));
  const sqTol = toleranceM * toleranceM;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxSq = sqTol;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(xy[i], xy[first], xy[last]);
      if (d > maxSq) {
        index = i;
        maxSq = d;
      }
    }
    if (index > -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

function samePoint(a: GeoPoint, b: GeoPoint): boolean {
  return Math.abs(a.latitude - b.latitude) < 1e-7 && Math.abs(a.longitude - b.longitude) < 1e-7;
}

/**
 * Merge polylines that share endpoints into longer chains (OSM rivers are
 * split into many ways). Greedy, O(n²) in the number of ways – fine for the
 * few hundred ways that make up the rivers of a region.
 */
export function mergeLines(lines: GeoPoint[][]): GeoPoint[][] {
  const pool = lines.filter((l) => l.length >= 2).map((l) => l.slice());
  const result: GeoPoint[][] = [];
  while (pool.length) {
    let chain = pool.pop()!;
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i];
        const head = chain[0];
        const tail = chain[chain.length - 1];
        if (samePoint(tail, l[0])) {
          chain = chain.concat(l.slice(1));
        } else if (samePoint(tail, l[l.length - 1])) {
          chain = chain.concat(l.slice(0, -1).reverse());
        } else if (samePoint(head, l[l.length - 1])) {
          chain = l.slice(0, -1).concat(chain);
        } else if (samePoint(head, l[0])) {
          chain = l.slice(1).reverse().concat(chain);
        } else {
          continue;
        }
        pool.splice(i, 1);
        extended = true;
        break;
      }
    }
    result.push(chain);
  }
  return result;
}

/**
 * Keep only the parts of a polyline within `radiusM` of a centre. The line
 * is split where it leaves the circle, so the result can be several pieces.
 */
export function clipLineToRadius<T extends GeoPoint>(line: T[], center: GeoPoint, radiusM: number): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let hasInside = false;
  for (const p of line) {
    const inside = approximateDistance(center.latitude, center.longitude, p.latitude, p.longitude) <= radiusM;
    if (inside) {
      current.push(p);
      hasInside = true;
    } else if (hasInside) {
      current.push(p); // keep one point outside so the line reaches the edge
      out.push(current);
      current = [p]; // potential re-entry point
      hasInside = false;
    } else {
      current = [p]; // potential entry point
    }
  }
  if (hasInside && current.length >= 2) out.push(current);
  return out;
}

export interface NearestPointResult {
  point: GeoPoint;
  distance: number;
  segmentIndex: number;
}

/** Nearest vertex-or-edge point on a set of polylines to a target. */
export function nearestPointOnLines(lines: GeoPoint[][], target: GeoPoint): NearestPointResult | null {
  let best: NearestPointResult | null = null;
  const refLat = target.latitude;
  const t = project(target, refLat);
  lines.forEach((line, segmentIndex) => {
    for (let i = 0; i < line.length - 1; i++) {
      const a = project(line[i], refLat);
      const b = project(line[i + 1], refLat);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let u = len2 > 0 ? ((t.x - a.x) * dx + (t.y - a.y) * dy) / len2 : 0;
      u = Math.max(0, Math.min(1, u));
      const px = a.x + dx * u;
      const py = a.y + dy * u;
      const d = Math.hypot(t.x - px, t.y - py);
      if (!best || d < best.distance) {
        const lat = line[i].latitude + (line[i + 1].latitude - line[i].latitude) * u;
        const lon = line[i].longitude + (line[i + 1].longitude - line[i].longitude) * u;
        const ea = line[i].elevation;
        const eb = line[i + 1].elevation;
        best = {
          point: {
            latitude: lat,
            longitude: lon,
            elevation: ea !== undefined && eb !== undefined ? ea + (eb - ea) * u : ea ?? eb,
          },
          distance: d,
          segmentIndex,
        };
      }
    }
  });
  return best;
}

/** Insert intermediate points so that no edge is longer than `maxSpacingM`. */
export function densifyLine(line: GeoPoint[], maxSpacingM: number): GeoPoint[] {
  if (line.length < 2) return line.slice();
  const out: GeoPoint[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const d = approximateDistance(a.latitude, a.longitude, b.latitude, b.longitude);
    const n = Math.min(50, Math.floor(d / maxSpacingM));
    for (let k = 1; k <= n; k++) {
      const u = k / (n + 1);
      const ea = a.elevation;
      const eb = b.elevation;
      out.push({
        latitude: a.latitude + (b.latitude - a.latitude) * u,
        longitude: a.longitude + (b.longitude - a.longitude) * u,
        elevation: ea !== undefined && eb !== undefined ? ea + (eb - ea) * u : undefined,
      });
    }
    out.push(b);
  }
  return out;
}

export function lineLength(line: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += approximateDistance(line[i - 1].latitude, line[i - 1].longitude, line[i].latitude, line[i].longitude);
  }
  return total;
}
