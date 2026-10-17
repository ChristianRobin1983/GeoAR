import type { Peak } from '../models/Peak';
import type { Settlement } from '../models/Settlement';
import type { Waterway } from '../models/Waterway';

/**
 * Abstraction over the geographic data source. The UI / AR layers only ever
 * talk to this interface, so the Overpass implementation can later be
 * replaced by a caching backend, vector tiles, or bundled offline data.
 *
 * Implementations may return objects slightly outside the requested radius
 * (e.g. when serving from a grid-aligned cache) – consumers filter by
 * distance themselves.
 */
export interface GeoDataProvider {
  getPeaks(latitude: number, longitude: number, radiusKm: number): Promise<Peak[]>;
  getSettlements(latitude: number, longitude: number, radiusKm: number): Promise<Settlement[]>;
  getWaterways(latitude: number, longitude: number, radiusKm: number): Promise<Waterway[]>;
  /**
   * A string describing provider options that affect the result set
   * (e.g. "include unnamed peaks"). Used to build cache keys.
   */
  readonly cacheSignature: string;
}

export type GeoLayer = 'peaks' | 'settlements' | 'waterways';

export class GeoDataError extends Error {
  constructor(
    message: string,
    readonly offline: boolean,
  ) {
    super(message);
    this.name = 'GeoDataError';
  }
}
