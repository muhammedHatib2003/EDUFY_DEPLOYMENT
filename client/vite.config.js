const path = require('path')
const { defineConfig } = require('vite')
const react = require('@vitejs/plugin-react')

const isElectron = process.env.VITE_ELECTRON === 'true'

module.exports = defineConfig({
  // Use relative assets when packaging for Electron so file:// loads work
  base: isElectron ? './' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
