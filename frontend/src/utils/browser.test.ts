import { describe, it, expect, vi, afterEach } from 'vitest'
import { isWebkit } from './browser'

describe('Browser Utils', () => {
    afterEach(() => {
        // Restore navigator
        vi.unstubAllGlobals()
    })

    it('should return false if navigator is undefined', () => {
        vi.stubGlobal('navigator', undefined)
        expect(isWebkit()).toBe(false)
    })

    it('should detect Webkit (Safari)', () => {
        const mockNavigator = {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15'
        }
        vi.stubGlobal('navigator', mockNavigator)
        expect(isWebkit()).toBe(true)
    })

    it('should not detect Chrome as Webkit', () => {
        const mockNavigator = {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
        }
        vi.stubGlobal('navigator', mockNavigator)
        expect(isWebkit()).toBe(false)
    })

    it('should not detect Firefox as Webkit', () => {
        const mockNavigator = {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0'
        }
        vi.stubGlobal('navigator', mockNavigator)
        expect(isWebkit()).toBe(false)
    })
})
