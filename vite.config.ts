import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  base: '/korean-extensive-reading-tool/',
  plugins: [react()],
});
