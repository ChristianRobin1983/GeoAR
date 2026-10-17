/** A plain WGS84 coordinate, optionally with an elevation (m above sea level). */
export interface GeoPoint {
  latitude: number;
  longitude: number;
  elevation?: number;
}

export type SettlementType = 'city' | 'town' | 'village' | 'hamlet';

export type GeoObjectType = 'peak' | SettlementType | 'river';

/** Base model shared by all geographic objects displayed in AR and on the map. */
export interface GeoObject extends GeoPoint {
  id: string;
  name: string;
  /** Elevation above mean sea level in metres, if known. */
  elevation?: number;
  type: GeoObjectType;
  /** Optional Wikidata id – used as a "well-known object" signal for ranking. */
  wikidata?: string;
}

export function isSettlementType(type: GeoObjectType): type is SettlementType {
  return type === 'city' || type === 'town' || type === 'village' || type === 'hamlet';
}
