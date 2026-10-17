import type { GeoDataProvider } from './GeoDataProvider';
import type { ElevationProvider } from './ElevationProvider';
import type { Peak } from '../models/Peak';
import type { Settlement } from '../models/Settlement';
import type { Waterway } from '../models/Waterway';
import type { GeoPoint } from '../models/GeoObject';
import { approximateDistance } from './Distance';

/**
 * Decorator that fills in missing elevations (settlements, unnamed-ele peaks,
 * river vertices) from a terrain elevation service. Enables correct vertical
 * placement of objects that OSM does not tag with `ele`.
 */
export class ElevationEnrichingProvider implements GeoDataProvider {
  constructor(
    private readonly inner: GeoDataProvider,
    private readonly elevation: ElevationProvider,
    /** Upper bound of lookups per request, to stay polite. */
    private readonly maxPoints = 600,
  ) {}

  get cacheSignature(): string {
    return `${this.inner.cacheSignature}|ele`;
  }

  async getPeaks(lat: number, lon: number, radiusKm: number): Promise<Peak[]> {
    const peaks = await this.inner.getPeaks(lat, lon, radiusKm);
    await this.fill(peaks, lat, lon);
    return peaks;
  }

  async getSettlements(lat: number, lon: number, radiusKm: number): Promise<Settlement[]> {
    const list = await this.inner.getSettlements(lat, lon, radiusKm);
    await this.fill(list, lat, lon);
    return list;
  }

  async getWaterways(lat: number, lon: number, radiusKm: number): Promise<Waterway[]> {
    const rivers = await this.inner.getWaterways(lat, lon, radiusKm);
    // Sample vertices evenly across all rivers, then interpolate the rest.
    const all: GeoPoint[] = [];
    for (const r of rivers) for (const s of r.segments) all.push(...s);
    if (!all.length) return rivers;
    const step = Math.max(1, Math.ceil(all.length / this.maxPoints));
    const samples: GeoPoint[] = [];
    for (const r of rivers) {
      for (const seg of r.segments) {
        for (let i = 0; i < seg.length; i += step) samples.push(seg[i]);
        if ((seg.length - 1) % step !== 0) samples.push(seg[seg.length - 1]);
      }
    }
    const elev = await this.elevation.getElevations(samples);
    samples.forEach((p, i) => {
      if (elev[i] !== undefined) p.elevation = elev[i];
    });
    for (const r of rivers) for (const seg of r.segments) interpolateElevations(seg);
    return rivers;
  }

  private async fill(objects: Array<{ latitude: number; longitude: number; elevation?: number }>, lat: number, lon: number) {
    const missing = objects
      .filter((o) => o.elevation === undefined)
      .sort(
        (a, b) =>
          approximateDistance(lat, lon, a.latitude, a.longitude) - approximateDistance(lat, lon, b.latitude, b.longitude),
      )
      .slice(0, this.maxPoints);
    if (!missing.length) return;
    const elev = await this.elevation.getElevations(missing);
    missing.forEach((o, i) => {
      if (elev[i] !== undefined) o.elevation = elev[i];
    });
  }
}

/** Linear interpolation of missing vertex elevations along a polyline. */
export function interpolateElevations(line: GeoPoint[]): void {
  let lastIdx = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i].elevation === undefined) continue;
    if (lastIdx >= 0 && i - lastIdx > 1) {
      const a = line[lastIdx].elevation!;
      const b = line[i].elevation!;
      for (let k = lastIdx + 1; k < i; k++) line[k].elevation = a + ((b - a) * (k - lastIdx)) / (i - lastIdx);
    }
    lastIdx = i;
  }
}
