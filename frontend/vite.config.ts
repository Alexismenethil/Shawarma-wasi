import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // El .env vive en la raíz del monorepo.
  envDir: '..',
  build: {
    rollupOptions: {
      output: {
        // Las librerías van en archivos aparte: cambian poco, así una nueva
        // versión del sistema no obliga a las tablets a bajarlas otra vez.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react'
          if (/[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/.test(id)) return 'motion'
          if (/[\\/](socket\.io-client|socket\.io-parser|engine\.io-client|engine\.io-parser|@socket\.io)[\\/]/.test(id)) return 'socket'
        },
      },
    },
  },
})
