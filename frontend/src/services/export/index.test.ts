import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExportService, type ExportResult } from './index'
import JSZip from 'jszip'
import { db } from '@/db'

// Mock dependencies
const mockFile = vi.fn()
const mockGenerateAsync = vi.fn().mockResolvedValue(new Blob(['zip-content']))

vi.mock('jszip', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        file: mockFile,
        folder: vi.fn().mockReturnValue({ file: mockFile }),
        generateAsync: mockGenerateAsync
      }
    })
  }
})

vi.mock('@/db', () => ({
  db: {
    getPageMarkdown: vi.fn(),
    getPageExtractedImage: vi.fn(),
    getPagePDF: vi.fn()
  }
}))

vi.mock('@/services/doc-gen/docx', () => ({
  docxGenerator: {
    generate: vi.fn().mockResolvedValue(new Blob(['docx-content']))
  }
}))

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn().mockResolvedValue({
      copyPages: vi.fn().mockResolvedValue([{}]),
      addPage: vi.fn(),
      save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
    }),
    load: vi.fn().mockResolvedValue({
      getPageIndices: vi.fn().mockReturnValue([0])
    })
  }
}))

describe('ExportService', () => {
  let exportService: ExportService

  beforeEach(() => {
    exportService = new ExportService()
    vi.clearAllMocks()
    mockFile.mockClear()
    mockGenerateAsync.mockClear()
  })

  describe('generateFilename', () => {
    it('should generate a filename with default document name', async () => {
      const timestamp = new Date('2023-01-01T12:00:00Z')
      const filename = await exportService.generateFilename(undefined, 'md', timestamp)
      expect(filename).toMatch(/^document_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.md$/)
    })

    it('should sanitize document name', async () => {
      const timestamp = new Date('2023-01-01T12:00:00Z')
      const filename = await exportService.generateFilename('my document!@#', 'pdf', timestamp)
      expect(filename).toContain('my_document___')
      expect(filename.endsWith('.pdf')).toBe(true)
    })
  })

  describe('exportToMarkdown', () => {
    const pages = [
      { id: 'p1' },
      { id: 'p2' }
    ] as any[]

    it('should export to Zip archive by default (or when configured)', async () => {
      vi.mocked(db.getPageMarkdown)
        .mockResolvedValueOnce({ pageId: 'p1', content: '# Page 1\n![Img1](scan2doc-img:img1)' })
        .mockResolvedValueOnce({ pageId: 'p2', content: '# Page 2\nSome text' })

      vi.mocked(db.getPageExtractedImage)
        .mockResolvedValueOnce({ id: 'img1', pageId: 'p1', blob: new Blob(['img1-data']), box: [0, 0, 0, 0] } as any)

      const result = await exportService.exportToMarkdown(pages, { format: 'markdown', includeImages: true })

      expect(db.getPageMarkdown).toHaveBeenCalledTimes(2)
      expect(db.getPageExtractedImage).toHaveBeenCalledWith('img1')
      expect(JSZip).toHaveBeenCalled()

      const zipInstance = vi.mocked(JSZip).mock.results[0]?.value
      expect(zipInstance).toBeDefined()
      expect(zipInstance.file).toHaveBeenCalledWith('document.md', expect.stringContaining('![Img1](images/img1.png)'))
      // Check that images/ folder was created
      // Since folder() returns an object which is also used, we can spy on it.
      // But mockDefinition above returns { ... folder: ... }.
      // The implementation calls zip.folder('images').
      // Our mock returns { file: ... }.
      // So checking logic is implicitly covered if file() on that folder is called.
      // But let's check basic calls.

      expect(result.filename).toMatch(/\.zip$/)
      expect(result.mimeType).toBe('application/zip')
    })

    it('should export to Single File with Data URIs if requested', async () => {
      vi.mocked(db.getPageMarkdown)
        .mockResolvedValueOnce({ pageId: 'p1', content: '![Img1](scan2doc-img:img1)' })

      vi.mocked(db.getPageExtractedImage)
        .mockResolvedValueOnce({ id: 'img1', pageId: 'p1', blob: new Blob(['img1-data'], { type: 'image/png' }), box: [0, 0, 0, 0] } as any)

      const options = { format: 'markdown' as const, useDataURI: true }
      const result = await exportService.exportToMarkdown([pages[0]], options)

      expect(result.filename).toMatch(/\.md$/)
      expect(result.mimeType).toBe('text/markdown')
      expect(db.getPageExtractedImage).toHaveBeenCalledWith('img1')
    })

    it('should export as .md when no images are found', async () => {
      vi.mocked(db.getPageMarkdown)
        .mockResolvedValueOnce({ pageId: 'p1', content: '![Img1](scan2doc-img:missing)' })

      vi.mocked(db.getPageExtractedImage).mockResolvedValue(undefined)

      const result = await exportService.exportToMarkdown([pages[0]], { format: 'markdown' })

      // Since no actual image was found, should export as .md instead of .zip
      expect(result.filename).toMatch(/\.md$/)
      expect(result.mimeType).toBe('text/markdown')
    })

    it('should handle images inside HTML tables (mixed content)', async () => {
      vi.mocked(db.getPageMarkdown)
        .mockResolvedValueOnce({
          pageId: 'p1',
          content: '<table><tr><td><img src="scan2doc-img:img1" alt="Fig1" /></td></tr></table>'
        })

      vi.mocked(db.getPageExtractedImage)
        .mockResolvedValueOnce({ id: 'img1', pageId: 'p1', blob: new Blob(['img1-data']), box: [0, 0, 0, 0] } as any)

      await exportService.exportToMarkdown([pages[0]], { format: 'markdown', includeImages: true })

      const zipInstance = vi.mocked(JSZip).mock.results[0]?.value
      expect(zipInstance).toBeDefined()
      // Check that the image src was replaced in the HTML content
      expect(zipInstance.file).toHaveBeenCalledWith(
        'document.md',
        expect.stringContaining('<img src="images/img1.png" alt="Fig1" />')
      )
      expect(zipInstance.folder).toHaveBeenCalledWith('images')
    })
  })

  describe('implemented methods', () => {
    const pages = [{ id: 'p1' }] as any[]
    const options: any = { format: 'markdown' }

    it('should throw error for exportToHTML', async () => {
      await expect(exportService.exportToHTML(pages as any, options as any)).rejects.toThrow('Not implemented yet')
    })

    it('should successfully exportToDOCX', async () => {
      vi.mocked(db.getPageMarkdown).mockResolvedValue({ pageId: 'p1', content: '# Test' })
      const result = await exportService.exportToDOCX(pages, options)
      expect(result.filename).toMatch(/\.docx$/)
      expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    })

    it('should successfully exportToPDF', async () => {
      const mockBlob = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
      }
      vi.mocked(db.getPagePDF).mockResolvedValue(mockBlob as any)
      const result = await exportService.exportToPDF(pages, options)
      expect(result.filename).toMatch(/\.pdf$/)
      expect(result.mimeType).toBe('application/pdf')
    })
  })

  describe('downloadBlob', () => {
    it('should trigger download using DOM elements', () => {
      const createObjectURLMock = vi.fn().mockReturnValue('blob:url')
      const revokeObjectURLMock = vi.fn()
      globalThis.URL.createObjectURL = createObjectURLMock
      globalThis.URL.revokeObjectURL = revokeObjectURLMock

      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
        style: {}
      } as any
      const createElementMock = vi.spyOn(document, 'createElement').mockReturnValue(mockLink)
      const appendChildMock = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink)
      const removeChildMock = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink)

      const mockResult: ExportResult = {
        blob: new Blob(['test'], { type: 'text/plain' }),
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: 4
      }

      exportService.downloadBlob(mockResult)

      expect(createObjectURLMock).toHaveBeenCalledWith(mockResult.blob)
      expect(createElementMock).toHaveBeenCalledWith('a')
      expect(mockLink.href).toBe('blob:url')
      expect(mockLink.download).toBe('test.txt')
      expect(appendChildMock).toHaveBeenCalledWith(mockLink)
      expect(mockLink.click).toHaveBeenCalled()
      expect(removeChildMock).toHaveBeenCalledWith(mockLink)
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:url')

      createElementMock.mockRestore()
      appendChildMock.mockRestore()
      removeChildMock.mockRestore()
    })
  })
})
