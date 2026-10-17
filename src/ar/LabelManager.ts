import type { PlacedLabel } from './CollisionManager';
import { formatDistance } from '../geo/GeoMath';

export interface LabelClickCallback {
  (label: PlacedLabel): void;
}

export class LabelManager {
  private container: HTMLElement;
  private pool: HTMLElement[] = [];
  private activeLabels: HTMLElement[] = [];
  private onLabelClick: LabelClickCallback | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  setClickListener(cb: LabelClickCallback): void {
    this.onLabelClick = cb;
  }

  /**
   * Render or update all placed labels on screen using pooled DOM elements.
   */
  update(placedList: PlacedLabel[]): void {
    // Ensure sufficient pooled elements
    while (this.pool.length < placedList.length) {
      const el = this.createLabelElement();
      this.container.appendChild(el);
      this.pool.push(el);
    }

    // Hide extra elements
    for (let i = placedList.length; i < this.pool.length; i++) {
      this.pool[i].style.display = 'none';
    }

    // Update active elements
    this.activeLabels = [];
    for (let i = 0; i < placedList.length; i++) {
      const placed = placedList[i];
      const el = this.pool[i];
      this.renderLabel(el, placed);
      this.activeLabels.push(el);
    }
  }

  clear(): void {
    for (const el of this.pool) {
      el.style.display = 'none';
    }
    this.activeLabels = [];
  }

  private createLabelElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ar-geo-label';
    el.style.position = 'absolute';
    el.style.willChange = 'transform, opacity';
    el.style.pointerEvents = 'auto';
    return el;
  }

  private renderLabel(el: HTMLElement, placed: PlacedLabel): void {
    const p = placed.projected;
    const obj = p.object;

    el.style.display = 'block';
    el.style.opacity = p.opacity.toFixed(2);

    // Position centered at placedX, placedY with visual scaling
    el.style.transform = `translate3d(${placed.placedX.toFixed(1)}px, ${placed.placedY.toFixed(1)}px, 0) translate(-50%, -50%) scale(${p.scale.toFixed(2)})`;

    // Category style class
    el.setAttribute('data-type', obj.type);
    el.setAttribute('data-id', obj.id);

    // Build modern technical outdoor badge
    let iconSvg = '';
    let metaText = '';

    if (obj.type === 'peak') {
      iconSvg = `
        <svg class="ar-label-icon peak-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M14 6l-4.22 5.63 1.25 1.67L14 9.33 19 16h-4l-3-4--6 8h16z"/>
        </svg>
      `;
      const ele = obj.elevation ? `${Math.round(obj.elevation)} m` : '';
      const dist = formatDistance(p.distance);
      metaText = `${ele ? `<span class="ele">${ele}</span>` : ''}<span class="dist">${dist}</span>`;
    } else if (obj.type === 'river') {
      iconSvg = `
        <svg class="ar-label-icon river-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 12c3-4 6 4 9 0s6 4 9 0" />
          <path d="M2 17c3-4 6 4 9 0s6 4 9 0" opacity="0.6"/>
        </svg>
      `;
      metaText = `<span class="dist">${formatDistance(p.distance)}</span>`;
    } else {
      // Settlements (city, town, village, hamlet)
      iconSvg = `
        <svg class="ar-label-icon place-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
        </svg>
      `;
      metaText = `<span class="type-tag">${obj.type.toUpperCase()}</span><span class="dist">${formatDistance(p.distance)}</span>`;
    }

    // Leader pointer line if offset
    const hasOffset = Math.abs(placed.offsetY) > 6;
    const leaderLineHtml = hasOffset
      ? `<div class="ar-leader-line ${placed.offsetY < 0 ? 'pointing-down' : 'pointing-up'}" style="height: ${Math.abs(placed.offsetY)}px"></div>`
      : `<div class="ar-center-dot"></div>`;

    el.innerHTML = `
      <div class="ar-label-pill type-${obj.type}">
        <div class="ar-label-head">
          ${iconSvg}
          <span class="ar-label-name">${this.escapeHtml(obj.name || 'Unnamed')}</span>
        </div>
        ${metaText ? `<div class="ar-label-meta">${metaText}</div>` : ''}
      </div>
      ${leaderLineHtml}
    `;

    // Attach click listener
    el.onclick = (e) => {
      e.stopPropagation();
      if (this.onLabelClick) {
        this.onLabelClick(placed);
      }
    };
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
