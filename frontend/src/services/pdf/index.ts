import * as pdfjsLib from 'pdfjs-dist'
import { queuePDFPages, resumePDFProcessing } from './pdfQueue'
import { pdfEvents } from './events'
import { db } from '@/db/index'
import { pdfLogger } from '@/utils/logger'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

// Configure PDF.js worker (for main thread usage)
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Initialize enhanced PDF renderer
import { enhancedPdfRenderer } from './enhancedPdfRenderer'
import { CMAP_URL, CMAP_PACKED, STANDARD_FONT_DATA_URL } from './config'

// Initialize enhanced renderer when module loads
enhancedPdfRenderer.initialize().catch(err => pdfLogger.error(err))

export interface PDFPageInfo {
  pageNumber: number
  width: number
  height: number
  imageData?: string  // base64 image data
  thumbnailData?: string  // base64 thumbnail data
}

export interface PDFProcessingOptions {
  dpi?: number
  thumbnailSize?: number
  imageFormat?: 'png' | 'jpeg'
  quality?: number
  scale?: number
}

export interface PDFDocument {
  file: File
  data: ArrayBuffer
  base64Data: string // Pure base64 data (without data: prefix)
  pageCount: number
  pages: PDFPageInfo[]
  metadata?: {
    title?: string
    author?: string
    subject?: string
    creator?: string
    producer?: string
    creationDate?: string | Date
    modificationDate?: string | Date
  }
}

export class PDFService {
  private loadedPDFs = new Map<string, PDFDocument>()

  /**
   * Helper method: Convert File to pure base64 string (without data: prefix)
   */
  private async fileToPureBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Extract pure base64 data, handle edge cases
        const base64 = result.split(',')[1] || ''
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  /**
   * Helper method: Convert pure base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64)
    const len = binaryString.length
    const uint8Array = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      uint8Array[i] = binaryString.charCodeAt(i)
    }
    return uint8Array.buffer
  }

  /**
   * Load PDF document and extract metadata
   */
  async loadPDF(file: File): Promise<PDFDocument> {
    try {
      // 1. Validate file (enhanced validation logic)
      const validateResult = this.validatePDF(file)
      if (!validateResult.valid) {
        throw new Error(validateResult.error!)
      }

      // 2. Convert to pure base64 (as a reliable intermediate carrier)
      const base64Data = await this.fileToPureBase64(file)
      // 3. Convert from base64 to ArrayBuffer (avoiding separation issues with direct file.arrayBuffer() dependency)
      const arrayBuffer = this.base64ToArrayBuffer(base64Data)
      const uint8Array = new Uint8Array(arrayBuffer)

      // 5. Load PDF using Uint8Array (configure CMAP for Chinese character display)
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED,
        standardFontDataUrl: STANDARD_FONT_DATA_URL,
        // Enable font fallback for better text rendering
        useSystemFonts: true,
        // Increase font rendering quality
        fontExtraProperties: true
      })

      const pdfDocument = await loadingTask.promise
      const pageCount = pdfDocument.numPages

      const metadata = await pdfDocument.getMetadata()

      // 7. Extract page information
      const pages = await this.getPDFPageInfos(pdfDocument)

      // 8. Build PDFDocument object
      const pdfDoc: PDFDocument = {
        file,
        data: arrayBuffer,
        base64Data,
        pageCount,
        pages,
        metadata: this.extractMetadataFromPDF((metadata.info as unknown) as Record<string, unknown>)
      }

      // Cache PDF
      const cacheKey = `${file.name}_${file.size}_${file.lastModified}`
      this.loadedPDFs.set(cacheKey, pdfDoc)

      return pdfDoc

    } catch (error) {
      pdfLogger.error('Error loading PDF:', error)
      throw new Error(`Failed to load PDF "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get page count from loaded PDF document
   */
  getPageCount(pdfDocument: PDFDocument): number {
    return pdfDocument.pageCount
  }

  /**
   * Get page information
   */
  getPageInfo(pdfDocument: PDFDocument, pageNumber: number): PDFPageInfo | undefined {
    return pdfDocument.pages.find(p => p.pageNumber === pageNumber)
  }

  /**
   * Process PDF file and queue all pages for rendering
   */
  async processPDF(file: File): Promise<void> {
    try {
      // Save original file to DB for resume support
      let fileId: string | undefined
      try {
        fileId = await db.saveFile({
          name: file.name,
          content: file, // File is a Blob
          size: file.size,
          type: file.type,
          createdAt: new Date()
        })
        pdfLogger.info(`Saved source file to DB: ${file.name} (id: ${fileId})`)
      } catch (dbError) {
        pdfLogger.warn('Failed to save source file to DB, resume will not work:', dbError)
      }

      // Load PDF document
      const pdfDocument = await this.loadPDF(file)

      // Emit processing start event
      pdfEvents.emit('pdf:log', {
        pageId: `pdf_${file.name}_${Date.now()}`,
        message: `Starting to process PDF "${file.name}" with ${pdfDocument.pageCount} pages`,
        level: 'info'
      })

      // Fix: Recreate ArrayBuffer from base64 to avoid using the separated original buffer
      // Alternative to the original slice(0) operation
      const pdfDataCopy = this.base64ToArrayBuffer(pdfDocument.base64Data)

      // Queue all pages for rendering, passing the fileId
      await queuePDFPages(file, pdfDataCopy, pdfDocument.pageCount, fileId)

    } catch (error) {
      pdfLogger.error('Error processing PDF:', error)

      // Emit error event
      pdfEvents.emit('pdf:processing-error', {
        file,
        error: error instanceof Error ? error.message : 'Unknown processing error'
      })
    }
  }

  /**
   * Generate thumbnail for a PDF page (synchronous version using canvas)
   */
  async generateThumbnail(
    pdfData: ArrayBuffer,
    pageNumber: number,
    size: number = 200
  ): Promise<string> {
    try {
      // Load PDF document (add CMAP configuration to avoid garbled Chinese characters in thumbnails)
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdfData),
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED,
        // Enable font fallback for better text rendering
        useSystemFonts: true,
        // Increase font rendering quality
        fontExtraProperties: true
      })
      const pdfDocument = await loadingTask.promise

      // Get page
      const page = await pdfDocument.getPage(pageNumber)

      // Calculate scale to fit within size
      const viewport = page.getViewport({ scale: 1.0 })
      const scale = Math.min(size / viewport.width, size / viewport.height)

      // Create canvas
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!

      // Set canvas dimensions
      const thumbViewport = page.getViewport({ scale })
      canvas.width = thumbViewport.width
      canvas.height = thumbViewport.height

      // Render page to canvas
      await page.render({
        canvasContext: context,
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport: thumbViewport
      }).promise

      // Convert to base64
      return canvas.toDataURL('image/jpeg', 0.8)

    } catch (error) {
      pdfLogger.error('Error generating thumbnail:', error)
      throw error
    }
  }

  /**
   * Resume processing of any interrupted PDF pages
   */
  async resumeProcessing(): Promise<void> {
    await resumePDFProcessing()
  }

  /**
   * Get cached PDF document
   */
  getCachedPDF(file: File): PDFDocument | undefined {
    const cacheKey = `${file.name}_${file.size}_${file.lastModified}`
    return this.loadedPDFs.get(cacheKey)
  }

  /**
   * Clear PDF cache
   */
  clearCache(): void {
    this.loadedPDFs.clear()
  }

  /**
   * Validate PDF file
   */
  validatePDF(file: File): { valid: boolean; error?: string } {
    if (!file) {
      return {
        valid: false,
        error: 'Please select a file!'
      }
    }

    // Enhanced: case-insensitive check for file extension
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      return {
        valid: false,
        error: `Please select a valid PDF file! Current file type: ${file.type || 'unknown'}`
      }
    }

    if (file.size === 0) {
      return {
        valid: false,
        error: `File "${file.name}" is empty`
      }
    }

    // Check file size limit (100MB)
    const maxSize = 100 * 1024 * 1024
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File "${file.name}" is too large, maximum supported size is ${Math.round(maxSize / 1024 / 1024)}MB`
      }
    }

    return { valid: true }
  }

  /**
   * Get PDF metadata without loading full document (Optimization: Reuse loadPDF logic to reduce redundancy)
   */
  async getPDFMetadata(file: File): Promise<{ pageCount?: number; title?: string; author?: string; subject?: string }> {
    try {
      // Reuse loadPDF method to avoid redundant base64 conversion and PDF loading logic
      const pdfDocument = await this.loadPDF(file)
      return {
        pageCount: pdfDocument.pageCount,
        title: pdfDocument.metadata?.title,
        author: pdfDocument.metadata?.author,
        subject: pdfDocument.metadata?.subject
      }

    } catch (error) {
      pdfLogger.error('Error getting PDF metadata:', error)
      return {}
    }
  }

  /**
   * Helper: Extract page information from PDF document
   */
  private async getPDFPageInfos(pdfDocument: pdfjsLib.PDFDocumentProxy): Promise<PDFPageInfo[]> {
    const pages: PDFPageInfo[] = []
    const pageCount = pdfDocument.numPages

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.0 })

      pages.push({
        pageNumber: pageNum,
        width: viewport.width,
        height: viewport.height
      })

      // Release page resources (optimize memory)
      page.cleanup()
    }
    return pages
  }

  /**
   * Helper: Extract and normalize metadata from PDF info object
   */
  private extractMetadataFromPDF(info: Record<string, unknown>): PDFDocument['metadata'] {
    if (!info) return {}

    // Helper to safely extract string values
    const getString = (key: string): string | undefined => {
      const value = info[key]
      return typeof value === 'string' ? value : undefined
    }

    // Helper to safely extract date values
    const getDate = (key: string): string | Date | undefined => {
      const value = info[key]
      if (value instanceof Date) return value
      if (typeof value === 'string') return value
      return undefined
    }

    return {
      title: getString('Title'),
      author: getString('Author'),
      subject: getString('Subject'),
      creator: getString('Creator'),
      producer: getString('Producer'),
      creationDate: getDate('CreationDate'),
      modificationDate: getDate('ModDate')
    }
  }
}

// Export singleton instance
export const pdfService = new PDFService()