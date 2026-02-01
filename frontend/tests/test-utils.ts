import { configPlugins } from '@vue/test-utils'
import { i18n } from './setup'

// Global test utilities for i18n
export function setupTestPlugins() {
  configPlugins.global.plugins = configPlugins.global.plugins || []
  configPlugins.global.plugins.push(i18n)
}

// Helper to get i18n mount options
export const I18N_MOUNT_OPTIONS = {
  global: {
    plugins: [i18n]
  }
} as const
