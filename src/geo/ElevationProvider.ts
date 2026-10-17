import type { GeoPoint } from '../models/GeoObject';

/**
 * Terrain elevation lookup. Used to fill in missing elevations for
 * settlements / river vertices and as a fallback for the observer's ground
 * height when GPS altitude is unavailable.
 */
export interface ElevationProvider {
  /** Elevations in metres, `undefined` where unknown. Same order as input. */
  getElevations(points: GeoPoint[]): Promise<Array<number | undefined>>;
}

/**
 * Open-Meteo elevation API (Copernicus DEM GLO-90). Free, no API key, CORS
 * enabled, up to 100 coordinates per request.
 */
export class OpenMeteoElevationProvider implements ElevationProvider {
  private readonly cache = new Map<string, number>();
  private readonly endpoint: string;

  constructor(endpoint = 'https://api.open-meteo.com/v1/elevation') {
    this.endpoint = endpoint;
  }

  private key(p: GeoPoint): string {
    // ~100 m resolution keys – the DEM is 90 m anyway.
    return `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;
  }

  async getElevations(points: GeoPoint[]): Promise<Array<number | undefined>> {
    const result: Array<number | undefined> = points.map((p) => this.cache.get(this.key(p)));
    const missing: number[] = [];
    result.forEach((v, i) => v === undefined && missing.push(i));
    for (let start = 0; start < missing.length; start += 100) {
      const chunk = missing.slice(start, start + 100);
      const lat = chunk.map((i) => points[i].latitude.toFixed(4)).join(',');
      const lon = chunk.map((i) => points[i].longitude.toFixed(4)).join(',');
      try {
        const res = await fetch(`${this.endpoint}?latitude=${lat}&longitude=${lon}`);
        if (!res.ok) break;
        const json = (await res.json()) as { elevation?: number[] };
        json.elevation?.forEach((e, j) => {
          if (!Number.isFinite(e)) return;
          const idx = chunk[j];
          result[idx] = e;
          this.cache.set(this.key(points[idx]), e);
        });
      } catch {
        break; // offline / blocked – keep what we have
      }
    }
    return result;
  }
}
