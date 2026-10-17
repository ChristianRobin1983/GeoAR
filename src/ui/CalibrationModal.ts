import { headingToCardinal, normalizeAngle } from '../geo/GeoMath';
import type { DeviceOrientationState } from '../sensors/OrientationManager';
import type { LocationState } from '../sensors/LocationManager';

export interface CalibrationCallbacks {
  onClose: () => void;
}

export class CalibrationModal {
  private container: HTMLElement;
  private callbacks: CalibrationCallbacks;
  private dialNeedle!: HTMLElement;
  private headingVal!: HTMLElement;
  private compassAccVal!: HTMLElement;
  private gpsAccVal!: HTMLElement;

  constructor(container: HTMLElement, callbacks: CalibrationCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  show(initialOri?: DeviceOrientationState, initialLoc?: LocationState | null): void {
    this.container.innerHTML = `
      <div class="calib-backdrop">
        <div class="calib-card">
          <div class="calib-header">
            <h3>Compass Calibration</h3>
            <button id="btn-close-calib" class="btn-close">✕</button>
          </div>

          <div class="calib-body">
            <p class="calib-instruction">
              Turn your phone slowly in a figure-8 or smooth circle to calibrate magnetic sensors.
            </p>

            <!-- Circular Compass Rose Dial -->
            <div class="calib-dial-wrapper">
              <div class="calib-dial">
                <span class="mark mark-n">N 0°</span>
                <span class="mark mark-ne">NE 45°</span>
                <span class="mark mark-e">E 90°</span>
                <span class="mark mark-se">SE 135°</span>
                <span class="mark mark-s">S 180°</span>
                <span class="mark mark-sw">SW 225°</span>
                <span class="mark mark-w">W 270°</span>
                <span class="mark mark-nw">NW 315°</span>

                <div class="dial-needle-pivot" id="dial-needle">
                  <div class="needle-north">▲</div>
                  <div class="needle-south">▼</div>
                </div>
              </div>
            </div>

            <!-- Big Live Reading -->
            <div class="calib-reading">
              <span id="calib-heading-val">N 0°</span>
            </div>

            <!-- Sensor Precision Badges -->
            <div class="calib-stats">
              <div class="stat-pill">
                <span class="stat-label">GPS Accuracy</span>
                <span class="stat-val" id="calib-gps-acc">± -- m</span>
              </div>
              <div class="stat-pill">
                <span class="stat-label">Compass Accuracy</span>
                <span class="stat-val" id="calib-compass-acc">± -- °</span>
              </div>
            </div>

            <button id="btn-calib-done" class="btn btn-primary btn-full" style="margin-top: 16px;">
              Done
            </button>
          </div>
        </div>
      </div>
    `;

    this.dialNeedle = this.container.querySelector('#dial-needle') as HTMLElement;
    this.headingVal = this.container.querySelector('#calib-heading-val') as HTMLElement;
    this.compassAccVal = this.container.querySelector('#calib-compass-acc') as HTMLElement;
    this.gpsAccVal = this.container.querySelector('#calib-gps-acc') as HTMLElement;

    this.container.querySelector('#btn-close-calib')?.addEventListener('click', () => this.hide());
    this.container.querySelector('#btn-calib-done')?.addEventListener('click', () => this.hide());
    this.container.querySelector('.calib-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hide();
    });

    if (initialOri) this.updateOrientation(initialOri);
    if (initialLoc) this.updateLocation(initialLoc);
  }

  updateOrientation(ori: DeviceOrientationState): void {
    if (!this.dialNeedle) return;
    const h = normalizeAngle(ori.heading);
    const card = headingToCardinal(h);

    this.dialNeedle.style.transform = `rotate(${-h}deg)`;
    this.headingVal.textContent = `${card} ${Math.round(h)}°`;

    if (ori.accuracy !== undefined) {
      this.compassAccVal.textContent = `±${Math.round(ori.accuracy)}°`;
    } else {
      this.compassAccVal.textContent = 'Active';
    }
  }

  updateLocation(loc: LocationState | null): void {
    if (!this.gpsAccVal) return;
    if (loc) {
      this.gpsAccVal.textContent = `±${Math.round(loc.accuracy)} m`;
    } else {
      this.gpsAccVal.textContent = 'Searching';
    }
  }

  hide(): void {
    this.container.innerHTML = '';
    this.callbacks.onClose();
  }
}
