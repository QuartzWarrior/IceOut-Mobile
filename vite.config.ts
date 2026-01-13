import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy()
  ],
  server: {
    proxy: {
      // Proxy API requests
      '/api': {
        target: 'https://iceout.org',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: 'localhost',
        cookiePathRewrite: '/',
        headers: {
          'Origin': 'https://iceout.org',
          'Referer': 'https://iceout.org/en/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      },
      // Proxy Auth requests
      '/auth': {
        target: 'https://iceout.org',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: 'localhost',
        cookiePathRewrite: '/',
        headers: {
          'Origin': 'https://iceout.org',
          'Referer': 'https://iceout.org/en/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      },
      // Proxy En requests (if needed for other assets)
      '/en': {
        target: 'https://iceout.org',
        changeOrigin: true,
        secure: false,
        headers: {
          'Origin': 'https://iceout.org',
          'Referer': 'https://iceout.org/en/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  }
})
