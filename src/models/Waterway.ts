import type { GeoObject, GeoPoint } from './GeoObject';

export type WaterwayKind = 'river' | 'canal' | 'stream';

/**
 * A named waterway. OSM splits rivers into many ways; ways with the same
 * name are merged into end-to-end chains.
 *
 * `geometry` is the longest merged chain (the "main" polyline, as in the spec),
 * `segments` contains every merged chain (including `geometry`).
 * `latitude`/`longitude` hold a representative point (closest point to the
 * query centre at load time).
 */
export interface Waterway extends GeoObject {
  type: 'river';
  kind: WaterwayKind;
  geometry: GeoPoint[];
  segments: GeoPoint[][];
}
