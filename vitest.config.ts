// PHASE-8: Vitest configuration for webhook handler testing
import { defineConfig } from 'vitest/config';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    // Test file patterns
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
    
    // Test environment
    environment: 'node',
    
    // Global test setup
    globals: true,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        '**/*.config.ts',
        '**/*.config.js',
        '**/__tests__/**',
        '**/scripts/**',
      ],
    },
    
    // Test timeout
    testTimeout: 10000,
    
    // Setup files
    setupFiles: [],
  },
  
  // Resolve paths (same as tsconfig.json)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
