/**
 * Generates a short random identifier that works in both secure and non-secure contexts.
 * Falls back to Math.random() if crypto.randomUUID() is not available.
 * 
 * @returns A random hex string or UUID segment
 */
export function getRandomId(): string {
    // Try to use secure randomUUID if available (modern browsers in secure context)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().split('-')[0] as string
    }

    // Fallback to crypto.getRandomValues if available
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const array = new Uint32Array(1)
        crypto.getRandomValues(array)
        const val = array[0]
        // eslint-disable-next-line sonarjs/pseudo-random
        return (val !== undefined ? val.toString(16) : Math.random().toString(16).substring(2, 10))
    }

    // Last resort fallback (non-secure context, old browsers)
    // eslint-disable-next-line sonarjs/pseudo-random
    return Math.random().toString(16).substring(2, 10)
}

/**
 * Generates a UUID v4.
 * Uses crypto.randomUUID if available, otherwise falls back to a custom implementation.
 * 
 * @returns A UUID v4 string
 */
export function getUUID(): string {
    // 1. Native randomUUID (Secure, Modern Browsers, HTTPS/Localhost)
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }

    // 2. Custom v4 implementation using crypto.getRandomValues (Secure Fallback)
    if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto && typeof crypto.getRandomValues === 'function') {
        const rnds = new Uint8Array(16)
        crypto.getRandomValues(rnds)

        // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
        rnds[6] = (rnds[6]! & 0x0f) | 0x40
        rnds[8] = (rnds[8]! & 0x3f) | 0x80

        return [...rnds].map((b, i) => {
            const hex = b.toString(16).padStart(2, '0')
            return [4, 6, 8, 10].includes(i) ? '-' + hex : hex
        }).join('')
    }

    // 3. Insecure Fallback (Math.random) - For development/legacy environments only

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        // eslint-disable-next-line sonarjs/pseudo-random
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}
