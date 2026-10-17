import * as THREE from 'three';
import { ARCamera } from './ARCamera';
import { ARProjection, type ProjectedObject } from './ARProjection';
import { CollisionManager, type PlacedLabel } from './CollisionManager';
import { LabelManager } from './LabelManager';
import type { GeoObject } from '../models/GeoObject';
import type { Waterway } from '../models/Waterway';
import type { LocalPosition } from '../geo/CoordinateTransform';
import { enuToWorld, LocalFrame, applyRefraction } from '../geo/CoordinateTransform';
import type { DeviceOrientationState } from '../sensors/OrientationManager';
import type { LocationState } from '../sensors/LocationManager';

export interface ARRendererOptions {
  horizontalFov?: number;
  maxPeaks?: number;
  maxSettlements?: number;
  maxRivers?: number;
  showPeaks?: boolean;
  showSettlements?: boolean;
  showRivers?: boolean;
  arOpacity?: number;
}

export type CameraStreamState = 'uninitialized' | 'requesting' | 'active' | 'denied' | 'error';

export class ARRenderer {
  private container: HTMLElement;
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private labelsContainer: HTMLElement;

  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private arCamera: ARCamera;
  private projection: ARProjection;
  private collisionManager: CollisionManager;
  private labelManager: LabelManager;

  private riverGroup: THREE.Group;

  private mediaStream: MediaStream | null = null;
  private cameraState: CameraStreamState = 'uninitialized';
  private cameraErrorMessage?: string;

  private activeObjects: GeoObject[] = [];
  private activeRivers: Waterway[] = [];
  private observer: LocalPosition = { latitude: 0, longitude: 0, elevation: 0 };
  private orientation: DeviceOrientationState = {
    heading: 0,
    pitch: 0,
    roll: 0,
    screenOrientation: 0,
    isSimulated: false,
  };

  private animationFrameId: number | null = null;
  private isRunning = false;
  private fps = 60;
  private frameCount = 0;
  private lastFpsTime = performance.now();

  private options: ARRendererOptions;

  constructor(container: HTMLElement, options: ARRendererOptions = {}) {
    this.container = container;
    this.options = {
      horizontalFov: 60,
      maxPeaks: 20,
      maxSettlements: 15,
      maxRivers: 5,
      showPeaks: true,
      showSettlements: true,
      showRivers: true,
      arOpacity: 1.0,
      ...options,
    };

    // 1. Setup DOM Elements
    this.container.innerHTML = '';
    this.container.classList.add('ar-viewport-container');

    // Video background
    this.videoElement = document.createElement('video');
    this.videoElement.className = 'ar-camera-video';
    this.videoElement.setAttribute('autoplay', '');
    this.videoElement.setAttribute('playsinline', '');
    this.videoElement.setAttribute('muted', '');
    this.videoElement.muted = true;
    this.container.appendChild(this.videoElement);

    // Three.js Canvas
    this.canvasElement = document.createElement('canvas');
    this.canvasElement.className = 'ar-webgl-canvas';
    this.container.appendChild(this.canvasElement);

    // Labels overlay container
    this.labelsContainer = document.createElement('div');
    this.labelsContainer.className = 'ar-labels-container';
    this.container.appendChild(this.labelsContainer);

    // OpenStreetMap attribution badge (visible in all view modes including AR-only)
    const arAttribution = document.createElement('div');
    arAttribution.className = 'ar-attribution-badge';
    arAttribution.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
    this.container.appendChild(arAttribution);

    // 2. Initialize Three.js
    this.scene = new THREE.Scene();
    this.arCamera = new ARCamera({ horizontalFov: this.options.horizontalFov });

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasElement,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.riverGroup = new THREE.Group();
    this.scene.add(this.riverGroup);

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    // 3. Setup Projection & Label Managers
    this.projection = new ARProjection(this.observer);
    this.collisionManager = new CollisionManager({
      maxPeaks: this.options.maxPeaks,
      maxSettlements: this.options.maxSettlements,
      maxRivers: this.options.maxRivers,
    });
    this.labelManager = new LabelManager(this.labelsContainer);

    // Bind resize
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  get currentFps(): number {
    return this.fps;
  }

  get streamState(): CameraStreamState {
    return this.cameraState;
  }

  get errorMessage(): string | undefined {
    return this.cameraErrorMessage;
  }

  get labels(): LabelManager {
    return this.labelManager;
  }

  setOptions(opts: Partial<ARRendererOptions>): void {
    this.options = { ...this.options, ...opts };
    if (opts.horizontalFov !== undefined) {
      this.arCamera.horizontalFov = opts.horizontalFov;
    }
    this.collisionManager.setOptions({
      maxPeaks: this.options.maxPeaks,
      maxSettlements: this.options.maxSettlements,
      maxRivers: this.options.maxRivers,
    });
    if (opts.arOpacity !== undefined) {
      this.labelsContainer.style.opacity = opts.arOpacity.toString();
      this.canvasElement.style.opacity = opts.arOpacity.toString();
    }
  }

  /**
   * Start device camera video feed.
   */
  async startCamera(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.cameraState = 'error';
      this.cameraErrorMessage = 'Camera API (getUserMedia) not supported in this browser.';
      return false;
    }

    this.cameraState = 'requesting';
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.mediaStream = stream;
      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      this.cameraState = 'active';
      this.cameraErrorMessage = undefined;
      return true;
    } catch (err) {
      const isDenied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      this.cameraState = isDenied ? 'denied' : 'error';
      this.cameraErrorMessage = isDenied
        ? 'Camera permission denied. Camera is required for AR view.'
        : err instanceof Error ? err.message : 'Unable to access camera';
      return false;
    }
  }

  stopCamera(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.videoElement.srcObject = null;
    this.cameraState = 'uninitialized';
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFpsTime = performance.now();
    this.frameCount = 0;
    this.animate();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.labelManager.clear();
  }

  updateLocation(loc: LocationState): void {
    this.observer = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      elevation: loc.altitude,
    };
    this.projection.updateObserver(this.observer);
    this.rebuildRiverMeshes();
  }

  updateOrientation(ori: DeviceOrientationState): void {
    this.orientation = ori;
    this.arCamera.updateOrientation(ori.heading, ori.pitch, ori.roll);
  }

  updateGeoData(peaks: GeoObject[], settlements: GeoObject[], rivers: Waterway[]): void {
    const list: GeoObject[] = [];
    if (this.options.showPeaks) list.push(...peaks);
    if (this.options.showSettlements) list.push(...settlements);
    if (this.options.showRivers) {
      // Add nearest point of each river as a label anchor
      for (const r of rivers) {
        list.push(r);
      }
    }

    this.activeObjects = list;
    this.activeRivers = rivers;
    this.rebuildRiverMeshes();
  }

  private handleResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    this.renderer.setSize(w, h);
    this.arCamera.resize(w, h);
  }

  /**
   * Rebuild 3D river polylines in Three.js world space.
   */
  private rebuildRiverMeshes(): void {
    // Clear old meshes
    while (this.riverGroup.children.length > 0) {
      const child = this.riverGroup.children[0];
      this.riverGroup.remove(child);
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
      }
    }

    if (!this.options.showRivers || this.activeRivers.length === 0) return;

    const frame = new LocalFrame(this.observer.latitude, this.observer.longitude, this.observer.elevation ?? 0);

    for (const river of this.activeRivers) {
      for (const segment of river.segments) {
        if (segment.length < 2) continue;

        const points: THREE.Vector3[] = [];
        for (const pt of segment) {
          const ele = pt.elevation ?? this.observer.elevation ?? 0;
          const enu = frame.toENU(pt.latitude, pt.longitude, ele);
          applyRefraction(enu);
          const world = enuToWorld(enu);
          points.push(new THREE.Vector3(world.x, world.y, world.z));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: 0x4aa3ff,
          linewidth: 2,
          transparent: true,
          opacity: 0.7,
        });

        const line = new THREE.Line(geometry, material);
        this.riverGroup.add(line);
      }
    }
  }

  private animate = (): void => {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(this.animate);

    // Compute FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    // 1. Render Three.js 3D Scene (river paths, etc.)
    this.renderer.render(this.scene, this.arCamera.camera);

    // 2. Project geographic labels into screen space
    this.renderLabels();
  };

  private renderLabels(): void {
    if (this.activeObjects.length === 0) {
      this.labelManager.clear();
      return;
    }

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    const projectionOpts = {
      horizontalFov: this.arCamera.horizontalFov,
      verticalFov: this.arCamera.verticalFov,
      screenWidth: w,
      screenHeight: h,
      userHeading: this.orientation.heading,
      userPitch: this.orientation.pitch,
      userRoll: this.orientation.roll,
      observer: this.observer,
    };

    // Project each active object
    const projected: ProjectedObject[] = [];
    for (const obj of this.activeObjects) {
      const p = this.projection.projectObject(obj, projectionOpts);
      if (p.isVisible) {
        projected.push(p);
      }
    }

    // Resolve collisions and limits
    const placed: PlacedLabel[] = this.collisionManager.resolveCollisions(projected);

    // Update HTML overlay badges
    this.labelManager.update(placed);
  }
}
