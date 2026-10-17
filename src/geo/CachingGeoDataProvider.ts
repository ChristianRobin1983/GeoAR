import type { GeoDataProvider, GeoLayer } from './GeoDataProvider';
import { GeoDataError } from './GeoDataProvider';
import { GeoCache, gridCellFor } from './GeoCache';
import type { GridCell } from './GeoCache';
import type { Peak } from '../models/Peak';
import type { Settlement } from '../models/Settlement';
import type { Waterway } from '../models/Waterway';
import { clamp } from './GeoMath';

export type DataSource = 'network' | 'cache' | 'stale-cache';

export interface CachedResult<T> {
  data: T[];
  source: DataSource;
  cell: GridCell;
  /** Set when the network failed and stale data is served. */
  error?: GeoDataError;
}

/** Cache entries older than this are refreshed when online. */
const MAX_AGE_MS = 14 * 24 * 3600 * 1000;

/**
 * Grid-cell caching decorator.
 *
 * The world is divided into cells of `radius / 4` (5–50 km). A query is
 * issued once per cell, centred on the cell centre, with the radius enlarged
 * by the cell half-diagonal – so the result covers the requested radius for
 * *any* user position inside the cell. Moving a few hundred metres therefore
 * never triggers a new request; only leaving the cell does.
 *
 * Privacy bonus: Overpass only ever sees the snapped cell centre, never the
 * precise user position.
 */
export class CachingGeoDataProvider {
  private readonly inflight = new Map<string, Promise<CachedResult<unknown>>>();

  constructor(
    private inner: GeoDataProvider,
    readonly cache = new GeoCache(),
  ) {}

  setInner(inner: GeoDataProvider): void {
    this.inner = inner;
  }

  static cellSizeFor(radiusKm: number): number {
    return clamp(Math.round(radiusKm / 4), 5, 50);
  }

  /** The cache key that a request at this position would use (cheap). */
  requestKey(layer: GeoLayer, lat: number, lon: number, radiusKm: number): string {
    const cell = gridCellFor(lat, lon, CachingGeoDataProvider.cellSizeFor(radiusKm));
    return `${layer}|${this.inner.cacheSignature}|r${radiusKm}|${cell.key}`;
  }

  getPeaks(lat: number, lon: number, radiusKm: number) {
    return this.load<Peak>('peaks', lat, lon, radiusKm, (a, b, r) => this.inner.getPeaks(a, b, r));
  }

  getSettlements(lat: number, lon: number, radiusKm: number) {
    return this.load<Settlement>('settlements', lat, lon, radiusKm, (a, b, r) => this.inner.getSettlements(a, b, r));
  }

  getWaterways(lat: number, lon: number, radiusKm: number) {
    return this.load<Waterway>('waterways', lat, lon, radiusKm, (a, b, r) => this.inner.getWaterways(a, b, r));
  }

  private load<T>(
    layer: GeoLayer,
    lat: number,
    lon: number,
    radiusKm: number,
    fetcher: (lat: number, lon: number, radiusKm: number) => Promise<T[]>,
  ): Promise<CachedResult<T>> {
    const key = this.requestKey(layer, lat, lon, radiusKm);
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<CachedResult<T>>;
    const promise = this.loadUncached(key, layer, lat, lon, radiusKm, fetcher).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise as Promise<CachedResult<unknown>>);
    return promise;
  }

  private async loadUncached<T>(
    key: string,
    layer: GeoLayer,
    lat: number,
    lon: number,
    radiusKm: number,
    fetcher: (lat: number, lon: number, radiusKm: number) => Promise<T[]>,
  ): Promise<CachedResult<T>> {
    const cell = gridCellFor(lat, lon, CachingGeoDataProvider.cellSizeFor(radiusKm));
    const cached = await this.cache.get<T[]>(key);
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (cached && (Date.now() - cached.timestamp < MAX_AGE_MS || !online)) {
      return { data: cached.data, source: 'cache', cell };
    }
    const queryRadiusKm = radiusKm + cell.halfDiagonalM / 1000;
    try {
      const data = await fetcher(cell.center.latitude, cell.center.longitude, queryRadiusKm);
      await this.cache.set({
        key,
        layer,
        center: cell.center,
        radiusKm: queryRadiusKm,
        timestamp: Date.now(),
        data,
      });
      return { data, source: 'network', cell };
    } catch (err) {
      const error =
        err instanceof GeoDataError ? err : new GeoDataError(err instanceof Error ? err.message : String(err), !online);
      if (cached) return { data: cached.data, source: 'stale-cache', cell, error };
      const nearest = await this.cache.findNearest<T[]>(layer, { latitude: lat, longitude: lon }, this.inner.cacheSignature);
      if (nearest) return { data: nearest.data, source: 'stale-cache', cell, error };
      throw error;
    }
  }
}
