export type ViewMode = 'split' | 'ar-only' | 'map-only';

export interface ARControlsCallbacks {
  onTogglePeaks: (enabled: boolean) => void;
  onToggleSettlements: (enabled: boolean) => void;
  onToggleRivers: (enabled: boolean) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenSettings: () => void;
}

export class ARControls {
  private container: HTMLElement;
  private callbacks: ARControlsCallbacks;

  private showPeaks = true;
  private showSettlements = true;
  private showRivers = true;
  private viewMode: ViewMode = 'split';

  constructor(container: HTMLElement, callbacks: ARControlsCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="hud-bottom-controls">
        <!-- Quick Layer Toggle Chips -->
        <div class="hud-filter-chips">
          <button id="chip-peaks" class="chip active" data-layer="peaks">
            <span class="chip-dot dot-peaks"></span>
            <span>Peaks</span>
          </button>

          <button id="chip-places" class="chip active" data-layer="places">
            <span class="chip-dot dot-places"></span>
            <span>Villages</span>
          </button>

          <button id="chip-rivers" class="chip active" data-layer="rivers">
            <span class="chip-dot dot-rivers"></span>
            <span>Rivers</span>
          </button>
        </div>

        <!-- Primary Mode Navigation Bar -->
        <div class="hud-tab-bar">
          <button id="tab-split" class="tab-btn active" data-mode="split">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 13h18"/>
            </svg>
            <span>AR + Map</span>
          </button>

          <button id="tab-ar" class="tab-btn" data-mode="ar-only">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span>Full AR</span>
          </button>

          <button id="tab-map" class="tab-btn" data-mode="map-only">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
              <line x1="8" y1="2" x2="8" y2="18"/>
              <line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
            <span>Full Map</span>
          </button>

          <button id="tab-setup" class="tab-btn" data-mode="setup">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span>Setup</span>
          </button>
        </div>
      </div>
    `;

    // Filter chip listeners
    const chipPeaks = this.container.querySelector('#chip-peaks') as HTMLElement;
    chipPeaks?.addEventListener('click', () => {
      this.showPeaks = !this.showPeaks;
      chipPeaks.classList.toggle('active', this.showPeaks);
      this.callbacks.onTogglePeaks(this.showPeaks);
    });

    const chipPlaces = this.container.querySelector('#chip-places') as HTMLElement;
    chipPlaces?.addEventListener('click', () => {
      this.showSettlements = !this.showSettlements;
      chipPlaces.classList.toggle('active', this.showSettlements);
      this.callbacks.onToggleSettlements(this.showSettlements);
    });

    const chipRivers = this.container.querySelector('#chip-rivers') as HTMLElement;
    chipRivers?.addEventListener('click', () => {
      this.showRivers = !this.showRivers;
      chipRivers.classList.toggle('active', this.showRivers);
      this.callbacks.onToggleRivers(this.showRivers);
    });

    // View mode tab listeners
    const tabs = this.container.querySelectorAll('.tab-btn');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.getAttribute('data-mode');
        if (mode === 'setup') {
          this.callbacks.onOpenSettings();
          return;
        }

        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.viewMode = mode as ViewMode;
        this.callbacks.onViewModeChange(this.viewMode);
      });
    });
  }
}
