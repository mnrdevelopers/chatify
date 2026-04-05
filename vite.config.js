import { defineConfig } from 'vite';

export default defineConfig({
  // This sets the base path to relative, ensuring that CSS, JS, and Assets load properly
  // when deployed inside a GitHub Pages subfolder (e.g., github.io/chatify/)
  base: './',

  server: {
    proxy: {
      // Proxy backend API calls to the Node push server during local dev
      '/beams-auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/notify': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
