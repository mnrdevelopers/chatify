import { defineConfig } from 'vite';

export default defineConfig({
  // This sets the base path to relative, ensuring that CSS, JS, and Assets load properly
  // when deployed inside a GitHub Pages subfolder (e.g., github.io/chatify/)
  base: './',

  build: {
    outDir: 'docs',
    rollupOptions: {
      input: {
        main: './index.html',
        login: './login.html'
      }
    }
  },
});

