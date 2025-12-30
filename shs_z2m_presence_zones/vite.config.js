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
        sourcemap: false,
        // Ensure assets use relative paths for HA ingress compatibility
        assetsInlineLimit: 0,
        rollupOptions: {
            output: {
                // Use relative paths for assets
                assetFileNames: 'assets/[name]-[hash][extname]',
                chunkFileNames: 'assets/[name]-[hash].js',
                entryFileNames: 'assets/[name]-[hash].js'
            }
        }
    },
    // Use relative base path for HA ingress compatibility
    base: './'
});
