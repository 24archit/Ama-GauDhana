import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    fs: {
      allow: ['..']
    }
  },
  build: {
    chunkSizeWarningLimit: 1200, 
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // 1. Isolate the heavy ML library
            if (id.includes('@tensorflow')) {
              return 'vendor-tensorflow';
            }
            
            // 2. Isolate the heavy UI component library
            if (id.includes('@mui') || id.includes('@emotion') || id.includes('stylis')) {
              return 'vendor-mui';
            }

            // 3. Isolate the native Android/iOS bridge
            if (id.includes('@capacitor') || id.includes('@capacitor-community')) {
              return 'vendor-capacitor';
            }
          }
        }
      }
    }
  }
})
