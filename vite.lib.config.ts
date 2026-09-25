import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    rollupOptions: { external: ['@paddleocr/paddleocr-js', '@zxing/browser', 'onnxruntime-web'] },
  },
});
