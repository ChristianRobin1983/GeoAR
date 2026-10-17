import type { GeoDataProvider } from './GeoDataProvider';
import { GeoDataError } from './GeoDataProvider';
import type { Peak } from '../models/Peak';
import type { Settlement } from '../models/Settlement';
import { SETTLEMENT_RANK } from '../models/Settlement';
import type { Waterway, WaterwayKind } from '../models/Waterway';
import type { GeoPoint, SettlementType } from '../models/GeoObject';
import { clipLineToRadius, lineLength, mergeLines, nearestPointOnLines, simplifyLine } from './Geometry';
import { DEG2RAD } from './GeoMath';

/**
 * OpenStreetMap data via the public Overpass API.
 *
 * Privacy: the browser talks to Overpass directly; the only location sent is
 * the (grid-snapped) query centre provided by the caching layer.
 */

export interface OverpassOptions {
  endpoints?: string[];
  includeUnnamedPeaks?: boolean;
  waterwayKinds?: WaterwayKind[];
  timeoutMs?: number;
}

export const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number } | null>;
}

interface OverpassResponse {
  elements: OverpassElement[];
  remark?: string;
}

/**
 * Parse OSM `ele` values like "2962", "2962 m", "2,962.5", "9718 ft".
 * Returns metres or undefined.
 */
export function parseElevation(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();
  const m = s.match(/^(-?\d{1,5}(?:[.,]\d+)?)\s*(m|ft|feet|')?/);
  if (!m) return undefined;
  let numStr = m[1];
  // "2,962" (thousands separator) vs "296,2" (decimal comma)
  if (/^\-?\d{1,2},\d{3}$/.test(numStr)) numStr = numStr.replace(',', '');
  else numStr = numStr.replace(',', '.');
  let v = parseFloat(numStr);
  if (!Number.isFinite(v)) return undefined;
  if (m[2] === 'ft' || m[2] === 'feet' || m[2] === "'") v *= 0.3048;
  if (v < -500 || v > 9000) return undefined;
  return v;
}

function parsePopulation(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const v = parseInt(raw.replace(/[\s.,]/g, ''), 10);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Serialises requests so we never hammer Overpass with parallel queries. */
class RequestQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export class OverpassGeoDataProvider implements GeoDataProvider {
  private readonly endpoints: string[];
  private endpointIndex = 0;
  private readonly includeUnnamedPeaks: boolean;
  private readonly waterwayKinds: WaterwayKind[];
  private readonly timeoutMs: number;
  private readonly queue = new RequestQueue();

  constructor(options: OverpassOptions = {}) {
    this.endpoints = options.endpoints?.length ? options.endpoints : DEFAULT_OVERPASS_ENDPOINTS;
    this.includeUnnamedPeaks = options.includeUnnamedPeaks ?? false;
    this.waterwayKinds = options.waterwayKinds?.length ? options.waterwayKinds : ['river'];
    this.timeoutMs = options.timeoutMs ?? 25_000;
  }

  get cacheSignature(): string {
    return `osm1|u${this.includeUnnamedPeaks ? 1 : 0}|w${[...this.waterwayKinds].sort().join('+')}`;
  }

  async getPeaks(latitude: number, longitude: number, radiusKm: number): Promise<Peak[]> {
    const r = Math.round(radiusKm * 1000);
    const nameFilter = this.includeUnnamedPeaks ? '' : '["name"]';
    const query = `[out:json][timeout:90];
node["natural"~"^(peak|volcano)$"]${nameFilter}(around:${r},${latitude.toFixed(5)},${longitude.toFixed(5)});
out body qt;`;
    const data = await this.execute(query);
    const peaks: Peak[] = [];
    for (const el of data.elements) {
      if (el.type !== 'node' || el.lat === undefined || el.lon === undefined) continue;
      const tags = el.tags ?? {};
      const elevation = parseElevation(tags.ele);
      const name = tags.name?.trim();
      if (!name && elevation === undefined) continue; // unnamed + no elevation = useless
      peaks.push({
        id: `n${el.id}`,
        type: 'peak',
        name: name || '',
        named: !!name,
        latitude: el.lat,
        longitude: el.lon,
        elevation,
        wikidata: tags.wikidata || (tags.wikipedia ? 'wp' : undefined),
      });
    }
    return peaks;
  }

  async getSettlements(latitude: number, longitude: number, radiusKm: number): Promise<Settlement[]> {
    const r = Math.round(radiusKm * 1000);
    const query = `[out:json][timeout:90];
node["place"~"^(city|town|village|hamlet)$"]["name"](around:${r},${latitude.toFixed(5)},${longitude.toFixed(5)});
out body qt;`;
    const data = await this.execute(query);
    const result: Settlement[] = [];
    for (const el of data.elements) {
      if (el.type !== 'node' || el.lat === undefined || el.lon === undefined) continue;
      const tags = el.tags ?? {};
      const type = tags.place as SettlementType;
      if (!(type in SETTLEMENT_RANK) || !tags.name) continue;
      result.push({
        id: `n${el.id}`,
        type,
        name: tags.name.trim(),
        latitude: el.lat,
        longitude: el.lon,
        elevation: parseElevation(tags.ele),
        population: parsePopulation(tags.population),
        wikidata: tags.wikidata,
      });
    }
    return result;
  }

  async getWaterways(latitude: number, longitude: number, radiusKm: number): Promise<Waterway[]> {
    const r = Math.round(radiusKm * 1000);
    const kinds = this.waterwayKinds.join('|');
    // Clip returned geometry to the bounding box of the query circle to keep
    // responses small for long rivers.
    const dLat = radiusKm / 111.32;
    const dLon = radiusKm / (111.32 * Math.max(0.05, Math.cos(latitude * DEG2RAD)));
    const bbox = [latitude - dLat, longitude - dLon, latitude + dLat, longitude + dLon].map((v) => v.toFixed(4)).join(',');
    const query = `[out:json][timeout:90];
way["waterway"~"^(${kinds})$"]["name"](around:${r},${latitude.toFixed(5)},${longitude.toFixed(5)});
out tags geom(${bbox}) qt;`;
    const data = await this.execute(query);
    return buildWaterways(data.elements, { latitude, longitude }, radiusKm * 1000);
  }

  private execute(query: string): Promise<OverpassResponse> {
    return this.queue.run(() => this.executeWithFailover(query));
  }

  private async executeWithFailover(query: string): Promise<OverpassResponse> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new GeoDataError('Offline', true);
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      if (attempt > 0) {
        // Backoff delay before switching to next mirror
        await new Promise((r) => setTimeout(r, Math.min(600 * attempt, 2500)));
      }
      const endpoint = this.endpoints[(this.endpointIndex + attempt) % this.endpoints.length];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: 'data=' + encodeURIComponent(query),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
        const json = (await res.json()) as OverpassResponse;
        if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) {
          throw new Error(`Overpass: ${json.remark}`);
        }
        this.endpointIndex = (this.endpointIndex + attempt) % this.endpoints.length; // stick to a working one
        return json;
      } catch (err) {
        lastError = err;
      } finally {
        clearTimeout(timer);
      }
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new GeoDataError(
      `Geographic data temporarily unavailable (${lastError instanceof Error ? lastError.message : 'network error'})`,
      offline,
    );
  }
}

/** Group OSM ways by name, merge, simplify and clip them. Exported for testing. */
export function buildWaterways(elements: OverpassElement[], center: GeoPoint, radiusM: number): Waterway[] {
  const groups = new Map<string, { kind: WaterwayKind; wikidata?: string; lines: GeoPoint[][]; firstId: number }>();
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || !el.tags?.name) continue;
    const kind = (el.tags.waterway as WaterwayKind) ?? 'river';
    const key = `${kind}|${el.tags.name.trim()}`;
    // Bbox-clipped geometry may contain nulls where points were dropped:
    // split the way at those gaps.
    let line: GeoPoint[] = [];
    const lines: GeoPoint[][] = [];
    for (const g of el.geometry) {
      if (!g) {
        if (line.length >= 2) lines.push(line);
        line = [];
      } else {
        line.push({ latitude: g.lat, longitude: g.lon });
      }
    }
    if (line.length >= 2) lines.push(line);
    if (!lines.length) continue;
    const group = groups.get(key) ?? { kind, lines: [], firstId: el.id, wikidata: undefined };
    group.lines.push(...lines);
    group.wikidata ??= el.tags.wikidata;
    groups.set(key, group);
  }

  const result: Waterway[] = [];
  for (const [key, group] of groups) {
    const name = key.slice(key.indexOf('|') + 1);
    const merged = mergeLines(group.lines);
    const segments: GeoPoint[][] = [];
    for (const chain of merged) {
      const simplified = simplifyLine(chain, 25);
      segments.push(...clipLineToRadius(simplified, center, radiusM));
    }
    if (!segments.length) continue;
    let longest = segments[0];
    let longestLen = 0;
    for (const s of segments) {
      const len = lineLength(s);
      if (len > longestLen) {
        longestLen = len;
        longest = s;
      }
    }
    const nearest = nearestPointOnLines(segments, center);
    result.push({
      id: `ww:${group.kind}:${name}`,
      type: 'river',
      kind: group.kind,
      name,
      latitude: nearest?.point.latitude ?? longest[0].latitude,
      longitude: nearest?.point.longitude ?? longest[0].longitude,
      wikidata: group.wikidata,
      geometry: longest,
      segments,
    });
  }
  return result;
}
