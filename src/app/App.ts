import { LocationManager, INNSBRUCK_DEMO_LOCATION } from '../sensors/LocationManager';
import { OrientationManager } from '../sensors/OrientationManager';
import { OverpassGeoDataProvider } from '../geo/OverpassGeoDataProvider';
import { OpenMeteoElevationProvider } from '../geo/ElevationProvider';
import { ElevationEnrichingProvider } from '../geo/ElevationEnrichingProvider';
import { CachingGeoDataProvider } from '../geo/CachingGeoDataProvider';
import { GeoDataManager } from '../geo/GeoDataManager';
import { DemoGeoDataProvider } from '../demo/DemoGeoDataProvider';
import { ARRenderer } from '../ar/ARRenderer';
import { MapView } from '../map/MapView';
import { PermissionScreen } from '../ui/PermissionScreen';
import { StatusBar } from '../ui/StatusBar';
import { ARControls, type ViewMode } from '../ui/ARControls';
import { SettingsPanel, type AppSettings } from '../ui/SettingsPanel';
import { CalibrationModal } from '../ui/CalibrationModal';
import { DebugPanel } from '../ui/DebugPanel';
import type { PlacedLabel } from '../ar/CollisionManager';

export class App {
  private locationManager: LocationManager;
  private orientationManager: OrientationManager;

  private liveProvider: CachingGeoDataProvider;
  private demoProvider: CachingGeoDataProvider;
  private dataManager: GeoDataManager;

  private arRenderer: ARRenderer;
  private mapView: MapView;

  private permissionScreen: PermissionScreen;
  private statusBar: StatusBar;
  private arControls: ARControls;
  private settingsPanel: SettingsPanel;
  private calibrationModal: CalibrationModal;
  private debugPanel: DebugPanel;

  private settings: AppSettings = {
    searchRadiusKm: 50,
    showPeaks: true,
    showSettlements: true,
    showRivers: true,
    showElevation: true,
    arOpacity: 1.0,
    labelScale: 1.0,
    horizontalFov: 60,
    demoMode: false,
  };

  private currentViewMode: ViewMode = 'split';
  private inspectedLabel: PlacedLabel | null = null;

  constructor() {
    // 1. Detect if on Desktop vs Mobile
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    // On desktop default to demo mode for instant testing without needing GPS travel
    this.settings.demoMode = !isMobile;

    // 2. Initialize Sensors
    this.locationManager = new LocationManager();
    this.orientationManager = new OrientationManager();

    // 3. Initialize Data Architecture
    const overpass = new OverpassGeoDataProvider();
    const elevation = new OpenMeteoElevationProvider();
    const enrichedOverpass = new ElevationEnrichingProvider(overpass, elevation);
    this.liveProvider = new CachingGeoDataProvider(enrichedOverpass);

    const demoSource = new DemoGeoDataProvider();
    this.demoProvider = new CachingGeoDataProvider(demoSource);

    const activeProvider = this.settings.demoMode ? this.demoProvider : this.liveProvider;
    this.dataManager = new GeoDataManager(activeProvider, {
      enabled: {
        peaks: this.settings.showPeaks,
        settlements: this.settings.showSettlements,
        waterways: this.settings.showRivers,
      },
      radiusKm: {
        peaks: this.settings.searchRadiusKm,
        settlements: this.settings.searchRadiusKm,
        waterways: this.settings.searchRadiusKm,
      },
    });

    // 4. Initialize AR Renderer
    const arViewportEl = document.getElementById('ar-viewport') as HTMLElement;
    this.arRenderer = new ARRenderer(arViewportEl, {
      horizontalFov: this.settings.horizontalFov,
      showPeaks: this.settings.showPeaks,
      showSettlements: this.settings.showSettlements,
      showRivers: this.settings.showRivers,
      arOpacity: this.settings.arOpacity,
    });

    // 5. Initialize Bottom Map
    const mapContainerEl = document.getElementById('map-viewport') as HTMLElement;
    this.mapView = new MapView({
      container: mapContainerEl,
      initialCenter: [INNSBRUCK_DEMO_LOCATION.longitude, INNSBRUCK_DEMO_LOCATION.latitude],
      initialZoom: 11,
      fovDegrees: this.settings.horizontalFov,
    });

    // 6. Initialize UI Components
    const permissionOverlayEl = document.getElementById('permission-overlay') as HTMLElement;
    this.permissionScreen = new PermissionScreen(permissionOverlayEl, {
      onRequestPermissions: () => this.handleRequestPermissions(),
      onStartDemo: () => this.startDemoMode(),
    });

    const statusContainerEl = document.getElementById('status-hud') as HTMLElement;
    this.statusBar = new StatusBar(statusContainerEl, {
      onOpenSettings: () => this.settingsPanel.open(),
      onOpenCalibration: () => this.openCalibration(),
      onToggleDebug: () => this.debugPanel.toggle(),
    });

    const controlsContainerEl = document.getElementById('bottom-controls') as HTMLElement;
    this.arControls = new ARControls(controlsContainerEl, {
      onTogglePeaks: (on) => this.toggleLayer('peaks', on),
      onToggleSettlements: (on) => this.toggleLayer('settlements', on),
      onToggleRivers: (on) => this.toggleLayer('rivers', on),
      onViewModeChange: (mode) => this.setViewMode(mode),
      onOpenSettings: () => this.settingsPanel.open(),
    });

    const settingsContainerEl = document.getElementById('settings-overlay') as HTMLElement;
    this.settingsPanel = new SettingsPanel(settingsContainerEl, this.settings, {
      onSettingsChange: (s) => this.applySettings(s),
      onClearCache: () => this.dataManager.clearCache(),
      onClose: () => {},
    });

    const calibContainerEl = document.getElementById('modal-overlay') as HTMLElement;
    this.calibrationModal = new CalibrationModal(calibContainerEl, {
      onClose: () => {},
    });

    const debugContainerEl = document.getElementById('debug-overlay') as HTMLElement;
    this.debugPanel = new DebugPanel(debugContainerEl, {
      onUpdateSimulatedLocation: (loc) => this.locationManager.updateSimulated(loc),
      onUpdateSimulatedOrientation: (ori) => this.orientationManager.updateSimulated(ori),
      onClose: () => {},
    });

    // Wire up events
    this.bindEvents();

    // Check if permissions need to be shown
    if (!isMobile) {
      // Desktop: start demo immediately
      this.startDemoMode();
    } else {
      this.permissionScreen.show();
    }
  }

  private bindEvents(): void {
    // 1. Location Updates
    this.locationManager.on('location', (loc) => {
      this.statusBar.updateLocation(loc, this.locationManager.currentStatus);
      this.arRenderer.updateLocation(loc);
      this.mapView.updateLocation(loc);
      this.dataManager.updatePosition(loc.latitude, loc.longitude);
      this.calibrationModal.updateLocation(loc);
    });

    this.locationManager.on('status', (st) => {
      this.statusBar.updateLocation(this.locationManager.state, st);
    });

    // 2. Orientation Updates
    this.orientationManager.on('orientation', (ori) => {
      this.statusBar.updateOrientation(ori);
      this.arRenderer.updateOrientation(ori);
      this.mapView.updateOrientation(ori);
      this.calibrationModal.updateOrientation(ori);
      this.updateDebugMetrics();
    });

    // 3. Geographic Data Updates
    this.dataManager.on('data', (d) => {
      this.arRenderer.updateGeoData(d.peaks, d.settlements, d.waterways);
      this.mapView.updateGeoData(d.peaks, d.settlements, d.waterways);
      this.updateDebugMetrics();
    });

    this.dataManager.on('status', (st) => {
      this.statusBar.updateDataStatus(st);
    });

    // 4. Label Inspection
    this.arRenderer.labels.setClickListener((label) => {
      this.inspectedLabel = label;
      this.debugPanel.inspectObject(label);
    });
  }

  private async handleRequestPermissions(): Promise<void> {
    this.permissionScreen.hide();

    // 1. Start camera
    await this.arRenderer.startCamera();

    // 2. Request motion/orientation (required on iOS button tap)
    await this.orientationManager.requestPermission();

    // 3. Start GPS
    this.locationManager.start();

    // 4. Start AR rendering loop
    this.arRenderer.start();
  }

  private startDemoMode(): void {
    this.permissionScreen.hide();
    this.settings.demoMode = true;

    // Configure simulated Alpine location in Innsbruck
    this.locationManager.setSimulated(true, INNSBRUCK_DEMO_LOCATION);
    this.orientationManager.setSimulated(true, 335, 5, 0); // Looking towards Zugspitze & Nordkette

    // Set demo provider
    this.dataManager = new GeoDataManager(this.demoProvider, {
      enabled: {
        peaks: this.settings.showPeaks,
        settlements: this.settings.showSettlements,
        waterways: this.settings.showRivers,
      },
      radiusKm: {
        peaks: this.settings.searchRadiusKm,
        settlements: this.settings.searchRadiusKm,
        waterways: this.settings.searchRadiusKm,
      },
    });

    this.bindEvents();
    this.arRenderer.start();

    // Trigger initial updates
    this.locationManager.start();
    this.orientationManager.start();
  }

  private openCalibration(): void {
    this.calibrationModal.show(this.orientationManager.state, this.locationManager.state);
  }

  private toggleLayer(layer: 'peaks' | 'settlements' | 'rivers', enabled: boolean): void {
    if (layer === 'peaks') this.settings.showPeaks = enabled;
    else if (layer === 'settlements') this.settings.showSettlements = enabled;
    else if (layer === 'rivers') this.settings.showRivers = enabled;

    this.applyLayerConfig();
  }

  private setViewMode(mode: ViewMode): void {
    this.currentViewMode = mode;
    const appEl = document.getElementById('app-root') as HTMLElement;
    appEl.setAttribute('data-view', mode);

    setTimeout(() => {
      this.mapView.resize();
    }, 200);
  }

  private applySettings(newSettings: AppSettings): void {
    const prevDemo = this.settings.demoMode;
    this.settings = newSettings;

    if (newSettings.demoMode !== prevDemo) {
      if (newSettings.demoMode) {
        this.startDemoMode();
      } else {
        this.locationManager.setSimulated(false);
        this.orientationManager.setSimulated(false);
        this.dataManager = new GeoDataManager(this.liveProvider, {
          enabled: {
            peaks: this.settings.showPeaks,
            settlements: this.settings.showSettlements,
            waterways: this.settings.showRivers,
          },
          radiusKm: {
            peaks: this.settings.searchRadiusKm,
            settlements: this.settings.searchRadiusKm,
            waterways: this.settings.searchRadiusKm,
          },
        });
        this.bindEvents();
        this.locationManager.start();
        this.orientationManager.start();
      }
    }

    this.arRenderer.setOptions({
      horizontalFov: newSettings.horizontalFov,
      showPeaks: newSettings.showPeaks,
      showSettlements: newSettings.showSettlements,
      showRivers: newSettings.showRivers,
      arOpacity: newSettings.arOpacity,
    });

    this.mapView.setFov(newSettings.horizontalFov);
    this.applyLayerConfig();
  }

  private applyLayerConfig(): void {
    this.dataManager.configure({
      enabled: {
        peaks: this.settings.showPeaks,
        settlements: this.settings.showSettlements,
        waterways: this.settings.showRivers,
      },
      radiusKm: {
        peaks: this.settings.searchRadiusKm,
        settlements: this.settings.searchRadiusKm,
        waterways: this.settings.searchRadiusKm,
      },
    });

    this.arRenderer.setOptions({
      showPeaks: this.settings.showPeaks,
      showSettlements: this.settings.showSettlements,
      showRivers: this.settings.showRivers,
    });
  }

  private updateDebugMetrics(): void {
    const total =
      this.dataManager.data.peaks.length +
      this.dataManager.data.settlements.length +
      this.dataManager.data.waterways.length;

    this.debugPanel.updateMetrics(
      this.locationManager.state,
      this.orientationManager.state,
      this.settings.horizontalFov,
      total,
      total > 0 ? Math.min(total, 25) : 0,
      this.arRenderer.currentFps
    );
  }

  get controls(): ARControls {
    return this.arControls;
  }

  get viewMode(): ViewMode {
    return this.currentViewMode;
  }

  get selectedLabel(): PlacedLabel | null {
    return this.inspectedLabel;
  }
}
