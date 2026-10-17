export interface PermissionCallbacks {
  onRequestPermissions: () => void;
  onStartDemo: () => void;
}

export class PermissionScreen {
  private container: HTMLElement;
  private callbacks: PermissionCallbacks;

  constructor(container: HTMLElement, callbacks: PermissionCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  show(): void {
    this.container.innerHTML = `
      <div class="perm-backdrop">
        <div class="perm-card">
          <div class="perm-header">
            <div class="perm-icon-wrapper">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M14 6l-4.22 5.63 1.25 1.67L14 9.33 19 16h-4l-3-4--6 8h16z"/>
              </svg>
            </div>
            <h1 class="perm-title">TerraAR</h1>
            <p class="perm-subtitle">Geographic Landscape Augmented Reality</p>
          </div>

          <div class="perm-body">
            <p class="perm-intro">
              Hold your smartphone toward the landscape to identify mountain peaks, alpine settlements, and rivers in real time.
            </p>

            <div class="perm-list">
              <div class="perm-item">
                <div class="item-icon">📍</div>
                <div class="item-content">
                  <div class="item-title">Location (GPS)</div>
                  <div class="item-desc">Determines your viewpoint and calculates distance to mountains.</div>
                </div>
              </div>

              <div class="perm-item">
                <div class="item-icon">🧭</div>
                <div class="item-content">
                  <div class="item-title">Motion & Compass</div>
                  <div class="item-desc">Aligns labels with your real viewing direction.</div>
                </div>
              </div>

              <div class="perm-item">
                <div class="item-icon">📷</div>
                <div class="item-content">
                  <div class="item-title">Camera</div>
                  <div class="item-desc">Displays the live background landscape overlay.</div>
                </div>
              </div>
            </div>

            <div class="perm-privacy-badge">
              <span>🔒 100% Client-Side • No tracking or position storage</span>
            </div>
          </div>

          <div class="perm-actions">
            <button id="btn-grant-permissions" class="btn btn-primary btn-large">
              <span>Allow Access & Start AR</span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>

            <button id="btn-demo-mode" class="btn btn-secondary">
              <span>Explore Demo (Innsbruck Alps)</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-grant-permissions')?.addEventListener('click', () => {
      this.callbacks.onRequestPermissions();
    });

    this.container.querySelector('#btn-demo-mode')?.addEventListener('click', () => {
      this.callbacks.onStartDemo();
    });
  }

  hide(): void {
    this.container.innerHTML = '';
  }
}
