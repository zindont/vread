import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: process.env.GITHUB_PAGES === 'true' ? '/vread/' : '/',
  server: { host: '127.0.0.1' },
  build: { outDir: 'dist' },
  optimizeDeps: {
    exclude: ['@paddleocr/paddleocr-js'],
    include: [
      '@paddleocr/paddleocr-js > clipper-lib',
      '@paddleocr/paddleocr-js > @techstark/opencv-js',
    ],
  },
});
