import type { GeoDataProvider } from '../geo/GeoDataProvider';
import type { Peak } from '../models/Peak';
import type { Settlement } from '../models/Settlement';
import type { Waterway } from '../models/Waterway';
import { DEMO_PEAKS, DEMO_SETTLEMENTS, DEMO_RIVERS } from './DemoData';
import { approximateDistance } from '../geo/Distance';

export class DemoGeoDataProvider implements GeoDataProvider {
  get cacheSignature(): string {
    return 'demo-alpine-v1';
  }

  async getPeaks(latitude: number, longitude: number, radiusKm: number): Promise<Peak[]> {
    const maxM = radiusKm * 1000;
    return DEMO_PEAKS.filter(
      (p) => approximateDistance(latitude, longitude, p.latitude, p.longitude) <= maxM
    );
  }

  async getSettlements(latitude: number, longitude: number, radiusKm: number): Promise<Settlement[]> {
    const maxM = radiusKm * 1000;
    return DEMO_SETTLEMENTS.filter(
      (s) => approximateDistance(latitude, longitude, s.latitude, s.longitude) <= maxM
    );
  }

  async getWaterways(latitude: number, longitude: number, radiusKm: number): Promise<Waterway[]> {
    const maxM = radiusKm * 1000;
    return DEMO_RIVERS.filter(
      (r) => approximateDistance(latitude, longitude, r.latitude, r.longitude) <= maxM
    );
  }
}
