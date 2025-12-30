import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 3000,
        host: true,  // Listen on all addresses
        open: true   // Auto-open browser
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: true
    }
});
