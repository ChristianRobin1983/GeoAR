import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeoObject } from '../models/GeoObject';
import type { Waterway } from '../models/Waterway';
import type { Peak } from '../models/Peak';
import type { Settlement } from '../models/Settlement';
import type { LocationState } from '../sensors/LocationManager';
import type { DeviceOrientationState } from '../sensors/OrientationManager';
import { destinationPoint } from '../geo/Bearing';

export interface MapViewOptions {
  container: HTMLElement | string;
  initialCenter?: [number, number]; // [lon, lat]
  initialZoom?: number;
  fovDegrees?: number;
  onObjectClick?: (obj: GeoObject) => void;
}

export class MapView {
  private map: maplibregl.Map;
  private userMarker: maplibregl.Marker;
  private userHeading = 0;
  private userLocation: [number, number] = [11.4041, 47.2692]; // lon, lat
  private fovDegrees = 60;
  private isLoaded = false;

  constructor(options: MapViewOptions) {
    this.fovDegrees = options.fovDegrees ?? 60;

    if (options.initialCenter) {
      this.userLocation = options.initialCenter;
    }

    // High performance vector style with fallback raster tiles
    const style: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>',
        },
      },
      layers: [
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };

    this.map = new maplibregl.Map({
      container: options.container,
      style,
      center: this.userLocation,
      zoom: options.initialZoom ?? 11,
      pitch: 30, // slight perspective for tactical outdoor look
      attributionControl: false,
    });

    // Add minimal attribution control
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    // Create custom user location & FOV wedge marker
    this.userMarker = this.createUserMarker();
    this.userMarker.setLngLat(this.userLocation).addTo(this.map);

    this.map.on('load', () => {
      this.isLoaded = true;
      this.setupGeoLayers();
    });
  }

  resize(): void {
    this.map.resize();
  }

  updateLocation(loc: LocationState): void {
    this.userLocation = [loc.longitude, loc.latitude];
    this.userMarker.setLngLat(this.userLocation);

    // Gently pan map to stay centered on user
    this.map.easeTo({
      center: this.userLocation,
      duration: 300,
    });

    if (this.isLoaded) {
      this.updateFovCone();
    }
  }

  updateOrientation(ori: DeviceOrientationState): void {
    this.userHeading = ori.heading;
    this.updateUserMarkerRotation();
    if (this.isLoaded) {
      this.updateFovCone();
    }
  }

  setFov(fovDeg: number): void {
    this.fovDegrees = fovDeg;
    if (this.isLoaded) {
      this.updateFovCone();
    }
  }

  /**
   * Update peaks, settlements, and waterways layers on the map.
   */
  updateGeoData(peaks: Peak[], settlements: Settlement[], rivers: Waterway[]): void {
    if (!this.isLoaded) {
      this.map.once('load', () => this.updateGeoData(peaks, settlements, rivers));
      return;
    }

    // 1. Update Rivers GeoJSON
    const riverFeatures = rivers.flatMap((r) =>
      r.segments.map((seg) => ({
        type: 'Feature' as const,
        properties: { name: r.name, id: r.id },
        geometry: {
          type: 'LineString' as const,
          coordinates: seg.map((pt) => [pt.longitude, pt.latitude]),
        },
      }))
    );

    const riverSource = this.map.getSource('geo-rivers') as maplibregl.GeoJSONSource;
    if (riverSource) {
      riverSource.setData({
        type: 'FeatureCollection',
        features: riverFeatures,
      });
    }

    // 2. Update Peaks GeoJSON
    const peakFeatures = peaks.map((p) => ({
      type: 'Feature' as const,
      properties: {
        id: p.id,
        name: p.name,
        type: p.type,
        elevation: p.elevation ? `${Math.round(p.elevation)}m` : '',
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [p.longitude, p.latitude],
      },
    }));

    const peakSource = this.map.getSource('geo-peaks') as maplibregl.GeoJSONSource;
    if (peakSource) {
      peakSource.setData({
        type: 'FeatureCollection',
        features: peakFeatures,
      });
    }

    // 3. Update Settlements GeoJSON
    const settlementFeatures = settlements.map((s) => ({
      type: 'Feature' as const,
      properties: {
        id: s.id,
        name: s.name,
        type: s.type,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [s.longitude, s.latitude],
      },
    }));

    const settlementSource = this.map.getSource('geo-settlements') as maplibregl.GeoJSONSource;
    if (settlementSource) {
      settlementSource.setData({
        type: 'FeatureCollection',
        features: settlementFeatures,
      });
    }
  }

  private createUserMarker(): maplibregl.Marker {
    const el = document.createElement('div');
    el.className = 'map-user-marker';
    el.innerHTML = `
      <div class="user-cone-arrow">▲</div>
      <div class="user-dot"></div>
    `;
    return new maplibregl.Marker({ element: el, rotationAlignment: 'map' });
  }

  private updateUserMarkerRotation(): void {
    const el = this.userMarker.getElement();
    const arrow = el.querySelector('.user-cone-arrow') as HTMLElement;
    if (arrow) {
      arrow.style.transform = `rotate(${this.userHeading}deg)`;
    }
  }

  private setupGeoLayers(): void {
    // 1. Rivers Line Layer
    this.map.addSource('geo-rivers', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'geo-rivers-layer',
      type: 'line',
      source: 'geo-rivers',
      paint: {
        'line-color': '#0088ff',
        'line-width': 3,
        'line-opacity': 0.8,
      },
    });

    // 2. FOV Cone / Viewing Wedge Layer
    this.map.addSource('fov-cone', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'fov-cone-layer',
      type: 'fill',
      source: 'fov-cone',
      paint: {
        'fill-color': '#00e5ff',
        'fill-opacity': 0.18,
      },
    });

    this.map.addLayer({
      id: 'fov-cone-outline',
      type: 'line',
      source: 'fov-cone',
      paint: {
        'line-color': '#00e5ff',
        'line-width': 1.5,
        'line-dasharray': [2, 2],
      },
    });

    // 3. Settlements Points Layer
    this.map.addSource('geo-settlements', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'geo-settlements-layer',
      type: 'circle',
      source: 'geo-settlements',
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ff9100',
      },
    });

    // 4. Peaks Points Layer
    this.map.addSource('geo-peaks', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'geo-peaks-layer',
      type: 'circle',
      source: 'geo-peaks',
      paint: {
        'circle-radius': 6,
        'circle-color': '#00ffcc',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#000000',
      },
    });

    this.updateFovCone();
  }

  /**
   * Calculate polygon for the camera FOV cone on the map.
   */
  private updateFovCone(): void {
    const coneDistance = 8000; // 8 km visual wedge
    const halfFov = this.fovDegrees / 2;
    const leftBearing = this.userHeading - halfFov;
    const rightBearing = this.userHeading + halfFov;

    const [lon, lat] = this.userLocation;
    const leftPt = destinationPoint(lat, lon, leftBearing, coneDistance);
    const rightPt = destinationPoint(lat, lon, rightBearing, coneDistance);

    const coneSource = this.map.getSource('fov-cone') as maplibregl.GeoJSONSource;
    if (coneSource) {
      coneSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [lon, lat],
                  [leftPt.longitude, leftPt.latitude],
                  [rightPt.longitude, rightPt.latitude],
                  [lon, lat],
                ],
              ],
            },
          },
        ],
      });
    }
  }
}
