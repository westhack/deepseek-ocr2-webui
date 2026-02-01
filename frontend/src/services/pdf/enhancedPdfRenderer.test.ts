import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EnhancedPdfRenderer, enhancedPdfRenderer } from '@/services/pdf/enhancedPdfRenderer'
import * as pdfjsLib from 'pdfjs-dist'
import { fontLoader } from '@/services/font/fontLoader'
import { pdfLogger } from '@/utils/logger'

// Mock dependencies
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  version: '2.10.377'
}))

vi.mock('@/services/font/fontLoader', () => ({
  fontLoader: {
    preloadCommonFonts: vi.fn(),
    getBestFont: vi.fn(),
  }
}))

vi.mock('@/utils/logger', () => ({
  pdfLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}))

describe('EnhancedPdfRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fontLoader.getBestFont).mockReset()
    vi.mocked(pdfjsLib.getDocument).mockReset()
  })

  describe('getInstance', () => {
    it('should return the same instance', () => {
      const instance1 = EnhancedPdfRenderer.getInstance()
      const instance2 = EnhancedPdfRenderer.getInstance()
      expect(instance1).toBe(instance2)
      expect(instance1).toBe(enhancedPdfRenderer)
    })
  })

  describe('initialize', () => {
    it('should preload common fonts', async () => {
      await enhancedPdfRenderer.initialize()
      expect(fontLoader.preloadCommonFonts).toHaveBeenCalled()
      expect(pdfLogger.info).toHaveBeenCalledWith(expect.stringContaining('Font initialization completed'))
    })

    it('should handle initialization errors', async () => {
      vi.mocked(fontLoader.preloadCommonFonts).mockRejectedValueOnce(new Error('Init failed'))
      await enhancedPdfRenderer.initialize()
      expect(pdfLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Font initialization failed'), expect.any(Error))
    })
  })

  describe('analyzeFonts', () => {
    const mockPage = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { fontName: 'Arial', str: 'text' },
          { fontName: 'Times', str: 'text' },
          { str: 'no font' } // item without fontName
        ]
      }),
      cleanup: vi.fn()
    }

    const mockDoc = {
      numPages: 5,
      getPage: vi.fn().mockResolvedValue(mockPage),
      destroy: vi.fn().mockResolvedValue(undefined)
    }

    it('should extract unique font names from first 3 pages', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockDoc)
      } as any)

      const fonts = await enhancedPdfRenderer.analyzeFonts(new ArrayBuffer(10))

      expect(pdfjsLib.getDocument).toHaveBeenCalled()
      expect(mockDoc.getPage).toHaveBeenCalledTimes(3) // min(5, 3)
      expect(fonts).toEqual(expect.arrayContaining(['Arial', 'Times']))
      expect(fonts.length).toBe(2)
      expect(mockDoc.destroy).toHaveBeenCalled()
    })

    it('should handle page errors gracefully', async () => {
      const errorMockDoc = {
        numPages: 1,
        getPage: vi.fn().mockRejectedValue(new Error('Page error')),
        destroy: vi.fn()
      }
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(errorMockDoc)
      } as any)

      const fonts = await enhancedPdfRenderer.analyzeFonts(new ArrayBuffer(10))

      expect(fonts).toEqual([])
      expect(pdfLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to analyze page'), expect.any(Error))
    })

    it('should handle document load errors', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.reject(new Error('Load error'))
      } as any)

      const fonts = await enhancedPdfRenderer.analyzeFonts(new ArrayBuffer(10))

      expect(fonts).toEqual([])
      expect(pdfLogger.error).toHaveBeenCalledWith(expect.stringContaining('Font analysis failed'), expect.any(Error))
    })

    it('should handle destroy errors', async () => {
      const destroyErrorDoc = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        destroy: vi.fn().mockRejectedValue(new Error('Destroy error'))
      }
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(destroyErrorDoc)
      } as any)

      await enhancedPdfRenderer.analyzeFonts(new ArrayBuffer(10))

      expect(pdfLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Error destroying document'), expect.any(Error))
    })
  })

  describe('getOptimalFallbackFont', () => {
    const mockPageText = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [{ str: 'Hello World' }]
      }),
      cleanup: vi.fn()
    }
    const mockDocText = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPageText),
      destroy: vi.fn()
    }

    it('should return cached font if available', async () => {
      // Manually cache something first
      // Since fontAnalysisCache is private, we can't set it directly easily.
      // But getOptimalFallbackFont sets it.

      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockDocText)
      } as any)
      vi.mocked(fontLoader.getBestFont).mockReturnValue('CachedFont')

      // First call to populate cache
      await enhancedPdfRenderer.getOptimalFallbackFont(new ArrayBuffer(10), 'source-1')

      // Reset mocks to prove we use cache
      vi.mocked(fontLoader.getBestFont).mockClear()
      vi.mocked(pdfjsLib.getDocument).mockClear()

      // Second call
      const font = await enhancedPdfRenderer.getOptimalFallbackFont(new ArrayBuffer(10), 'source-1')

      expect(font).toBe('CachedFont')
      expect(fontLoader.getBestFont).not.toHaveBeenCalled()
      expect(pdfjsLib.getDocument).not.toHaveBeenCalled()
    })

    it('should extract text and determine best font on cache miss', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockDocText)
      } as any)
      vi.mocked(fontLoader.getBestFont).mockReturnValue('Arial')

      const font = await enhancedPdfRenderer.getOptimalFallbackFont(new ArrayBuffer(10))

      expect(font).toBe('Arial')
      expect(fontLoader.getBestFont).toHaveBeenCalledWith('Hello World ')
    })

    it('should fallback to sans-serif on error', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockDocText)
      } as any)
      vi.mocked(fontLoader.getBestFont).mockImplementation(() => { throw new Error('Font detection error') })

      const font = await enhancedPdfRenderer.getOptimalFallbackFont(new ArrayBuffer(10))

      expect(font).toBe('sans-serif')
      expect(pdfLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not determine optimal font'), expect.any(Error))
    })
  })

  describe('destroyDocument', () => {
    it('should clear the cache for the given sourceId', async () => {
      // First populate cache
      const mockDocText = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({ getTextContent: vi.fn().mockResolvedValue({ items: [] }), cleanup: vi.fn() }),
        destroy: vi.fn()
      }
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve(mockDocText) } as any)
      vi.mocked(fontLoader.getBestFont).mockReturnValue('FontA')

      await enhancedPdfRenderer.getOptimalFallbackFont(new ArrayBuffer(10), 'id-to-delete')

      // Verify cache hit logic (indirectly)
      vi.mocked(pdfjsLib.getDocument).mockClear()
      await enhancedPdfRenderer.getOptimalFallbackFont(new ArrayBuffer(10), 'id-to-delete')
      expect(pdfjsLib.getDocument).not.toHaveBeenCalled() // Proves it's cached

      // Now destroy
      await enhancedPdfRenderer.destroyDocument('id-to-delete')
      expect(pdfLogger.info).toHaveBeenCalledWith(expect.stringContaining('Cleared font analysis cache'))

      // Verify cache miss
      await enhancedPdfRenderer.getOptimalFallbackFont(new ArrayBuffer(10), 'id-to-delete')
      expect(pdfjsLib.getDocument).toHaveBeenCalled() // Proves cache was cleared
    })

    it('should do nothing if sourceId not in cache', async () => {
      await enhancedPdfRenderer.destroyDocument('non-existent')
      // Can't easily verify "did nothing" other than no error and no log if log is conditional
      // The implementation logs only if has(sourceId).
      // So let's check that info log was NOT called
      expect(pdfLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Cleared font analysis cache for: non-existent'))
    })
  })
})
