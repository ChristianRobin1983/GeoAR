import type { GeoPoint } from '../models/GeoObject';
import { approximateDistance } from './Distance';

/**
 * Client-side cache for geographic query results, keyed by geographic grid
 * cell. Persists to IndexedDB (falls back to memory only where IndexedDB is
 * unavailable, e.g. private mode or tests).
 *
 * Privacy note: entries are keyed by coarse grid cells (several km), stay on
 * the device, and can be cleared from the settings panel.
 */

export interface GridCell {
  key: string;
  center: GeoPoint;
  /** Distance from centre to a corner, metres. */
  halfDiagonalM: number;
  sizeKm: number;
}

const KM_PER_DEG_LAT = 111.32;

/**
 * Snap a coordinate to a grid of approximately `cellSizeKm` square cells.
 * Rows are equal-latitude bands; the longitude step is adapted per row so
 * cells stay roughly square at all latitudes.
 */
export function gridCellFor(lat: number, lon: number, cellSizeKm: number): GridCell {
  const dLat = cellSizeKm / KM_PER_DEG_LAT;
  const row = Math.floor(lat / dLat);
  const centerLat = (row + 0.5) * dLat;
  const cosLat = Math.max(0.05, Math.cos((centerLat * Math.PI) / 180));
  const dLon = cellSizeKm / (KM_PER_DEG_LAT * cosLat);
  const col = Math.floor(lon / dLon);
  const centerLon = (col + 0.5) * dLon;
  return {
    key: `${cellSizeKm}:${row}:${col}`,
    center: { latitude: centerLat, longitude: centerLon },
    halfDiagonalM: (cellSizeKm * 1000 * Math.SQRT2) / 2,
    sizeKm: cellSizeKm,
  };
}

export interface CacheEntry<T> {
  key: string;
  layer: string;
  center: GeoPoint;
  radiusKm: number;
  timestamp: number;
  data: T;
}

const DB_NAME = 'geo-ar-cache';
const STORE = 'entries';
const MAX_ENTRIES = 60;

export class GeoCache {
  private readonly memory = new Map<string, CacheEntry<unknown>>();
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private db(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const mem = this.memory.get(key);
    if (mem) return mem as CacheEntry<T>;
    const db = await this.db();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onsuccess = () => {
          const entry = req.result as CacheEntry<T> | undefined;
          if (entry) this.memory.set(key, entry);
          resolve(entry);
        };
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }

  async set<T>(entry: CacheEntry<T>): Promise<void> {
    this.memory.set(entry.key, entry);
    const db = await this.db();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
    void this.prune();
  }

  /** All entries (memory + persisted) – metadata scan for offline fallback. */
  async all(): Promise<CacheEntry<unknown>[]> {
    const db = await this.db();
    if (!db) return [...this.memory.values()];
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve((req.result as CacheEntry<unknown>[]) ?? []);
        req.onerror = () => resolve([...this.memory.values()]);
      } catch {
        resolve([...this.memory.values()]);
      }
    });
  }

  /**
   * Best stale entry for a layer near a position – used when the network is
   * unavailable. Prefers entries whose coverage contains the position.
   */
  async findNearest<T>(layer: string, position: GeoPoint, signature: string): Promise<CacheEntry<T> | undefined> {
    const entries = (await this.all()).filter((e) => e.layer === layer && e.key.includes(signature));
    let best: CacheEntry<unknown> | undefined;
    let bestScore = Infinity;
    for (const e of entries) {
      const d = approximateDistance(position.latitude, position.longitude, e.center.latitude, e.center.longitude);
      const score = d - e.radiusKm * 1000; // negative = position inside coverage
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best as CacheEntry<T> | undefined;
  }

  async clear(): Promise<void> {
    this.memory.clear();
    const db = await this.db();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private async prune(): Promise<void> {
    const entries = await this.all();
    if (entries.length <= MAX_ENTRIES) return;
    const db = await this.db();
    if (!db) return;
    entries.sort((a, b) => a.timestamp - b.timestamp);
    const tx = db.transaction(STORE, 'readwrite');
    for (const e of entries.slice(0, entries.length - MAX_ENTRIES)) {
      tx.objectStore(STORE).delete(e.key);
      this.memory.delete(e.key);
    }
  }
}
