import { beforeAll, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import zhCN from '@/i18n/locales/zh-CN'

// Create i18n instance for testing
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, 'zh-CN': zhCN },
  globalInjection: true
})

// Mock browser global variables
if (typeof global.URL.createObjectURL === 'undefined') {
    global.URL.createObjectURL = vi.fn(() => 'mock-url')
}

if (typeof global.URL.revokeObjectURL === 'undefined') {
    global.URL.revokeObjectURL = vi.fn()
}

// Mock DOMMatrix for pdfjs-dist
type MockDOMMatrix = {
    new(): DOMMatrix
    fromFloat32Array(): DOMMatrix
    fromFloat64Array(): DOMMatrix
    fromMatrix(): DOMMatrix
}

if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {
        constructor() { }
        static fromFloat32Array() { return new DOMMatrix() }
        static fromFloat64Array() { return new DOMMatrix() }
        static fromMatrix() { return new DOMMatrix() }
    } as unknown as MockDOMMatrix
}

// Do not mock OCR service globally if we want to test it
// vi.mock('@/services/ocr', () => ({
//     performOCR: vi.fn(async () => 'Mocked OCR Text')
// }))

beforeAll(() => {
    // Global initialization logic
})

afterEach(() => {
    // Cleanup logic after each test
    vi.clearAllMocks()
})

// Export i18n instance for use in tests
export { i18n }
