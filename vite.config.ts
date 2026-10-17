import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `--mode https` (used by `npm run dev:mobile`) enables a self-signed HTTPS
// certificate so that camera / sensors / geolocation work when the dev
// server is opened from a phone on the local network (secure context required).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    ...(mode === 'https' ? [basicSsl()] : []),
  ],
  server: {
    host: mode === 'https' ? true : undefined,
  },
  build: {
    target: 'es2020',
    sourcemap: mode === 'development',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
