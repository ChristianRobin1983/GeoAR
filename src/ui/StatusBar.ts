import { headingToCardinal, formatCoordinate } from '../geo/GeoMath';
import type { LocationState, LocationStatus } from '../sensors/LocationManager';
import type { DeviceOrientationState } from '../sensors/OrientationManager';
import type { DataStatus } from '../geo/GeoDataManager';

export interface StatusBarCallbacks {
  onOpenSettings: () => void;
  onOpenCalibration: () => void;
  onToggleDebug: () => void;
}

export class StatusBar {
  private container: HTMLElement;
  private callbacks: StatusBarCallbacks;

  private locationTextEl!: HTMLElement;
  private headingTextEl!: HTMLElement;
  private altitudeTextEl!: HTMLElement;
  private accuracyBadgeEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private gpsDotEl!: HTMLElement;

  constructor(container: HTMLElement, callbacks: StatusBarCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="hud-status-bar">
        <!-- Left: GPS & Coordinates -->
        <div class="hud-group hud-gps-group">
          <span class="hud-status-dot dot-gps" id="hud-gps-dot"></span>
          <div class="hud-values">
            <span class="hud-main-val" id="hud-coords">Waiting for GPS...</span>
            <span class="hud-sub-val" id="hud-altitude">-- m</span>
          </div>
        </div>

        <!-- Center: Heading & Rose -->
        <div class="hud-group hud-compass-group" id="btn-calibrate-quick" title="Click to calibrate compass">
          <svg class="hud-compass-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
          <div class="hud-values">
            <span class="hud-main-val" id="hud-heading">N 0°</span>
            <span class="hud-sub-val" id="hud-accuracy">± -- m</span>
          </div>
        </div>

        <!-- Right: Actions -->
        <div class="hud-group hud-actions-group">
          <button id="btn-status-debug" class="hud-icon-btn" title="Toggle Sensor & Debug HUD">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16v16H4zM4 9h16M9 4v16"/>
            </svg>
          </button>

          <button id="btn-status-settings" class="hud-icon-btn" title="Settings & Layers">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Warning & Notice Banner -->
      <div id="hud-banner" class="hud-banner" style="display: none;"></div>
    `;

    this.locationTextEl = this.container.querySelector('#hud-coords') as HTMLElement;
    this.headingTextEl = this.container.querySelector('#hud-heading') as HTMLElement;
    this.altitudeTextEl = this.container.querySelector('#hud-altitude') as HTMLElement;
    this.accuracyBadgeEl = this.container.querySelector('#hud-accuracy') as HTMLElement;
    this.bannerEl = this.container.querySelector('#hud-banner') as HTMLElement;
    this.gpsDotEl = this.container.querySelector('#hud-gps-dot') as HTMLElement;

    this.container.querySelector('#btn-status-settings')?.addEventListener('click', () => {
      this.callbacks.onOpenSettings();
    });

    this.container.querySelector('#btn-calibrate-quick')?.addEventListener('click', () => {
      this.callbacks.onOpenCalibration();
    });

    this.container.querySelector('#btn-status-debug')?.addEventListener('click', () => {
      this.callbacks.onToggleDebug();
    });
  }

  updateLocation(loc: LocationState | null, status: LocationStatus): void {
    if (!loc) {
      this.locationTextEl.textContent = 'Searching GPS...';
      this.gpsDotEl.className = 'hud-status-dot dot-yellow';
      return;
    }

    this.gpsDotEl.className = loc.isSimulated
      ? 'hud-status-dot dot-blue'
      : status.accuracyWarning
      ? 'hud-status-dot dot-yellow'
      : 'hud-status-dot dot-green';

    const latStr = formatCoordinate(loc.latitude, 4);
    const lonStr = formatCoordinate(loc.longitude, 4);
    this.locationTextEl.textContent = `${latStr}, ${lonStr}`;
    this.altitudeTextEl.textContent = `${Math.round(loc.altitude)} m alt`;
    this.accuracyBadgeEl.textContent = `±${Math.round(loc.accuracy)} m`;

    if (status.accuracyWarning) {
      this.showBanner(`Low GPS accuracy (±${Math.round(loc.accuracy)} m). Position may drift.`);
    } else if (loc.isSimulated) {
      this.showBanner('Demo Mode active (Innsbruck Alpine simulated position).');
    } else {
      this.hideBanner();
    }
  }

  updateOrientation(ori: DeviceOrientationState): void {
    const card = headingToCardinal(ori.heading);
    this.headingTextEl.textContent = `${card} ${Math.round(ori.heading)}°`;
  }

  updateDataStatus(status: DataStatus): void {
    if (status.offline) {
      this.showBanner('Offline: Using local cached geographic data.');
    } else if (status.usingStaleCache) {
      this.showBanner('Overpass busy: Showing cached geographic data.');
    } else if (status.loading) {
      this.showBanner('Loading OpenStreetMap data...');
    }
  }

  showBanner(msg: string): void {
    this.bannerEl.textContent = msg;
    this.bannerEl.style.display = 'block';
  }

  hideBanner(): void {
    this.bannerEl.style.display = 'none';
  }
}
