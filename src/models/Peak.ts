import type { GeoObject } from './GeoObject';

export interface Peak extends GeoObject {
  type: 'peak';
  /** True if the peak carries a real name (unnamed peaks are optional). */
  named: boolean;
}
