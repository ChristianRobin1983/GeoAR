import type { GeoObject, SettlementType } from './GeoObject';

export interface Settlement extends GeoObject {
  type: SettlementType;
  population?: number;
}

/** Visual/semantic rank of settlement types: higher = more important. */
export const SETTLEMENT_RANK: Record<SettlementType, number> = {
  city: 4,
  town: 3,
  village: 2,
  hamlet: 1,
};
