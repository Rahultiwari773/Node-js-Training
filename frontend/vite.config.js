const path = require('path');
const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const apiTarget = process.env.API_TARGET || 'http://localhost:5000';

module.exports = defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/socket.io': {
        target: apiTarget,
        ws: true
      }
    }
  },
  build: {
    outDir: path.resolve(__dirname, '..', 'public'),
    emptyOutDir: true
  }
});