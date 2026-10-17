import { Emitter } from '../app/Emitter';
import { smoothScalar } from './SensorSmoothing';

export interface LocationState {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  altitudeAccuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
  isSimulated: boolean;
}

export type LocationPermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable';

export interface LocationStatus {
  permission: LocationPermissionState;
  active: boolean;
  accuracyWarning: boolean;
  errorMessage?: string;
}

export interface LocationEvents {
  location: LocationState;
  status: LocationStatus;
}

// Default Innsbruck Alpine location (superb demo location surrounded by Nordkette, Karwendel, Serles, Patscherkofel)
export const INNSBRUCK_DEMO_LOCATION: LocationState = {
  latitude: 47.2692,
  longitude: 11.4041,
  altitude: 574,
  accuracy: 5,
  altitudeAccuracy: 3,
  speed: 0,
  heading: null,
  timestamp: Date.now(),
  isSimulated: true,
};

export class LocationManager extends Emitter<LocationEvents> {
  private watchId: number | null = null;
  private current: LocationState | null = null;
  private status: LocationStatus = {
    permission: 'prompt',
    active: false,
    accuracyWarning: false,
  };

  private isSimulated = false;
  private simulatedLocation: LocationState = { ...INNSBRUCK_DEMO_LOCATION };
  private altitudeSmoothingAlpha = 0.2; // Low-pass filter for GPS altitude
  private coordSmoothingAlpha = 0.35; // Coordinate low-pass filter

  constructor() {
    super();
  }

  get state(): LocationState | null {
    if (this.isSimulated) {
      return this.simulatedLocation;
    }
    return this.current;
  }

  get currentStatus(): LocationStatus {
    return this.status;
  }

  get isSimulating(): boolean {
    return this.isSimulated;
  }

  /**
   * Start watching device location.
   */
  start(): void {
    if (this.isSimulated) {
      this.status.active = true;
      this.emit('status', this.status);
      this.emit('location', this.simulatedLocation);
      return;
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.status = {
        permission: 'unavailable',
        active: false,
        accuracyWarning: false,
        errorMessage: 'Geolocation is not supported by your browser.',
      };
      this.emit('status', this.status);
      return;
    }

    if (this.watchId !== null) return;

    this.status.active = true;
    this.emit('status', this.status);

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handlePosition(pos),
      (err) => this.handleError(err),
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000,
      }
    );
  }

  /**
   * Stop watching device location.
   */
  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.status.active = false;
    this.emit('status', this.status);
  }

  /**
   * Switch between real GPS and simulated demo location.
   */
  setSimulated(enable: boolean, customLoc?: Partial<LocationState>): void {
    this.isSimulated = enable;
    if (customLoc) {
      this.simulatedLocation = {
        ...this.simulatedLocation,
        ...customLoc,
        isSimulated: true,
        timestamp: Date.now(),
      };
    }

    if (enable) {
      if (this.watchId !== null) {
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
      this.status.permission = 'granted';
      this.status.accuracyWarning = false;
      this.emit('status', this.status);
      this.emit('location', this.simulatedLocation);
    } else {
      this.start();
    }
  }

  /**
   * Update manual simulated coordinate values (useful for debug simulator sliders).
   */
  updateSimulated(partial: Partial<LocationState>): void {
    this.simulatedLocation = {
      ...this.simulatedLocation,
      ...partial,
      isSimulated: true,
      timestamp: Date.now(),
    };
    if (this.isSimulated) {
      this.emit('location', this.simulatedLocation);
    }
  }

  private handlePosition(pos: GeolocationPosition): void {
    const coords = pos.coords;
    const rawAlt = coords.altitude ?? 500; // fallback if altitude not exposed by device
    const accuracy = coords.accuracy;

    // Apply smoothing to coordinates & altitude
    const prev = this.current;
    const smoothedLat = prev
      ? smoothScalar(prev.latitude, coords.latitude, this.coordSmoothingAlpha)
      : coords.latitude;
    const smoothedLon = prev
      ? smoothScalar(prev.longitude, coords.longitude, this.coordSmoothingAlpha)
      : coords.longitude;
    const smoothedAlt = prev
      ? smoothScalar(prev.altitude, rawAlt, this.altitudeSmoothingAlpha)
      : rawAlt;

    this.current = {
      latitude: smoothedLat,
      longitude: smoothedLon,
      altitude: smoothedAlt,
      accuracy,
      altitudeAccuracy: coords.altitudeAccuracy,
      speed: coords.speed,
      heading: coords.heading,
      timestamp: pos.timestamp,
      isSimulated: false,
    };

    this.status.permission = 'granted';
    this.status.accuracyWarning = accuracy > 35; // warn if > 35m accuracy
    this.status.errorMessage = undefined;

    this.emit('status', this.status);
    if (!this.isSimulated) {
      this.emit('location', this.current);
    }
  }

  private handleError(err: GeolocationPositionError): void {
    let msg = 'Location error occurred.';
    let perm: LocationPermissionState = 'unavailable';

    switch (err.code) {
      case err.PERMISSION_DENIED:
        perm = 'denied';
        msg = 'Location permission is required. Please enable location services in your browser settings.';
        break;
      case err.POSITION_UNAVAILABLE:
        perm = 'unavailable';
        msg = 'Location unavailable. Please check your GPS signal or try simulated mode.';
        break;
      case err.TIMEOUT:
        msg = 'Location request timed out. Retrying...';
        break;
    }

    this.status = {
      permission: perm,
      active: false,
      accuracyWarning: false,
      errorMessage: msg,
    };
    this.emit('status', this.status);
  }
}
