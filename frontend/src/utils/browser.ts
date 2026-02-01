/**
 * Browser detection utilities
 */

/**
 * Detects if the current browser is Webkit (Safari)
 * Excluding Chromium-based browsers which also contain 'AppleWebKit' in userAgent
 */
export const isWebkit = (): boolean => {
    if (typeof navigator === 'undefined') return false

    const ua = navigator.userAgent
    return /AppleWebKit\/.*Version\/.*Safari/.test(ua) && !/Chrome/.test(ua)
}
