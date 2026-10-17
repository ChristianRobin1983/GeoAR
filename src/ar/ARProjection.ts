import {
  relativeBearing,
  calculateElevationAngle,
  clamp,
  smoothstep,
} from '../geo/GeoMath';
import { calculateDistance } from '../geo/Distance';
import { calculateBearing } from '../geo/Bearing';
import type { GeoObject } from '../models/GeoObject';
import type { LocalPosition, ENU } from '../geo/CoordinateTransform';
import { LocalFrame, applyRefraction } from '../geo/CoordinateTransform';
import { SETTLEMENT_RANK } from '../models/Settlement';

export interface ProjectedObject {
  object: GeoObject;
  distance: number;
  bearing: number;
  relativeBearing: number;
  elevationAngle: number;
  enu: ENU;
  /** Projected screen X in pixels */
  screenX: number;
  /** Projected screen Y in pixels */
  screenY: number;
  /** 0 to 1 opacity based on FOV edge fade */
  opacity: number;
  /** Visual scale factor calculated from distance and importance */
  scale: number;
  /** Calculated importance score (0 to 100) */
  score: number;
  /** True if within current viewing cone and in front of camera */
  isVisible: boolean;
}

export interface ProjectionOptions {
  horizontalFov: number; // e.g. 60°
  verticalFov: number; // computed from aspect ratio
  screenWidth: number;
  screenHeight: number;
  userHeading: number;
  userPitch: number; // 0 = level, + = looking up, - = looking down
  userRoll: number;
  observer: LocalPosition;
  enableEarthCurvature?: boolean;
}

export class ARProjection {
  private localFrame: LocalFrame;
  private observer: LocalPosition;

  constructor(observer: LocalPosition) {
    this.observer = observer;
    this.localFrame = new LocalFrame(observer.latitude, observer.longitude, observer.elevation ?? 0);
  }

  updateObserver(observer: LocalPosition): void {
    this.observer = observer;
    this.localFrame = new LocalFrame(observer.latitude, observer.longitude, observer.elevation ?? 0);
  }

  /**
   * Project a geographic object into camera screen space.
   */
  projectObject(obj: GeoObject, opts: ProjectionOptions): ProjectedObject {
    const dist = calculateDistance(
      this.observer.latitude,
      this.observer.longitude,
      obj.latitude,
      obj.longitude
    );

    const bearing = calculateBearing(
      this.observer.latitude,
      this.observer.longitude,
      obj.latitude,
      obj.longitude
    );

    const relBearing = relativeBearing(bearing, opts.userHeading);

    // Calculate elevation angle from observer to object
    const targetElevation = obj.elevation ?? this.observer.elevation ?? 0;
    const observerElevation = this.observer.elevation ?? 0;

    const elevationAngle = calculateElevationAngle(
      dist,
      observerElevation,
      targetElevation,
      { earthCurvature: opts.enableEarthCurvature ?? true }
    );

    // Local ENU coordinates
    const enu = this.localFrame.toENU(obj.latitude, obj.longitude, targetElevation);
    applyRefraction(enu);

    // Calculate screen position based on horizontal FOV and vertical FOV
    const halfHFov = opts.horizontalFov / 2;
    const halfVFov = opts.verticalFov / 2;

    // Horizontal position: -halfHFov to +halfHFov maps to 0 to screenWidth
    const normX = relBearing / halfHFov; // -1 (left edge) to +1 (right edge)
    const screenX = (normX * 0.5 + 0.5) * opts.screenWidth;

    // Vertical position: delta between elevationAngle and device pitch
    // Looking up (opts.userPitch > 0) moves horizon down
    const relPitch = elevationAngle - opts.userPitch;
    const normY = relPitch / halfVFov; // +1 (top edge) to -1 (bottom edge)
    const screenY = (0.5 - normY * 0.5) * opts.screenHeight;

    // Opacity fade at FOV edges (smooth fade between inner and outer bounds)
    const absRelBearing = Math.abs(relBearing);
    const fadeStart = halfHFov * 0.75; // e.g. 22.5° for 60° FOV
    const fadeEnd = halfHFov * 1.05; // e.g. 31.5°
    let opacity = 1.0;
    if (absRelBearing > fadeStart) {
      opacity = 1.0 - smoothstep(fadeStart, fadeEnd, absRelBearing);
    }

    // Scale calculation based on distance and importance
    const scale = this.calculateScale(obj, dist);
    const score = this.calculateImportanceScore(obj, dist, absRelBearing, halfHFov);

    const isVisible =
      absRelBearing < halfHFov * 1.1 &&
      screenX >= -100 &&
      screenX <= opts.screenWidth + 100 &&
      screenY >= -100 &&
      screenY <= opts.screenHeight + 100 &&
      opacity > 0.05;

    return {
      object: obj,
      distance: dist,
      bearing,
      relativeBearing: relBearing,
      elevationAngle,
      enu,
      screenX,
      screenY,
      opacity,
      scale,
      score,
      isVisible,
    };
  }

  /**
   * Distance-based scaling:
   * scale = clamp(MAX_SCALE / sqrt(distance), MIN_SCALE, MAX_SCALE) * importanceMultiplier
   */
  private calculateScale(obj: GeoObject, distanceM: number): number {
    const distKm = Math.max(0.5, distanceM / 1000);
    const baseScale = clamp(2.4 / Math.sqrt(distKm), 0.72, 1.45);

    let importanceMultiplier = 1.0;
    if (obj.type === 'peak') {
      const ele = obj.elevation ?? 1000;
      if (ele > 2500) importanceMultiplier = 1.25;
      else if (ele > 1800) importanceMultiplier = 1.1;
      if (obj.wikidata) importanceMultiplier += 0.15;
    } else if (obj.type === 'city') {
      importanceMultiplier = 1.35;
    } else if (obj.type === 'town') {
      importanceMultiplier = 1.18;
    } else if (obj.type === 'village') {
      importanceMultiplier = 1.0;
    } else if (obj.type === 'hamlet') {
      importanceMultiplier = 0.85;
    } else if (obj.type === 'river') {
      importanceMultiplier = 1.05;
    }

    return clamp(baseScale * importanceMultiplier, 0.65, 1.6);
  }

  /**
   * Section 21: Object Selection Scoring
   * score = distanceScore * 0.35 + elevationScore * 0.30 + nameScore * 0.15 + directionScore * 0.20
   */
  private calculateImportanceScore(
    obj: GeoObject,
    distanceM: number,
    absRelBearing: number,
    halfHFov: number
  ): number {
    // 1. Distance score: 100 for very close (<5km), 0 for far (>150km)
    const distKm = distanceM / 1000;
    const distanceScore = clamp(100 - (distKm / 150) * 100, 0, 100);

    // 2. Elevation score: 100 for high peaks (>3000m), 0 for low sea-level
    let elevationScore = 30;
    if (obj.elevation !== undefined) {
      elevationScore = clamp((obj.elevation / 3500) * 100, 0, 100);
    } else if (obj.type in SETTLEMENT_RANK) {
      elevationScore = (SETTLEMENT_RANK[obj.type as keyof typeof SETTLEMENT_RANK] / 4) * 80;
    }

    // 3. Name score: named objects and well-known wikidata entities get boost
    let nameScore = obj.name ? 70 : 10;
    if (obj.wikidata) nameScore += 30;

    // 4. Direction score: highest when dead-center in FOV
    const directionScore = clamp((1.0 - absRelBearing / halfHFov) * 100, 0, 100);

    return (
      distanceScore * 0.35 +
      elevationScore * 0.3 +
      nameScore * 0.15 +
      directionScore * 0.2
    );
  }
}
