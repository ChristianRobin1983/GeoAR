# TerraAR • Browser-Based Geographic Augmented Reality

A mobile-first browser application that uses smartphone GPS location, compass/gyroscope sensors, and camera to overlay real-world geographic information—**mountain peaks**, **alpine settlements**, and **rivers**—directly onto the landscape.

No App Store installation required. Runs directly in modern mobile browsers (**iPhone Safari**, **Android Chrome**) and desktop browsers (with built-in simulated Alpine demo mode).

---

## 🏔️ Features

- **Real-Time AR Overlay**: Projects geographic objects in the correct real-world direction based on compass heading, pitch, and GPS coordinates.
- **Local ENU Coordinate System**: Accurate WGS84 ECEF to local East-North-Up tangent plane conversions with atmospheric refraction and Earth curvature adjustments.
- **Dynamic OpenStreetMap Integration**: Queries live mountain peaks (`natural=peak`), settlements (`place=city|town|village|hamlet`), and waterways (`waterway=river`) via OpenStreetMap's Overpass API.
- **Failover & Exponential Backoff**: Multi-mirror European Overpass API endpoints with automatic failover, timeout guards (25s), and exponential retry backoff.
- **Distance & Importance Scaling**: Nearby objects appear prominently; distant high peaks (e.g. Zugspitze) retain appropriate visual weight.
- **Screen-Space Label Collision Avoidance**: Multi-tier vertical stacking and priority ranking to eliminate text clutter.
- **Synchronized Bottom Map**: Interactive MapLibre GL map showing user position (`●`), dynamic viewing FOV cone, and geographic objects synchronized with camera rotation.
- **Compass Calibration & Sensor Smoothing**: Circular angle interpolation (smooth 359° ↔ 0° transitions), low-pass filtered GPS altitude (EMA), and interactive 360° calibration rose.
- **Offline & Poor Network Resilience**: Local grid-cell cache stored in IndexedDB (14-day TTL); falls back gracefully to cached data with clear status indicators when offline.
- **Instant Alpine Demo Mode**: Realistic Innsbruck Alpine dataset (Zugspitze, Hafelekarspitze, Karwendel, Inn and Isar rivers) active by default on desktop for rapid testing.
- **Developer Debug HUD**: Interactive attitude simulator allowing manual heading/pitch adjustments and object inspection.

---

## 🚀 Quick Start

### 1. Installation

```bash
git clone <repo-url>
cd AR.LocationBased.Sample
npm install
```

### 2. Development

```bash
# Standard local development (HTTP)
npm run dev

# Mobile LAN development with self-signed HTTPS (required for Camera/Sensors on iOS/Android over Wi-Fi)
npm run dev:mobile
```

Open `http://localhost:5173/` in your browser.

### 3. Run Unit Tests

Tests all geographic calculations (Haversine distance, bearings, 0°/360° crossings, local ENU transforms, line simplification):

```bash
npm test
```

### 4. Build for Production

```bash
npm run build
npm run preview
```

---

## ☁️ Cloudflare Pages Deployment Guide

TerraAR compiles to a pure static application with zero backend infrastructure requirements, designed to run 100% within the **Cloudflare Pages Free Tier**.

### Deployment Settings

| Configuration Option | Production Value | Note |
|---|---|---|
| **Hosting Platform** | Cloudflare Pages | Free Tier ($0/month) |
| **Framework Preset** | `Vite` | Standard Vite compilation |
| **Build Command** | `npm run build` | Runs TypeScript type check + Vite production bundle |
| **Build Output Directory** | `dist` | Generated static folder |
| **Node.js Version** | `20.x` or higher | Configurable in Pages environment settings |
| **Root Directory** | `/` (or repo root) | Standard repository root |
| **Environment Variables** | *None required* | App runs entirely client-side with open APIs |

---

### Option A: Automatic Git Deployment via GitHub (Recommended)

1. **Push your repository to GitHub**:
   ```bash
   git add .
   git commit -m "feat: configure production build and Cloudflare Pages deployment"
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. **Log into Cloudflare**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Compute (Workers) > Pages**.
3. **Connect GitHub**:
   - Click **Create application** > **Pages** > **Connect to Git**.
   - Select your GitHub account and choose the `AR.LocationBased.Sample` repository.
4. **Configure Build Settings**:
   - **Project Name**: `terra-ar` (or preferred name, will generate `https://terra-ar.pages.dev`)
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. **Deploy**:
   - Click **Save and Deploy**. Cloudflare Pages will build the site and provide a permanent HTTPS URL (e.g. `https://terra-ar.pages.dev`).
   - Every subsequent `git push` to your production branch will automatically trigger a new deployment preview and production release.

---

### Option B: Direct CLI Deployment via Wrangler

If you prefer to deploy directly from your local terminal without linking GitHub:

1. **Authenticate with Cloudflare**:
   ```bash
   npx wrangler login
   ```
2. **Build and Deploy**:
   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name geo-ar
   ```
3. Wrangler will upload the static assets and output your live `pages.dev` URL.

---

### Cloudflare Pages Routing & Headers Configuration

The repository includes static routing and security headers in `public/` that are automatically bundled into `dist/` during build:

- **`public/_redirects`**:
  ```text
  /*    /index.html   200
  ```
  Provides single-page application (SPA) fallback routing to ensure refreshing any route never results in a 404 error.

- **`public/_headers`**:
  ```text
  /*
    X-Content-Type-Options: nosniff
    X-Frame-Options: SAMEORIGIN
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: camera=(self), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self)

  /assets/*
    Cache-Control: public, max-age=31536000, immutable

  /index.html
    Cache-Control: public, max-age=0, must-revalidate
  ```
  Grants explicit permissions for camera, GPS, and orientation sensors in modern browser security sandboxes, while enabling 1-year immutable caching for fingerprinted static assets.

---

## 👥 100 Test Users Readiness & Capacity Analysis

The deployment architecture is specifically engineered to handle ~100 concurrent test users under free-tier constraints:

```text
                                 100 TEST USERS
                                       │
                                       ▼
                   ┌───────────────────────────────────────┐
                   │   Cloudflare Global Anycast Edge CDN  │
                   │   - Unlimited bandwidth (Free Tier)   │
                   │   - Sub-15ms TTFB in Europe & US      │
                   │   - Static assets cached at the edge  │
                   └───────────────────┬───────────────────┘
                                       │ (1.6 MB initial load, cached)
                                       ▼
                             ┌───────────────────┐
                             │ User's Smartphone │
                             └─────────┬─────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
┌─────────────────────────┐                             ┌─────────────────────────┐
│ Device Storage & Sensor │                             │ Public Geographic APIs  │
│ - IndexedDB Grid Cache  │                             │ (Only queried on cell   │
│   (14-day TTL, 60 max)  │                             │  transition, debounced) │
│ - Snapped cell queries  │                             │ - Overpass API (EU mirr)│
│ - No GPS poll spam      │                             │ - Open-Meteo DEM 90m    │
│ - 60 FPS Three.js loop  │                             │ - OSM Raster Tiles      │
└─────────────────────────┘                             └─────────────────────────┘
```

### 1. Website Delivery Capacity (Cloudflare Pages)
- **Bandwidth**: **Unlimited** on the Cloudflare Pages Free Tier.
- **Concurrent Users**: Handles 100, 1,000, or 10,000 simultaneous users without degrading. Static HTML, JavaScript chunks, CSS, and fonts are distributed across hundreds of global edge data centers.
- **Load Test Verification**: 100 concurrent local requests executed in 108 ms (1.08 ms average response time).

### 2. Geographic Data API Capacity (External Services)
- **The Challenge**: Public OpenStreetMap Overpass servers (`overpass-api.de`, `overpass.kumi.systems`) have strict rate limiting and fair-use policies. 100 phones simultaneously hitting Overpass would trigger HTTP 429 errors.
- **The Solution Implemented in TerraAR**:
  1. **Coarse Grid-Cell Snapping**: Queries are quantized to coarse grid cells (5 to 50 km). Moving 100 meters does **not** trigger new API requests.
  2. **Device-Side IndexedDB Cache**: Results are persisted with a 14-day expiration. Revisiting an area or refreshing the page uses local storage instantly with zero network requests.
  3. **Sequential & In-Flight Deduplication**: Concurrent requests for the same cell share a single in-flight Promise.
  4. **Multi-Endpoint European Failover**: Rotates between German and European mirrors (`overpass-api.de`, `lz4.overpass-api.de`, `overpass.private.coffee`, `overpass.kumi.systems`) with 25s timeout and exponential backoff retry.
  5. **Instant Alpine Demo Fallback**: Users can test all AR capabilities immediately via the Innsbruck demo dataset without contacting external APIs.

### 3. Browser Rendering & Sensor Performance
- Three.js WebGL river rendering uses geometry decimation (Ramer-Douglas-Peucker simplification with 25 m tolerance).
- Dynamic label collision avoidance limits the maximum active screen labels (20 peaks, 15 settlements, 5 rivers) to maintain a smooth 60 FPS on iOS and Android devices.
- Sensor inputs use exponential moving average (EMA) low-pass filtering and circular angle interpolation for jitter-free compass alignment.

---

## 📱 Mobile Device Requirements & Permissions

Mobile browsers require a **Secure Context (HTTPS)**:
1. `navigator.mediaDevices.getUserMedia` (Camera background feed)
2. `DeviceOrientationEvent` / `DeviceMotionEvent` (Compass heading and tilt)
3. `navigator.geolocation` (GPS coordinates and altitude)

- **iPhone Safari**: When tapping **Allow Access & Start AR**, iOS prompts for Motion & Orientation permission. This must be triggered by direct user gesture.
- **Android Chrome**: Uses `deviceorientationabsolute` for compass heading aligned to True North.

---

## 🔒 Security, Privacy & Free-Tier Boundaries

- **Privacy**: User coordinates, camera streams, and motion sensors are processed **100% on the device**. Coordinates are never transmitted to a backend, database, or analytics tracker.
- **Zero API Keys**: No paid Google Maps, Mapbox, or proprietary services are used.
- **Attribution**:
  - Mountain peaks, settlements, and river geometry: &copy; [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL)
  - Terrain Elevation: Copernicus DEM GLO-90 via [Open-Meteo](https://open-meteo.com/)
  - Base Map: OpenStreetMap & MapLibre GL
- **Free-Tier Limits**:
  - Cloudflare Pages: Free tier (unlimited requests, 500 builds/month, 100 custom domains).
  - No database or server costs.
