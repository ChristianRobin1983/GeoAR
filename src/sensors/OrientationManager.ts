import { Emitter } from '../app/Emitter';
import { DEG2RAD, RAD2DEG, normalizeAngle, clamp } from '../geo/GeoMath';
import { smoothAngle, smoothScalar } from './SensorSmoothing';

export interface DeviceOrientationState {
  /** Compass heading in degrees [0, 360), 0 = North, 90 = East */
  heading: number;
  /** Pitch angle in degrees: 0 = horizontal phone, +90 = vertical up, -90 = straight down */
  pitch: number;
  /** Roll angle in degrees: tilt sideways */
  roll: number;
  /** Estimated accuracy in degrees, if available */
  accuracy?: number;
  /** Screen orientation angle (0, 90, 180, 270) */
  screenOrientation: number;
  /** True if using simulated orientation (e.g. desktop testing) */
  isSimulated: boolean;
}

export type OrientationPermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable';

export interface OrientationStatus {
  permission: OrientationPermissionState;
  active: boolean;
  absoluteAvailable: boolean;
  needsUserGesture: boolean;
  errorMessage?: string;
}

export interface OrientationEvents {
  orientation: DeviceOrientationState;
  status: OrientationStatus;
}

export class OrientationManager extends Emitter<OrientationEvents> {
  private current: DeviceOrientationState = {
    heading: 0,
    pitch: 0,
    roll: 0,
    screenOrientation: 0,
    isSimulated: false,
  };

  private status: OrientationStatus = {
    permission: 'prompt',
    active: false,
    absoluteAvailable: false,
    needsUserGesture: false,
  };

  private isSimulated = false;
  private isListening = false;
  private smoothingAlpha = 0.22; // Smooth filter for responsive compass with low jitter
  private boundOrientationListener: ((e: DeviceOrientationEvent) => void) | null = null;
  private boundScreenListener: (() => void) | null = null;

  constructor() {
    super();
    this.detectCapabilities();
  }

  get state(): DeviceOrientationState {
    return this.current;
  }

  get currentStatus(): OrientationStatus {
    return this.status;
  }

  get isSimulating(): boolean {
    return this.isSimulated;
  }

  private detectCapabilities(): void {
    if (typeof window === 'undefined') return;

    // Check if iOS 13+ permission method exists
    const hasRequestPermission =
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function';

    this.status.needsUserGesture = hasRequestPermission;

    if (!('ondeviceorientation' in window) && !('DeviceOrientationEvent' in window)) {
      this.status.permission = 'unavailable';
      this.status.errorMessage = 'Device orientation sensors are not available on this device.';
    }
  }

  /**
   * Request permission (required on iOS Safari via user button click).
   */
  async requestPermission(): Promise<OrientationPermissionState> {
    if (this.isSimulated) {
      this.status.permission = 'granted';
      this.emit('status', this.status);
      return 'granted';
    }

    const doe = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof doe !== 'undefined' && typeof doe.requestPermission === 'function') {
      try {
        const response = await doe.requestPermission();
        if (response === 'granted') {
          this.status.permission = 'granted';
          this.status.errorMessage = undefined;
          this.start();
        } else {
          this.status.permission = 'denied';
          this.status.errorMessage = 'Motion and orientation permission was denied.';
        }
      } catch (err) {
        this.status.permission = 'denied';
        this.status.errorMessage = err instanceof Error ? err.message : 'Error requesting orientation permission';
      }
    } else {
      // Non-iOS or older iOS does not require explicit requestPermission
      this.status.permission = 'granted';
      this.start();
    }

    this.emit('status', this.status);
    return this.status.permission;
  }

  start(): void {
    if (this.isSimulated) {
      this.status.active = true;
      this.emit('status', this.status);
      this.emit('orientation', this.current);
      return;
    }

    if (this.isListening || typeof window === 'undefined') return;

    this.boundOrientationListener = (e: DeviceOrientationEvent) => this.handleOrientation(e);
    this.boundScreenListener = () => this.handleScreenOrientationChange();

    // Prefer deviceorientationabsolute if supported (Android Chrome / W3C)
    const win = window as unknown as {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => void;
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => void;
    };

    if ('ondeviceorientationabsolute' in window) {
      win.addEventListener('deviceorientationabsolute', this.boundOrientationListener as EventListener, true);
      this.status.absoluteAvailable = true;
    } else if ('ondeviceorientation' in window) {
      win.addEventListener('deviceorientation', this.boundOrientationListener as EventListener, true);
    }

    const screenOri = screen.orientation as EventTarget | undefined;
    if (screenOri && typeof screenOri.addEventListener === 'function') {
      screenOri.addEventListener('change', this.boundScreenListener);
    } else {
      window.addEventListener('orientationchange', this.boundScreenListener);
    }

    this.updateScreenOrientation();
    this.isListening = true;
    this.status.active = true;
    this.emit('status', this.status);
  }

  stop(): void {
    if (!this.isListening || typeof window === 'undefined') return;

    if (this.boundOrientationListener) {
      window.removeEventListener('deviceorientationabsolute', this.boundOrientationListener as EventListener, true);
      window.removeEventListener('deviceorientation', this.boundOrientationListener as EventListener, true);
      this.boundOrientationListener = null;
    }

    if (this.boundScreenListener) {
      const screenOri = screen.orientation as EventTarget | undefined;
      if (screenOri && typeof screenOri.removeEventListener === 'function') {
        screenOri.removeEventListener('change', this.boundScreenListener);
      } else {
        window.removeEventListener('orientationchange', this.boundScreenListener);
      }
      this.boundScreenListener = null;
    }

    this.isListening = false;
    this.status.active = false;
    this.emit('status', this.status);
  }

  setSimulated(enable: boolean, initialHeading = 0, initialPitch = 0, initialRoll = 0): void {
    this.isSimulated = enable;
    if (enable) {
      this.stop();
      this.current = {
        heading: normalizeAngle(initialHeading),
        pitch: clamp(initialPitch, -90, 90),
        roll: clamp(initialRoll, -180, 180),
        screenOrientation: 0,
        isSimulated: true,
      };
      this.status.permission = 'granted';
      this.status.active = true;
      this.emit('status', this.status);
      this.emit('orientation', this.current);
    } else {
      this.start();
    }
  }

  updateSimulated(partial: Partial<DeviceOrientationState>): void {
    if (!this.isSimulated) return;
    this.current = {
      ...this.current,
      ...partial,
      heading: partial.heading !== undefined ? normalizeAngle(partial.heading) : this.current.heading,
      pitch: partial.pitch !== undefined ? clamp(partial.pitch, -90, 90) : this.current.pitch,
      roll: partial.roll !== undefined ? clamp(partial.roll, -180, 180) : this.current.roll,
      isSimulated: true,
    };
    this.emit('orientation', this.current);
  }

  private handleScreenOrientationChange(): void {
    this.updateScreenOrientation();
  }

  private updateScreenOrientation(): void {
    let angle = 0;
    if (typeof window !== 'undefined') {
      if (window.screen?.orientation?.angle !== undefined) {
        angle = window.screen.orientation.angle;
      } else if (typeof window.orientation === 'number') {
        angle = window.orientation;
      }
    }
    this.current.screenOrientation = angle;
  }

  /**
   * Process incoming orientation event and resolve heading, pitch, and roll.
   */
  private handleOrientation(e: DeviceOrientationEvent): void {
    let heading = 0;
    let accuracy: number | undefined;

    // 1. iOS Safari webkitCompassHeading (direct compass reading, True North = 0)
    const iosEvent = e as unknown as { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
    if (typeof iosEvent.webkitCompassHeading === 'number' && Number.isFinite(iosEvent.webkitCompassHeading)) {
      heading = iosEvent.webkitCompassHeading;
      accuracy = iosEvent.webkitCompassAccuracy;
    } else if (e.alpha !== null && Number.isFinite(e.alpha)) {
      // 2. W3C standard: alpha is rotation around Z axis
      // When phone is upright, heading must be computed from alpha, beta, gamma
      heading = this.calculateCompassFromEuler(e.alpha, e.beta ?? 0, e.gamma ?? 0);
    } else {
      return;
    }

    // Adjust for screen orientation (landscape left = +90°, landscape right = -90°)
    if (this.current.screenOrientation !== 0) {
      heading = normalizeAngle(heading + this.current.screenOrientation);
    }

    // Pitch: Beta is rotation around X-axis (-180 to 180).
    // Holding phone vertically in front of eye: beta ≈ 90°.
    // We normalize pitch so 0° = horizontal, +90° = vertical up, -90° = straight down.
    const rawBeta = e.beta ?? 0;
    const pitch = clamp(rawBeta - 90, -90, 90);

    // Roll: Gamma is rotation around Y-axis (-90 to 90).
    const roll = clamp(e.gamma ?? 0, -90, 90);

    // Apply circular smoothing on heading, and EMA on pitch/roll
    const prev = this.current;
    const smoothedHeading = smoothAngle(prev.heading, heading, this.smoothingAlpha);
    const smoothedPitch = smoothScalar(prev.pitch, pitch, this.smoothingAlpha);
    const smoothedRoll = smoothScalar(prev.roll, roll, this.smoothingAlpha);

    this.current = {
      heading: smoothedHeading,
      pitch: smoothedPitch,
      roll: smoothedRoll,
      accuracy,
      screenOrientation: this.current.screenOrientation,
      isSimulated: false,
    };

    this.emit('orientation', this.current);
  }

  /**
   * Compute compass heading from W3C Euler angles (alpha, beta, gamma).
   */
  private calculateCompassFromEuler(alpha: number, beta: number, gamma: number): number {
    const _x = beta * DEG2RAD;
    const _y = gamma * DEG2RAD;
    const _z = alpha * DEG2RAD;

    const cY = Math.cos(_y);
    const cZ = Math.cos(_z);
    const sX = Math.sin(_x);
    const sY = Math.sin(_y);
    const sZ = Math.sin(_z);

    // Rotation matrix elements for device orientation
    const Vx = -cZ * sY - sZ * sX * cY;
    const Vy = -sZ * sY + cZ * sX * cY;

    // Heading in radians
    let compassHeading = Math.atan2(Vx, Vy) * RAD2DEG;
    if (compassHeading < 0) {
      compassHeading += 360;
    }

    return normalizeAngle(compassHeading);
  }
}
