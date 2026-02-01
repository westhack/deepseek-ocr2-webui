import { defineConfig, configDefaults } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
    plugins: [vue()],
    test: {
        globals: true,
        environment: 'jsdom',
        exclude: [...configDefaults.exclude, 'tests/e2e/**'],
        setupFiles: ['./tests/setup.ts'],
        alias: {
            '@': resolve(__dirname, './src')
        },
        retry: 1,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            thresholds: {
                perFile: true,
                lines: 90,
                functions: 80,
                branches: 70,
                statements: 80
            }
        }
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src')
        }
    }
})
