import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // MediaPipe wasm 로더는 사전 번들링하면 경로가 깨질 수 있어서 제외
    exclude: ['@mediapipe/tasks-vision'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
