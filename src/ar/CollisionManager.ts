import type { ProjectedObject } from './ARProjection';

export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedLabel {
  projected: ProjectedObject;
  placedX: number;
  placedY: number;
  offsetY: number;
  rect: LabelRect;
  level: number;
}

export interface CollisionOptions {
  maxPeaks: number;
  maxSettlements: number;
  maxRivers: number;
  labelPaddingX?: number;
  labelPaddingY?: number;
  maxVerticalOffset?: number;
}

const DEFAULT_OPTIONS: CollisionOptions = {
  maxPeaks: 20,
  maxSettlements: 15,
  maxRivers: 5,
  labelPaddingX: 12,
  labelPaddingY: 8,
  maxVerticalOffset: 60,
};

export class CollisionManager {
  private options: CollisionOptions;

  constructor(options: Partial<CollisionOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  setOptions(options: Partial<CollisionOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Filter, sort, and position labels avoiding screen-space overlapping.
   */
  resolveCollisions(projectedList: ProjectedObject[]): PlacedLabel[] {
    // 1. Filter out invisible objects
    const visible = projectedList.filter((p) => p.isVisible);

    // 2. Sort by composite importance (priority ranking)
    visible.sort((a, b) => {
      // Prioritize higher score
      return b.score - a.score;
    });

    // 3. Category count limiting
    let peakCount = 0;
    let settlementCount = 0;
    let riverCount = 0;

    const filtered: ProjectedObject[] = [];
    for (const item of visible) {
      if (item.object.type === 'peak') {
        if (peakCount >= this.options.maxPeaks) continue;
        peakCount++;
      } else if (item.object.type === 'river') {
        if (riverCount >= this.options.maxRivers) continue;
        riverCount++;
      } else {
        if (settlementCount >= this.options.maxSettlements) continue;
        settlementCount++;
      }
      filtered.push(item);
    }

    // 4. Screen-space collision detection & vertical offsetting
    const placed: PlacedLabel[] = [];
    const occupiedRects: LabelRect[] = [];

    const padX = this.options.labelPaddingX ?? 12;
    const padY = this.options.labelPaddingY ?? 8;
    const maxOffset = this.options.maxVerticalOffset ?? 60;

    for (const item of filtered) {
      // Approximate label dimensions based on text length and scale
      const textLen = Math.max(item.object.name.length, 6);
      const width = (textLen * 8.5 + 44) * item.scale;
      const height = 40 * item.scale;

      let bestY = item.screenY;
      let offsetY = 0;
      let level = 0;
      let collision = true;

      // Try 3 vertical tiers: exact position, shifted up by -24px, shifted up by -48px
      const verticalOffsets = [0, -28, -56, 28];

      for (let i = 0; i < verticalOffsets.length; i++) {
        const testOffset = verticalOffsets[i];
        if (Math.abs(testOffset) > maxOffset) continue;

        const testRect: LabelRect = {
          x: item.screenX - width / 2 - padX,
          y: item.screenY + testOffset - height / 2 - padY,
          width: width + padX * 2,
          height: height + padY * 2,
        };

        const hasOverlap = occupiedRects.some((occ) => this.intersects(testRect, occ));
        if (!hasOverlap) {
          bestY = item.screenY + testOffset;
          offsetY = testOffset;
          level = i;
          collision = false;
          occupiedRects.push(testRect);
          break;
        }
      }

      // If no slot without overlap, we reject lower-priority labels to prevent visual clutter
      if (!collision) {
        placed.push({
          projected: item,
          placedX: item.screenX,
          placedY: bestY,
          offsetY,
          rect: {
            x: item.screenX - width / 2,
            y: bestY - height / 2,
            width,
            height,
          },
          level,
        });
      }
    }

    return placed;
  }

  private intersects(a: LabelRect, b: LabelRect): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }
}
