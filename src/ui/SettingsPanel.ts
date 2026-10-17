export interface AppSettings {
  searchRadiusKm: number;
  showPeaks: boolean;
  showSettlements: boolean;
  showRivers: boolean;
  showElevation: boolean;
  arOpacity: number;
  labelScale: number;
  horizontalFov: number;
  demoMode: boolean;
}

export interface SettingsCallbacks {
  onSettingsChange: (settings: AppSettings) => void;
  onClearCache: () => void;
  onClose: () => void;
}

export class SettingsPanel {
  private container: HTMLElement;
  private callbacks: SettingsCallbacks;
  private settings: AppSettings;
  private isOpen = false;

  constructor(container: HTMLElement, initialSettings: AppSettings, callbacks: SettingsCallbacks) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.callbacks = callbacks;
  }

  get isPanelOpen(): boolean {
    return this.isOpen;
  }

  open(): void {
    this.isOpen = true;
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.container.innerHTML = '';
    this.callbacks.onClose();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="settings-backdrop">
        <div class="settings-modal">
          <div class="settings-header">
            <h2>AR & Map Settings</h2>
            <button id="btn-close-settings" class="btn-close" aria-label="Close">✕</button>
          </div>

          <div class="settings-content">
            <!-- Search Radius -->
            <div class="settings-group">
              <label class="group-label">Search Radius (OpenStreetMap)</label>
              <div class="radius-selector">
                ${[25, 50, 100, 200]
                  .map(
                    (r) => `
                  <button class="radius-btn ${this.settings.searchRadiusKm === r ? 'active' : ''}" data-radius="${r}">
                    ${r} km
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>

            <!-- Layer Toggles -->
            <div class="settings-group">
              <label class="group-label">Geographic Layers</label>
              <div class="toggle-row">
                <span>Mountain Peaks</span>
                <input type="checkbox" id="chk-peaks" ${this.settings.showPeaks ? 'checked' : ''}/>
              </div>
              <div class="toggle-row">
                <span>Villages & Cities</span>
                <input type="checkbox" id="chk-settlements" ${this.settings.showSettlements ? 'checked' : ''}/>
              </div>
              <div class="toggle-row">
                <span>Rivers & Waterways</span>
                <input type="checkbox" id="chk-rivers" ${this.settings.showRivers ? 'checked' : ''}/>
              </div>
              <div class="toggle-row">
                <span>Show Elevation Numbers</span>
                <input type="checkbox" id="chk-elevation" ${this.settings.showElevation ? 'checked' : ''}/>
              </div>
            </div>

            <!-- AR Visuals -->
            <div class="settings-group">
              <label class="group-label">AR Visuals</label>
              <div class="slider-row">
                <div class="slider-head">
                  <span>Horizontal FOV</span>
                  <span id="val-fov">${this.settings.horizontalFov}°</span>
                </div>
                <input type="range" id="rng-fov" min="40" max="85" step="1" value="${this.settings.horizontalFov}"/>
              </div>

              <div class="slider-row">
                <div class="slider-head">
                  <span>AR Overlay Opacity</span>
                  <span id="val-opacity">${Math.round(this.settings.arOpacity * 100)}%</span>
                </div>
                <input type="range" id="rng-opacity" min="0.2" max="1.0" step="0.05" value="${this.settings.arOpacity}"/>
              </div>
            </div>

            <!-- Simulation / Demo Mode -->
            <div class="settings-group">
              <label class="group-label">Data Source</label>
              <div class="toggle-row">
                <span>Alpine Demo Mode (Innsbruck)</span>
                <input type="checkbox" id="chk-demo" ${this.settings.demoMode ? 'checked' : ''}/>
              </div>
              <p class="settings-hint">
                Demo mode simulates standing in Innsbruck surrounded by the Nordkette, Zugspitze and Karwendel Alps.
              </p>
            </div>

            <!-- Cache Management -->
            <div class="settings-group">
              <label class="group-label">Offline Cache</label>
              <button id="btn-clear-cache" class="btn btn-secondary btn-full">
                <span>Clear Local Geo Cache</span>
              </button>
            </div>

            <!-- Privacy & Attribution -->
            <div class="settings-footer-info">
              <div class="privacy-note">
                <strong>Privacy:</strong> GPS and sensor data are processed strictly on your device. No user tracking is performed.
              </div>
              <div class="osm-attribution">
                Map & Geographic Data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Event listeners
    this.container.querySelector('#btn-close-settings')?.addEventListener('click', () => this.close());
    this.container.querySelector('.settings-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });

    // Radius buttons
    const radiusBtns = this.container.querySelectorAll('.radius-btn');
    radiusBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        radiusBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings.searchRadiusKm = parseInt(btn.getAttribute('data-radius') || '100', 10);
        this.notify();
      });
    });

    // Checkboxes
    const chkPeaks = this.container.querySelector('#chk-peaks') as HTMLInputElement;
    chkPeaks?.addEventListener('change', () => {
      this.settings.showPeaks = chkPeaks.checked;
      this.notify();
    });

    const chkSettlements = this.container.querySelector('#chk-settlements') as HTMLInputElement;
    chkSettlements?.addEventListener('change', () => {
      this.settings.showSettlements = chkSettlements.checked;
      this.notify();
    });

    const chkRivers = this.container.querySelector('#chk-rivers') as HTMLInputElement;
    chkRivers?.addEventListener('change', () => {
      this.settings.showRivers = chkRivers.checked;
      this.notify();
    });

    const chkElevation = this.container.querySelector('#chk-elevation') as HTMLInputElement;
    chkElevation?.addEventListener('change', () => {
      this.settings.showElevation = chkElevation.checked;
      this.notify();
    });

    const chkDemo = this.container.querySelector('#chk-demo') as HTMLInputElement;
    chkDemo?.addEventListener('change', () => {
      this.settings.demoMode = chkDemo.checked;
      this.notify();
    });

    // Sliders
    const rngFov = this.container.querySelector('#rng-fov') as HTMLInputElement;
    const valFov = this.container.querySelector('#val-fov') as HTMLElement;
    rngFov?.addEventListener('input', () => {
      this.settings.horizontalFov = parseInt(rngFov.value, 10);
      valFov.textContent = `${this.settings.horizontalFov}°`;
      this.notify();
    });

    const rngOpacity = this.container.querySelector('#rng-opacity') as HTMLInputElement;
    const valOpacity = this.container.querySelector('#val-opacity') as HTMLElement;
    rngOpacity?.addEventListener('input', () => {
      this.settings.arOpacity = parseFloat(rngOpacity.value);
      valOpacity.textContent = `${Math.round(this.settings.arOpacity * 100)}%`;
      this.notify();
    });

    // Clear cache
    this.container.querySelector('#btn-clear-cache')?.addEventListener('click', () => {
      this.callbacks.onClearCache();
      alert('Local geographic data cache cleared.');
    });
  }

  private notify(): void {
    this.callbacks.onSettingsChange({ ...this.settings });
  }
}
