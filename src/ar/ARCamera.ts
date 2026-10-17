import * as THREE from 'three';
import { DEG2RAD, RAD2DEG } from '../geo/GeoMath';

export interface ARCameraOptions {
  horizontalFov: number; // e.g. 60°
  near: number;
  far: number;
}

const DEFAULT_OPTIONS: ARCameraOptions = {
  horizontalFov: 60,
  near: 1,
  far: 300_000, // 300 km
};

export class ARCamera {
  readonly camera: THREE.PerspectiveCamera;
  private options: ARCameraOptions;
  private width = 1;
  private height = 1;

  constructor(options: Partial<ARCameraOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.camera = new THREE.PerspectiveCamera(60, 1, this.options.near, this.options.far);
    this.camera.position.set(0, 0, 0); // Observer at origin
    this.camera.rotation.order = 'YXZ'; // Yaw (heading) -> Pitch -> Roll
  }

  get horizontalFov(): number {
    return this.options.horizontalFov;
  }

  set horizontalFov(val: number) {
    this.options.horizontalFov = val;
    this.updateProjection();
  }

  get verticalFov(): number {
    return this.camera.fov;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.updateProjection();
  }

  /**
   * Calculate vertical FOV from desired horizontal FOV and aspect ratio.
   * THREE.PerspectiveCamera uses vertical FOV in degrees.
   */
  private updateProjection(): void {
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;

    // Convert horizontal FOV to vertical FOV:
    // tan(hFov / 2) = aspect * tan(vFov / 2)
    const hFovRad = this.options.horizontalFov * DEG2RAD;
    const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / aspect);
    this.camera.fov = vFovRad * RAD2DEG;

    this.camera.updateProjectionMatrix();
  }

  /**
   * Update Three.js camera rotation to match device attitude.
   *
   * Heading (deg clockwise from North):
   * North is -Z, East is +X, South is +Z, West is -X.
   * Rotation around Y axis: -heading * DEG2RAD
   *
   * Pitch:
   * Looking up tilts camera up (rotate around local X)
   *
   * Roll:
   * Tilt sideways (rotate around local Z)
   */
  updateOrientation(heading: number, pitch: number, roll: number): void {
    const yawRad = -heading * DEG2RAD;
    const pitchRad = pitch * DEG2RAD;
    const rollRad = -roll * DEG2RAD;

    // Set rotation in YXZ order
    this.camera.rotation.set(pitchRad, yawRad, rollRad, 'YXZ');
  }
}
