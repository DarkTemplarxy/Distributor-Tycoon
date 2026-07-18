import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build runs from ANY mount point — the site
  // root, a GitHub-Pages subpath (/Distributor-Tycoon/) or file:// directly.
  base: './',
  server: {
    host: true,
    port: 5173,
  },
});
