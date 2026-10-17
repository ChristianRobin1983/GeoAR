import { Emitter } from '../app/Emitter';
import type { GeoLayer } from './GeoDataProvider';
import { CachingGeoDataProvider } from './CachingGeoDataProvider';
import type { CachedResult, DataSource } from './CachingGeoDataProvider';
import type { Peak } from '../models/Peak';
import type { Settlement } from '../models/Settlement';
import type { Waterway } from '../models/Waterway';

export interface GeoDataSnapshot {
  peaks: Peak[];
  settlements: Settlement[];
  waterways: Waterway[];
}

export interface LayerStatus {
  state: 'idle' | 'loading' | 'ready' | 'error' | 'disabled';
  source?: DataSource;
  count: number;
  error?: string;
  updatedAt?: number;
}

export interface DataStatus {
  layers: Record<GeoLayer, LayerStatus>;
  offline: boolean;
  /** True if at least one layer is served from stale cache due to errors. */
  usingStaleCache: boolean;
  loading: boolean;
  errorMessage?: string;
}

export interface LayerConfig {
  enabled: Record<GeoLayer, boolean>;
  radiusKm: Record<GeoLayer, number>;
}

const LAYERS: GeoLayer[] = ['peaks', 'settlements', 'waterways'];
const DEBOUNCE_MS = 1500;
const BASE_RETRY_MS = 4000;
const MAX_RETRY_MS = 60_000;

/**
 * Decides *when* geographic data must be (re)loaded. Requests are only
 * issued when the grid-cell request key changes (user left the cached
 * area, radius / options changed), debounced, and never on every GPS fix.
 */
export class GeoDataManager extends Emitter<{ data: GeoDataSnapshot; status: DataStatus }> {
  private snapshot: GeoDataSnapshot = { peaks: [], settlements: [], waterways: [] };
  private status: DataStatus = {
    layers: {
      peaks: { state: 'idle', count: 0 },
      settlements: { state: 'idle', count: 0 },
      waterways: { state: 'idle', count: 0 },
    },
    offline: typeof navigator !== 'undefined' && navigator.onLine === false,
    usingStaleCache: false,
    loading: false,
  };
  private loadedKeys: Partial<Record<GeoLayer, string>> = {};
  private loadingKeys: Partial<Record<GeoLayer, string>> = {};
  private position: { lat: number; lon: number } | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;

  constructor(
    readonly provider: CachingGeoDataProvider,
    private config: LayerConfig,
  ) {
    super();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.status.offline = false;
        this.emitStatus();
        this.schedule(0);
      });
      window.addEventListener('offline', () => {
        this.status.offline = true;
        this.emitStatus();
      });
    }
  }

  get data(): GeoDataSnapshot {
    return this.snapshot;
  }

  get currentStatus(): DataStatus {
    return this.status;
  }

  configure(config: LayerConfig): void {
    this.config = config;
    for (const layer of LAYERS) {
      if (!config.enabled[layer]) {
        this.status.layers[layer] = { state: 'disabled', count: 0 };
      } else if (this.status.layers[layer].state === 'disabled') {
        this.status.layers[layer] = { state: 'idle', count: 0 };
        delete this.loadedKeys[layer];
      }
    }
    this.emitStatus();
    this.schedule(300);
  }

  /** Call on every (smoothed) location update – cheap, internally gated. */
  updatePosition(lat: number, lon: number): void {
    const first = this.position === null;
    this.position = { lat, lon };
    if (!this.needsLoad()) return;
    this.schedule(first || !this.hasAnyData() ? 0 : DEBOUNCE_MS);
  }

  /** Force reloading all layers (bypasses debounce, not the cache). */
  refresh(): void {
    this.loadedKeys = {};
    this.schedule(0);
  }

  async clearCache(): Promise<void> {
    await this.provider.cache.clear();
  }

  private hasAnyData(): boolean {
    return this.snapshot.peaks.length + this.snapshot.settlements.length + this.snapshot.waterways.length > 0;
  }

  private keyFor(layer: GeoLayer): string | null {
    if (!this.position || !this.config.enabled[layer]) return null;
    return this.provider.requestKey(layer, this.position.lat, this.position.lon, this.config.radiusKm[layer]);
  }

  private needsLoad(): boolean {
    return LAYERS.some((layer) => {
      const key = this.keyFor(layer);
      return key !== null && key !== this.loadedKeys[layer] && key !== this.loadingKeys[layer];
    });
  }

  private schedule(delay: number): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.loadAll();
    }, delay);
  }

  private async loadAll(): Promise<void> {
    if (!this.position) return;
    // Sequential: peaks first (the core experience), then settlements, rivers.
    for (const layer of LAYERS) {
      const key = this.keyFor(layer);
      if (key === null) {
        if (!this.config.enabled[layer] && this.snapshot[layer].length) {
          this.snapshot = { ...this.snapshot, [layer]: [] };
          this.emit('data', this.snapshot);
        }
        continue;
      }
      if (key === this.loadedKeys[layer] || key === this.loadingKeys[layer]) continue;
      await this.loadLayer(layer, key);
    }
  }

  private async loadLayer(layer: GeoLayer, key: string): Promise<void> {
    const { lat, lon } = this.position!;
    const radius = this.config.radiusKm[layer];
    this.loadingKeys[layer] = key;
    this.status.layers[layer] = { ...this.status.layers[layer], state: 'loading' };
    this.emitStatus();
    try {
      let result: CachedResult<Peak | Settlement | Waterway>;
      if (layer === 'peaks') result = await this.provider.getPeaks(lat, lon, radius);
      else if (layer === 'settlements') result = await this.provider.getSettlements(lat, lon, radius);
      else result = await this.provider.getWaterways(lat, lon, radius);

      // Ignore stale responses if the config changed meanwhile.
      if (this.loadingKeys[layer] !== key) return;
      this.loadedKeys[layer] = key;
      this.snapshot = { ...this.snapshot, [layer]: result.data };
      this.status.layers[layer] = {
        state: result.error ? 'error' : 'ready',
        source: result.source,
        count: result.data.length,
        error: result.error?.message,
        updatedAt: Date.now(),
      };
      if (result.error) {
        this.status.offline = result.error.offline;
        this.scheduleRetry();
      } else {
        this.retryCount = 0;
      }
      this.emit('data', this.snapshot);
    } catch (err) {
      if (this.loadingKeys[layer] !== key) return;
      const message = err instanceof Error ? err.message : String(err);
      this.status.layers[layer] = { ...this.status.layers[layer], state: 'error', error: message };
      this.status.offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      this.scheduleRetry();
    } finally {
      if (this.loadingKeys[layer] === key) delete this.loadingKeys[layer];
      this.emitStatus();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const expDelay = Math.min(BASE_RETRY_MS * Math.pow(1.8, this.retryCount), MAX_RETRY_MS);
    const jitter = Math.floor(Math.random() * 1000);
    const delay = Math.round(expDelay + jitter);
    this.retryCount++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      // Drop keys of failed layers so they are retried.
      for (const layer of LAYERS) if (this.status.layers[layer].state === 'error') delete this.loadedKeys[layer];
      this.schedule(0);
    }, delay);
  }

  private emitStatus(): void {
    const layers = this.status.layers;
    const errors = LAYERS.filter((l) => layers[l].state === 'error');
    this.status = {
      ...this.status,
      loading: LAYERS.some((l) => layers[l].state === 'loading'),
      usingStaleCache: LAYERS.some((l) => layers[l].source === 'stale-cache'),
      errorMessage: errors.length ? layers[errors[0]].error : undefined,
    };
    this.emit('status', this.status);
  }
}
