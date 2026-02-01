import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getRandomId } from './crypto'

const originalCrypto = globalThis.crypto

function mockCrypto(config: any) {
    Object.defineProperty(globalThis, 'crypto', {
        value: config,
        configurable: true,
        writable: true
    })
}

describe('getRandomId', () => {

    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        mockCrypto(originalCrypto)
        vi.restoreAllMocks()
    })

    it('should return a non-empty string', () => {
        const id = getRandomId()
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
    })

    it('should generate different IDs on subsequent calls', () => {
        const id1 = getRandomId()
        const id2 = getRandomId()
        expect(id1).not.toBe(id2)
    })

    it('should return hexadecimal characters or UUID segment', () => {
        const id = getRandomId()
        // Checking if it's alphanumeric hex-like
        expect(id).toMatch(/^[a-f0-9]+$/i)
    })

    it('should use crypto.randomUUID if available', () => {
        const mockUUID = '12345678-1234-1234-1234-123456789012'
        mockCrypto({
            ...originalCrypto,
            randomUUID: vi.fn().mockReturnValue(mockUUID),
        })

        const id = getRandomId()
        expect(id).toBe('12345678')
        expect(globalThis.crypto.randomUUID).toHaveBeenCalled()
    })

    it('should use crypto.getRandomValues if randomUUID is not available', () => {
        mockCrypto({
            ...originalCrypto,
            randomUUID: undefined,
            getRandomValues: vi.fn().mockImplementation((arr: Uint32Array) => {
                arr[0] = 0xabcdef
                return arr
            }),
        })

        const id = getRandomId()
        expect(id).toBe('abcdef')
        expect(globalThis.crypto.getRandomValues).toHaveBeenCalled()
    })

    it('should fallback to Math.random if crypto is not available', () => {
        mockCrypto(undefined)

        const id = getRandomId()
        expect(id).toMatch(/^[a-f0-9]+$/)
        expect(id.length).toBeGreaterThan(0)
    })
})

import { getUUID } from './crypto'

describe('getUUID', () => {
    // const originalCrypto = globalThis.crypto // already defined at top? No, originalCrypto const scope is blocked.
    // But we lifted it? 
    // Wait, originalCrypto was const inside describe.
    // I moved `const originalCrypto = globalThis.crypto` to top level.
    // So I can remove it here too.


    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        mockCrypto(originalCrypto)
        vi.restoreAllMocks()
    })

    it('should return a valid UUID v4', () => {
        const id = getUUID()
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('should use crypto.randomUUID if available', () => {
        const mockUUID = '12345678-1234-4234-8234-123456789012'
        mockCrypto({
            ...originalCrypto,
            randomUUID: vi.fn().mockReturnValue(mockUUID),
        })

        const id = getUUID()
        expect(id).toBe(mockUUID)
        expect(globalThis.crypto.randomUUID).toHaveBeenCalled()
    })

    it('should use crypto.getRandomValues if randomUUID is not available', () => {
        mockCrypto({
            ...originalCrypto,
            // randomUUID is undefined or not a function
            getRandomValues: vi.fn().mockImplementation((arr: Uint8Array) => {
                arr.fill(0)
                // We need to simulate reasonable data? No, the function fills it.
                // But the function *consumes* it.
                // Let's just return. The implementation calls getRandomValues(rnds).
                // We can fill it with deterministic values to check output if we want.
                for (let i = 0; i < arr.length; i++) arr[i] = i
                return arr
            }),
        })

        const id = getUUID()
        // Input: 00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f
        // Version (6th byte): 06 & 0x0f | 0x40 = 06 | 40 = 46
        // Variant (8th byte): 08 & 0x3f | 0x80 = 08 | 80 = 88
        // Expected: 00010203-0405-4607-8809-0a0b0c0d0e0f
        expect(id).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
        expect(globalThis.crypto.getRandomValues).toHaveBeenCalled()
    })

    it('should fallback to Math.random if crypto is not available', () => {
        mockCrypto(undefined)

        const id = getUUID()
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })
})
