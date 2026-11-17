import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './Analytical Dashboard/src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true'
        ? null
        : { ignored: ['**/.wwebjs_auth/**'] },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('socket.io') || id.includes('engine.io') || id.includes('qrcode')) return 'vendor-realtime';
              if (id.includes('react-dom') || id.includes('react') || id.includes('scheduler')) return 'vendor-react';
            }
            return undefined;
          },
        },
      },
    },
  };
});
