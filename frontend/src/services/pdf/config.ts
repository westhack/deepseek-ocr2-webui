import * as pdfjsLib from 'pdfjs-dist'

/**
 * Shared PDF.js configuration
 */

// Use local CMaps from public directory for better reliability and CJK support
// This path is relative to the web root
// export const CMAP_URL = 'cmaps/'
// export const CMAP_PACKED = true
// export const STANDARD_FONT_DATA_URL = 'standard_fonts/'

export const CMAP_URL = 'cmaps/'
export const CMAP_PACKED = true
export const STANDARD_FONT_DATA_URL = 'standard_fonts/'

// Get version dynamically from the library
export const PDF_JS_VERSION = pdfjsLib.version

/**
 * Common document loading parameters for getDocument
 */
export const DOCUMENT_INIT_PARAMS = {
    cMapUrl: CMAP_URL,
    cMapPacked: CMAP_PACKED,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
    fontExtraProperties: true,
}
