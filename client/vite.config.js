import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res.writeHead && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                success: false,
                message: 'Backend API server is unreachable at http://localhost:5000. Please ensure the backend is running.',
                error: {
                  code: 'BACKEND_UNAVAILABLE',
                  message: 'Backend API server is unreachable at http://localhost:5000. Please ensure the backend is running.',
                },
              }))
            }
          })
        },
      },
    },
  },
})
