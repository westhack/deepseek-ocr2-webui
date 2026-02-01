import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pdfService } from '@/services/pdf/index'
import * as pdfjsLib from 'pdfjs-dist'
import { queuePDFPages, resumePDFProcessing } from '@/services/pdf/pdfQueue'
import { pdfEvents } from '@/services/pdf/events'
import { db } from '@/db/index'
import { pdfLogger } from '@/utils/logger'

// 1. Mock dependencies
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  version: '2.10.377'
}))

vi.mock('@/services/pdf/pdfQueue', () => ({
  queuePDFPages: vi.fn(),
  resumePDFProcessing: vi.fn()
}))

vi.mock('@/services/pdf/events', () => ({
  pdfEvents: { emit: vi.fn() }
}))

vi.mock('@/db/index', () => ({
  db: { saveFile: vi.fn().mockResolvedValue('file-id-123') }
}))

vi.mock('@/utils/logger', () => ({
  pdfLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('@/services/pdf/enhancedPdfRenderer', () => ({
  enhancedPdfRenderer: { initialize: vi.fn().mockResolvedValue(undefined) }
}))

// Globals for cleanup
const originalFileReader = global.FileReader
const originalCreateElement = document.createElement

describe('PDFService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupFileReaderMock()
    setupCanvasMock(originalCreateElement)
  })

  afterEach(() => {
    global.FileReader = originalFileReader
    document.createElement = originalCreateElement
  })

  it('validatePDF: should fail if file is null/undefined', () => {
    expect(pdfService.validatePDF(undefined as any)).toEqual({ valid: false, error: 'Please select a file!' })
  })

  it('validatePDF: should fail for non-pdf types', () => {
    const file = new File([''], 'test.txt', { type: 'text/plain' })
    expect(pdfService.validatePDF(file)).toEqual({ valid: false, error: expect.stringContaining('Please select a valid PDF file') })
  })

  it('validatePDF: should fail for empty files', () => {
    const file = new File([], 'empty.pdf', { type: 'application/pdf' })
    expect(pdfService.validatePDF(file)).toEqual({ valid: false, error: expect.stringContaining('is empty') })
  })

  it('validatePDF: should fail for large files > 100MB', () => {
    const file = { name: 'large.pdf', type: 'application/pdf', size: 101 * 1024 * 1024 } as File
    expect(pdfService.validatePDF(file)).toEqual({ valid: false, error: expect.stringContaining('too large') })
  })

  it('validatePDF: should pass for valid pdf', () => {
    const file = { name: 'valid.pdf', type: 'application/pdf', size: 1024, lastModified: 123 } as unknown as File
    expect(pdfService.validatePDF(file)).toEqual({ valid: true })
  })

  it('loadPDF: should load PDF and extract info', async () => {
    setupPDFMocks()
    const file = new File(['dummy'], 'test.pdf', { type: 'application/pdf' })
    const result = await pdfService.loadPDF(file)
    expect(pdfjsLib.getDocument).toHaveBeenCalled()
    expect(result.pageCount).toBe(2)
    expect(result.metadata?.title).toBe('Test PDF')
    expect(result.pages).toHaveLength(2)
  })

  it('loadPDF: should throw error if validation fails', async () => {
    const file = new File([], 'empty.pdf', { type: 'application/pdf' })
    await expect(pdfService.loadPDF(file)).rejects.toThrow('is empty')
  })

  it('loadPDF: should throw error if pdf loading fails', async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.reject(new Error('PDF Corrupt')) } as any)
    const file = new File(['x'], 'corrupt.pdf', { type: 'application/pdf' })
    await expect(pdfService.loadPDF(file)).rejects.toThrow('PDF Corrupt')
    expect(pdfLogger.error).toHaveBeenCalled()
  })

  it('processPDF: should process PDF successfully', async () => {
    setupPDFMocks()
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    await pdfService.processPDF(file)
    expect(db.saveFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'test.pdf' }))
    expect(pdfEvents.emit).toHaveBeenCalledWith('pdf:log', expect.anything())
    expect(queuePDFPages).toHaveBeenCalled()
  })

  it('processPDF: should handle db save error but continue', async () => {
    setupPDFMocks()
    vi.mocked(db.saveFile).mockRejectedValueOnce(new Error('DB Error'))
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    await pdfService.processPDF(file)
    expect(pdfLogger.warn).toHaveBeenCalled()
    expect(queuePDFPages).toHaveBeenCalled()
  })

  it('processPDF: should handle errors and emit error event', async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.reject(new Error('Load failed')) } as any)
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    await pdfService.processPDF(file)
    expect(pdfLogger.error).toHaveBeenCalled()
    expect(pdfEvents.emit).toHaveBeenCalledWith('pdf:processing-error', expect.anything())
  })

  it('generateThumbnail: should render page and return data url', async () => {
    const { mockPage, mockDoc } = setupThumbnailMocks()
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve(mockDoc) } as any)
    const thumb = await pdfService.generateThumbnail(new ArrayBuffer(10), 1)
    expect(mockPage.render).toHaveBeenCalled()
    expect(thumb).toBe('data:image/jpeg;base64,thumb')
  })

  it('resumeProcessing: should call pdfQueue.resumePDFProcessing', async () => {
    await pdfService.resumeProcessing()
    expect(resumePDFProcessing).toHaveBeenCalled()
  })

  it('cache: should retrieve cached PDF', async () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    setupPDFMocks()
    await pdfService.loadPDF(file)
    const cached = pdfService.getCachedPDF(file)
    expect(cached).toBeDefined()
    expect(cached?.file).toBe(file)
  })

  it('cache: should clear cache', async () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    pdfService.clearCache()
    const cached = pdfService.getCachedPDF(file)
    expect(cached).toBeUndefined()
  })

  it('metadata: should return extracted metadata', async () => {
    const { mockDoc } = setupMetadataMocks()
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve(mockDoc) } as any)
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    const metadata = await pdfService.getPDFMetadata(file)
    expect(metadata.pageCount).toBe(10)
    expect(metadata.title).toBe('Metadata Title')
  })

  it('metadata: should return empty object on error', async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.reject(new Error('Load failed')) } as any)
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    const metadata = await pdfService.getPDFMetadata(file)
    expect(metadata).toEqual({})
    expect(pdfLogger.error).toHaveBeenCalled()
  })

  it('info: should return correct page count and info', () => {
    const mockPDFDoc = { pageCount: 5, pages: [{ pageNumber: 1, width: 100, height: 200 }] } as any
    expect(pdfService.getPageCount(mockPDFDoc)).toBe(5)
    expect(pdfService.getPageInfo(mockPDFDoc, 1)).toEqual({ pageNumber: 1, width: 100, height: 200 })
  })
})

describe('Coverage Gaps', () => {
  it('extractMetadataFromPDF: should handle various data types', async () => {
    const mockDoc = {
      numPages: 1,
      getMetadata: vi.fn().mockResolvedValue({
        info: {
          Title: 123, // Not string
          Author: 'Valid Author',
          CreationDate: new Date('2023-01-01'), // Date object
          ModDate: 'D:20230101', // String date
          Subject: null
        }
      }),
      getPage: vi.fn().mockResolvedValue({ getViewport: () => ({ width: 100, height: 100 }), cleanup: () => { } })
    }
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve(mockDoc) } as any)

    // Use loadPDF to verify metadata processing
    const pdfDoc = await pdfService.loadPDF(new File(['dummy context'], 't.pdf', { type: 'application/pdf' }))

    expect(pdfDoc.metadata?.author).toBe('Valid Author')
    expect(pdfDoc.metadata?.title).toBeUndefined()
    expect(pdfDoc.metadata?.creationDate).toBeInstanceOf(Date)
    expect(pdfDoc.metadata?.modificationDate).toBe('D:20230101')
  })

  it('validatePDF: should accept .PDF extension (case insensitive)', () => {
    const file = { name: 'TEST.PDF', type: 'application/octet-stream', size: 100 } as File
    expect(pdfService.validatePDF(file).valid).toBe(true)
  })

  it('generateThumbnail: should handle errors', async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.reject(new Error('Thumb Fail')) } as any)
    await expect(pdfService.generateThumbnail(new ArrayBuffer(0), 1)).rejects.toThrow('Thumb Fail')
  })

  it('getPageInfo: should return undefined for missing page', () => {
    const doc = { pages: [] } as any
    expect(pdfService.getPageInfo(doc, 1)).toBeUndefined()
  })

  it('loadPDF: should handle FileReader error', async () => {
    // Override global FileReader temporarily
    const originalFR = globalThis.FileReader
    globalThis.FileReader = class ErrorReader {
      readAsDataURL() {
        setTimeout(() => {
          if (this.onerror) this.onerror(new ProgressEvent('error'))
        }, 0)
      }
      onerror: ((event: ProgressEvent) => void) | null = null
      onload: ((event: ProgressEvent) => void) | null = null
      result: string | ArrayBuffer | null = null
    } as any

    try {
      await expect(pdfService.loadPDF(new File([''], 'f.pdf', { type: 'application/pdf' })))
        .rejects.toThrow()
    } finally {
      globalThis.FileReader = originalFR
    }
  })
})

function setupFileReaderMock() {
  global.FileReader = class MockFileReader {
    onload: (() => void) | null = null
    readAsDataURL() {
      if (this.onload) this.onload()
    }
    result = 'data:application/pdf;base64,Zm9v'
  } as any
}

function setupCanvasMock(originalCreateElement: typeof document.createElement) {
  const mockContext = { drawImage: vi.fn() }
  const mockCanvas = {
    getContext: vi.fn().mockReturnValue(mockContext),
    toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,thumb'),
    width: 0, height: 0
  }

  document.createElement = vi.fn((tag) => {
    if (tag === 'canvas') return mockCanvas as any
    return originalCreateElement.call(document, tag)
  }) as any
}

function setupPDFMocks() {
  const mockPage = { getViewport: vi.fn().mockReturnValue({ width: 500, height: 800 }), cleanup: vi.fn() }
  const mockDoc = {
    numPages: 2,
    getMetadata: vi.fn().mockResolvedValue({ info: { Title: 'Test PDF' } }),
    getPage: vi.fn().mockResolvedValue(mockPage),
    base64Data: 'Zm9v'
  }
  vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve(mockDoc) } as any)
  return { mockDoc, mockPage }
}

function setupThumbnailMocks() {
  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 1000, height: 1000 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    cleanup: vi.fn()
  }
  const mockDoc = { getPage: vi.fn().mockResolvedValue(mockPage) }
  return { mockPage, mockDoc }
}

function setupMetadataMocks() {
  const mockDoc = {
    numPages: 10,
    getMetadata: vi.fn().mockResolvedValue({ info: { Title: 'Metadata Title' } }),
    getPage: vi.fn().mockResolvedValue({ getViewport: () => ({}), cleanup: () => { } })
  }
  return { mockDoc }
}
