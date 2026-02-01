/**
 * Enhanced PDF Renderer with Font Support
 * Provides advanced font handling and rendering capabilities
 */

import * as pdfjsLib from 'pdfjs-dist'
import { CMAP_URL, CMAP_PACKED, STANDARD_FONT_DATA_URL } from './config'
import { fontLoader } from '../font/fontLoader'
import { pdfLogger } from '@/utils/logger'

export interface EnhancedRenderOptions {
  scale?: number
  imageFormat?: 'png' | 'jpeg'
  quality?: number
  useEnhancedFonts?: boolean
  fallbackFontFamily?: string
  sourceId?: string // Optional ID for document caching
}

// PDF.js text content item type (subset of fields we use)
// Using Partial to allow compatibility with TextItem | TextMarkedContent
interface TextContentItem {
  str?: string
  fontName?: string
  [key: string]: unknown // Allow other properties from PDF.js
}

export class EnhancedPdfRenderer {
  private static instance: EnhancedPdfRenderer
  private fontAnalysisCache = new Map<string, string>() // sourceId -> fallbackFontFamily

  static getInstance(): EnhancedPdfRenderer {
    if (!EnhancedPdfRenderer.instance) {
      EnhancedPdfRenderer.instance = new EnhancedPdfRenderer()
    }
    return EnhancedPdfRenderer.instance
  }

  /**
   * Initialize the enhanced renderer
   */
  async initialize(): Promise<void> {
    try {
      // Preload common fonts
      await fontLoader.preloadCommonFonts()
      pdfLogger.info('[Enhanced PDF Renderer] Font initialization completed')
    } catch (error) {
      pdfLogger.warn('[Enhanced PDF Renderer] Font initialization failed:', error)
    }
  }

  /**
   * Explicitly destroy a cached document analysis
   */
  async destroyDocument(sourceId: string): Promise<void> {
    if (this.fontAnalysisCache.has(sourceId)) {
      this.fontAnalysisCache.delete(sourceId)
      pdfLogger.info(`[Enhanced PDF Renderer] Cleared font analysis cache for: ${sourceId}`)
    }
  }

  /**
   * Analyze PDF font usage
   */
  async analyzeFonts(pdfData: ArrayBuffer): Promise<string[]> {
    let pdfDocument: pdfjsLib.PDFDocumentProxy | null = null
    try {
      const uint8Array = new Uint8Array(pdfData)
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED,
        standardFontDataUrl: STANDARD_FONT_DATA_URL,
        useSystemFonts: true,
        fontExtraProperties: true,
        verbosity: 0
      })

      pdfDocument = await loadingTask.promise
      const fontNames: string[] = []

      // Analyze first few pages to determine font usage
      const numPages = Math.min(pdfDocument.numPages, 3)

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdfDocument.getPage(pageNum)
          const textContent = await page.getTextContent()

          textContent.items.forEach((item: TextContentItem) => {
            if (item.fontName) {
              fontNames.push(item.fontName)
            }
          })

          page.cleanup()
        } catch (pageError) {
          pdfLogger.warn(`Failed to analyze page ${pageNum}:`, pageError)
        }
      }

      return [...new Set(fontNames)] // Remove duplicates

    } catch (error) {
      pdfLogger.error('[Enhanced PDF Renderer] Font analysis failed:', error)
      return []
    } finally {
      if (pdfDocument) {
        try {
          await pdfDocument.destroy()
        } catch (e) {
          pdfLogger.warn('[Enhanced PDF Renderer] Error destroying document in analyzeFonts:', e)
        }
      }
    }
  }

  /**
   * Get optimal fallback font for this PDF
   */
  async getOptimalFallbackFont(pdfData: ArrayBuffer, sourceId?: string): Promise<string> {
    // If we have a cached result for this sourceId, return it
    if (sourceId && this.fontAnalysisCache.has(sourceId)) {
      return this.fontAnalysisCache.get(sourceId)!
    }

    try {
      // Create a safe copy of the ArrayBuffer to avoid detachment issues
      const pdfDataCopy = pdfData.slice(0)
      const textContent = await this.extractTextContent(pdfDataCopy)
      const font = fontLoader.getBestFont(textContent)

      // Cache the result if we have a sourceId
      if (sourceId) {
        this.fontAnalysisCache.set(sourceId, font)
      }

      return font
    } catch (error) {
      pdfLogger.warn('[Enhanced PDF Renderer] Could not determine optimal font:', error)
      return 'sans-serif'
    }
  }

  /**
   * Extract text content for font analysis
   */
  private async extractTextContent(pdfData: ArrayBuffer): Promise<string> {
    let pdfDocument: pdfjsLib.PDFDocumentProxy | null = null
    try {
      const uint8Array = new Uint8Array(pdfData)
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED,
        standardFontDataUrl: STANDARD_FONT_DATA_URL,
        useSystemFonts: true,
        verbosity: 0
      })

      pdfDocument = await loadingTask.promise
      let allText = ''

      // Extract text from first few pages
      const numPages = Math.min(pdfDocument.numPages, 3)

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdfDocument.getPage(pageNum)
          const textContent = await page.getTextContent()

          textContent.items.forEach((item: TextContentItem) => {
            if (item.str) {
              allText += item.str + ' '
            }
          })

          page.cleanup()
        } catch (pageError) {
          pdfLogger.warn(`Failed to extract text from page ${pageNum}:`, pageError)
        }
      }

      return allText

    } catch (error) {
      pdfLogger.error('[Enhanced PDF Renderer] Text extraction failed:', error)
      return ''
    } finally {
      if (pdfDocument) {
        try {
          await pdfDocument.destroy()
        } catch (e) {
          pdfLogger.warn('[Enhanced PDF Renderer] Error destroying document in extractTextContent:', e)
        }
      }
    }
  }
}

// Export singleton instance
export const enhancedPdfRenderer = EnhancedPdfRenderer.getInstance()