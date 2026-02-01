import { describe, it, expect, beforeEach, vi } from 'vitest'
// implementation not yet exists
import { getClientId } from './clientId'

describe('ClientId Service', () => {
    beforeEach(() => {
        sessionStorage.clear()
        vi.restoreAllMocks()
    })

    it('should generate a new UUID if not present in session storage', () => {
        const id = getClientId()
        expect(id).toBeDefined()
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
        expect(sessionStorage.getItem('ocr-client-id')).toBe(id)
    })

    it('should return existing ID from session storage', () => {
        const existingId = 'test-uuid-123'
        sessionStorage.setItem('ocr-client-id', existingId)

        const id = getClientId()
        expect(id).toBe(existingId)
    })

    it('should persist ID across multiple calls', () => {
        const id1 = getClientId()
        const id2 = getClientId()
        expect(id1).toBe(id2)
    })
})
