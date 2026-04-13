import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/lunch-vote/',  // ← GitHub repo 이름에 맞춰 변경하세요
});
