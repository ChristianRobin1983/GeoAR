import { formatCoordinate } from '../geo/GeoMath';
import type { LocationState } from '../sensors/LocationManager';
import type { DeviceOrientationState } from '../sensors/OrientationManager';
import type { PlacedLabel } from '../ar/CollisionManager';

export interface DebugCallbacks {
  onUpdateSimulatedLocation: (partial: Partial<LocationState>) => void;
  onUpdateSimulatedOrientation: (partial: Partial<DeviceOrientationState>) => void;
  onClose: () => void;
}

export class DebugPanel {
  private container: HTMLElement;
  private callbacks: DebugCallbacks;
  private isVisible = false;

  private sliderHeading!: HTMLInputElement;
  private sliderPitch!: HTMLInputElement;

  constructor(container: HTMLElement, callbacks: DebugCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  toggle(): void {
    if (this.isVisible) this.hide();
    else this.show();
  }

  show(): void {
    this.isVisible = true;
    this.container.innerHTML = `
      <div class="debug-panel">
        <div class="debug-head">
          <span>🛠️ Sensor & AR Debug HUD</span>
          <button id="btn-close-debug" class="debug-close-btn">✕</button>
        </div>

        <div class="debug-grid">
          <!-- Diagnostics -->
          <div class="debug-card">
            <h4>Live Diagnostics</h4>
            <div class="debug-row"><span>Position:</span> <span id="dbg-pos" class="val">--</span></div>
            <div class="debug-row"><span>Altitude:</span> <span id="dbg-alt" class="val">--</span></div>
            <div class="debug-row"><span>GPS Accuracy:</span> <span id="dbg-acc" class="val">--</span></div>
            <div class="debug-row"><span>Heading / Pitch:</span> <span id="dbg-att" class="val">--</span></div>
            <div class="debug-row"><span>Roll / FOV:</span> <span id="dbg-roll" class="val">--</span></div>
            <div class="debug-row"><span>Objects (Tot/Vis):</span> <span id="dbg-objs" class="val">--</span></div>
            <div class="debug-row"><span>Render FPS:</span> <span id="dbg-fps" class="val">--</span></div>
          </div>

          <!-- Manual Attitude Simulator -->
          <div class="debug-card">
            <h4>Attitude Simulator</h4>
            <div class="debug-ctrl">
              <label>Heading: <span id="dbg-val-heading">0°</span></label>
              <input type="range" id="dbg-slider-heading" min="0" max="360" value="0"/>
            </div>
            <div class="debug-ctrl">
              <label>Pitch: <span id="dbg-val-pitch">0°</span></label>
              <input type="range" id="dbg-slider-pitch" min="-60" max="60" value="0"/>
            </div>
          </div>
        </div>

        <!-- Selected Object Inspection -->
        <div class="debug-card" style="margin-top: 8px;">
          <h4>Inspected AR Object</h4>
          <div id="dbg-selected" class="debug-selected-text">Tap any AR label to inspect distance, bearing, and geometry.</div>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-close-debug')?.addEventListener('click', () => this.hide());

    this.sliderHeading = this.container.querySelector('#dbg-slider-heading') as HTMLInputElement;
    this.sliderPitch = this.container.querySelector('#dbg-slider-pitch') as HTMLInputElement;

    const valH = this.container.querySelector('#dbg-val-heading') as HTMLElement;
    const valP = this.container.querySelector('#dbg-val-pitch') as HTMLElement;

    this.sliderHeading?.addEventListener('input', () => {
      const heading = parseFloat(this.sliderHeading.value);
      valH.textContent = `${Math.round(heading)}°`;
      this.callbacks.onUpdateSimulatedOrientation({ heading, isSimulated: true });
    });

    this.sliderPitch?.addEventListener('input', () => {
      const pitch = parseFloat(this.sliderPitch.value);
      valP.textContent = `${Math.round(pitch)}°`;
      this.callbacks.onUpdateSimulatedOrientation({ pitch, isSimulated: true });
    });
  }

  hide(): void {
    this.isVisible = false;
    this.container.innerHTML = '';
    this.callbacks.onClose();
  }

  updateMetrics(
    loc: LocationState | null,
    ori: DeviceOrientationState,
    fov: number,
    totalObjs: number,
    visObjs: number,
    fps: number
  ): void {
    if (!this.isVisible) return;

    const elPos = this.container.querySelector('#dbg-pos');
    if (elPos && loc) {
      elPos.textContent = `${formatCoordinate(loc.latitude, 4)}, ${formatCoordinate(loc.longitude, 4)}`;
    }

    const elAlt = this.container.querySelector('#dbg-alt');
    if (elAlt && loc) {
      elAlt.textContent = `${Math.round(loc.altitude)} m`;
    }

    const elAcc = this.container.querySelector('#dbg-acc');
    if (elAcc && loc) {
      elAcc.textContent = `±${Math.round(loc.accuracy)} m`;
    }

    const elAtt = this.container.querySelector('#dbg-att');
    if (elAtt) {
      elAtt.textContent = `H: ${Math.round(ori.heading)}° / P: ${Math.round(ori.pitch)}°`;
    }

    const elRoll = this.container.querySelector('#dbg-roll');
    if (elRoll) {
      elRoll.textContent = `R: ${Math.round(ori.roll)}° / FOV: ${fov}°`;
    }

    const elObjs = this.container.querySelector('#dbg-objs');
    if (elObjs) {
      elObjs.textContent = `${totalObjs} loaded / ${visObjs} visible`;
    }

    const elFps = this.container.querySelector('#dbg-fps');
    if (elFps) {
      elFps.textContent = `${fps} FPS`;
    }
  }

  inspectObject(label: PlacedLabel): void {
    if (!this.isVisible) return;
    const el = this.container.querySelector('#dbg-selected');
    if (!el) return;

    const p = label.projected;
    const obj = p.object;

    el.innerHTML = `
      <strong>${obj.name}</strong> (${obj.type})<br/>
      Elevation: ${obj.elevation ? Math.round(obj.elevation) + ' m' : 'unknown'}<br/>
      Distance: ${(p.distance / 1000).toFixed(2)} km<br/>
      Bearing: ${p.bearing.toFixed(1)}° (rel: ${p.relativeBearing.toFixed(1)}°)<br/>
      Elev. Angle: ${p.elevationAngle.toFixed(2)}°<br/>
      Screen XY: ${Math.round(label.placedX)}, ${Math.round(label.placedY)} px (level: ${label.level})
    `;
  }
}
