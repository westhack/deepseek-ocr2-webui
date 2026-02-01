import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocumentService } from './index'
import { ocrEvents } from '@/services/ocr/events'
import { db } from '@/db'
import { imageProcessor } from './image-processor'
import { queueManager } from '@/services/queue'

// Polyfill for Blob.arrayBuffer
if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function () {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as ArrayBuffer)
            reader.onerror = reject
            reader.readAsArrayBuffer(this)
        })
    }
}

// Mock dependencies
vi.mock('@/db', () => ({
    db: {
        getPageImage: vi.fn(),
        savePageMarkDown: vi.fn(),
        savePageMarkdown: vi.fn(),
        savePageDOCX: vi.fn(),
        savePagePDF: vi.fn(),
        getPageOCR: vi.fn(),
        savePageOCR: vi.fn()
    }
}))

vi.mock('./image-processor', () => ({
    imageProcessor: {
        sliceImages: vi.fn()
    }
}))

vi.mock('./pdf', () => ({
    sandwichPDFBuilder: {
        generate: vi.fn()
    }
}))

vi.mock('./docx', () => ({
    docxGenerator: {
        generate: vi.fn()
    }
}))

vi.mock('@/services/queue', () => ({
    queueManager: {
        addGenerationTask: vi.fn(),
        addOCRTask: vi.fn()
    }
}))

describe('DocumentService Integration', () => {
    let service: DocumentService

    beforeEach(async () => {
        vi.clearAllMocks()
        service = new DocumentService()

        // Setup default mocks for success
        const { docxGenerator } = await import('./docx')
        const { sandwichPDFBuilder } = await import('./pdf')

        vi.mocked(docxGenerator.generate).mockResolvedValue(new Blob(['docx']))
        vi.mocked(sandwichPDFBuilder.generate).mockResolvedValue(new Blob(['pdf']))
    })

    it('should handle ocr:success and queue generation task', async () => {
        service.init()
        const pageId = 'page1'
        const result: any = {
            success: true,

            text: 'test',
            raw_text: 'test',
            boxes: [],
            image_dims: { w: 1, h: 1 },
            prompt_type: 'document'
        }

        // Trigger event
        ocrEvents.emit('ocr:success', { pageId, result })

        expect(queueManager.addGenerationTask).toHaveBeenCalledWith(pageId, expect.any(Function))
    })

    it('should generate markdown, docx and pdf', async () => {
        const pageId = 'page1'
        const result: any = {
            success: true,

            text: 'test',
            raw_text: 'test',
            boxes: [],
            image_dims: { w: 1, h: 1 },
            prompt_type: 'document'
        }
        const mockImage = new Blob(['image'], { type: 'image/png' })

        vi.mocked(db.getPageImage).mockResolvedValue(mockImage)
        vi.mocked(imageProcessor.sliceImages).mockResolvedValue(new Map())

        const startEvents: string[] = []
        const successEvents: string[] = []

        ocrEvents.on('doc:gen:start', (payload) => startEvents.push(payload.type))
        ocrEvents.on('doc:gen:success', (payload) => successEvents.push(payload.type))

        await service.generateMarkdown(pageId, result)

        expect(db.savePageMarkdown).toHaveBeenCalled()
        expect(db.savePageDOCX).toHaveBeenCalled()
        expect(db.savePagePDF).toHaveBeenCalled()

        expect(startEvents).toContain('markdown')
        expect(startEvents).toContain('docx')
        expect(startEvents).toContain('pdf')
        expect(successEvents).toContain('markdown')
        expect(successEvents).toContain('docx')
        expect(successEvents).toContain('pdf')
    })

    it('should respect AbortSignal', async () => {
        const controller = new AbortController()
        controller.abort()

        const pageId = 'page1'
        const result: any = { success: true, text: 'test' }

        // Should return early
        await service.generateAll(pageId, result, controller.signal)

        expect(db.getPageImage).not.toHaveBeenCalled()
    })

    it('should handle missing image error', async () => {
        const pageId = 'page1'
        const result: any = { success: true, text: 'test' }
        vi.mocked(db.getPageImage).mockResolvedValue(undefined as any)

        const errorEvents: any[] = []
        ocrEvents.on('doc:gen:error', (payload) => errorEvents.push(payload))

        await expect(service.generateAll(pageId, result)).rejects.toThrow('Image not found')
        expect(errorEvents[0].type).toBe('all')
    })

    it('should handle generateDocx failure', async () => {
        const pageId = 'page1'
        const result: any = {
            success: true,
            text: 'test',
            raw_text: 'test',
            image_dims: { w: 1000, h: 1000 },
            boxes: []
        }
        vi.mocked(db.getPageImage).mockResolvedValue(new Blob(['image']) as any)
        vi.mocked(imageProcessor.sliceImages).mockResolvedValue(new Map())

        const { docxGenerator } = await import('./docx')
        vi.mocked(docxGenerator.generate).mockRejectedValue(new Error('Docx Fail'))

        const errorEvents: any[] = []
        ocrEvents.on('doc:gen:error', (payload) => errorEvents.push(payload))

        await expect(service.generateAll(pageId, result)).rejects.toThrow('Docx Fail')
        expect(errorEvents.some(e => e.type === 'docx')).toBe(true)
    })

    it('should handle generatePDF failure', async () => {
        const pageId = 'page1'
        const result: any = {
            success: true,
            text: 'test',
            raw_text: 'test',
            image_dims: { w: 1000, h: 1000 },
            boxes: []
        }
        vi.mocked(db.getPageImage).mockResolvedValue(new Blob(['image']) as any)
        vi.mocked(imageProcessor.sliceImages).mockResolvedValue(new Map())

        const { sandwichPDFBuilder } = await import('./pdf')
        vi.mocked(sandwichPDFBuilder.generate).mockRejectedValue(new Error('PDF Fail'))

        await expect(service.generateAll(pageId, result)).rejects.toThrow('PDF Fail')
    })

    it('should register init listener', () => {
        const spy = vi.spyOn(ocrEvents, 'on')
        service.init()
        expect(spy).toHaveBeenCalledWith('ocr:success', expect.any(Function))
    })

    describe('ensureBlob', () => {
        it('should return blob as is', () => {
            const blob = new Blob(['test'])
            expect((service as any).ensureBlob(blob)).toBe(blob)
        })

        it('should convert arraybuffer to blob', () => {
            const ab = new ArrayBuffer(4)
            const result = (service as any).ensureBlob(ab)
            expect(result).toBeInstanceOf(Blob)
        })
    })

    it('should handle generatePDF error in generatePDF method', async () => {
        const pageId = 'page1'
        const result: any = { success: true, text: 'test' }
        const { sandwichPDFBuilder } = await import('./pdf')
        vi.mocked(sandwichPDFBuilder.generate).mockRejectedValue(new Error('PDF Method Fail'))

        const errorEvents: any[] = []
        ocrEvents.on('doc:gen:error', (payload) => errorEvents.push(payload))

        await expect(service.generatePDF(pageId, new Blob(['img']), result)).rejects.toThrow('PDF Method Fail')
        expect(errorEvents.some(e => e.type === 'pdf')).toBe(true)
    })

    it('should return early if signal aborted in generateDocx', async () => {
        const controller = new AbortController()
        controller.abort()
        await service.generateDocx('p1', 'md', controller.signal)
        expect(db.savePageDOCX).not.toHaveBeenCalled()
    })

    it('should return early if signal aborted in generatePDF', async () => {
        const controller = new AbortController()
        controller.abort()
        await service.generatePDF('p1', new Blob([]), {} as any, controller.signal)
        expect(db.savePagePDF).not.toHaveBeenCalled()
    })

    it('should handle abort during generateAll', async () => {
        const controller = new AbortController()
        const page1 = 'p1'
        const result: any = { success: true, text: 'test' }

        // Mock db.getPageImage to return a blob
        vi.mocked(db.getPageImage).mockResolvedValue(new Blob(['img']))

        const promise = service.generateAll(page1, result, controller.signal)
        controller.abort()
        await promise
        // Success event should not be emitted
        const spy = vi.spyOn(ocrEvents, 'emit')
        expect(spy).not.toHaveBeenCalledWith('doc:gen:success', expect.objectContaining({ pageId: page1, type: 'all' }))
    })

    it('should handle abort during generateDocx (after generate)', async () => {
        const controller = new AbortController()
        let resolveGen: any
        const promise = new Promise((resolve) => { resolveGen = resolve })
        const { docxGenerator } = await import('./docx')
        vi.mocked(docxGenerator.generate).mockReturnValue(promise as any)

        const call = service.generateDocx('p1', 'md', controller.signal)
        controller.abort()
        resolveGen(new Blob(['test']))
        await call
        expect(db.savePageDOCX).not.toHaveBeenCalled()
    })

    it('should handle abort in generateDocx catch block', async () => {
        const controller = new AbortController()
        const { docxGenerator } = await import('./docx')
        vi.mocked(docxGenerator.generate).mockRejectedValue(new Error('Fail'))
        controller.abort()

        const spy = vi.spyOn(ocrEvents, 'emit')
        await service.generateDocx('p1', 'md', controller.signal)
        expect(spy).not.toHaveBeenCalledWith('doc:gen:error', expect.objectContaining({ type: 'docx' }))
    })

    it('should handle abort during generatePDF (after generate)', async () => {
        const controller = new AbortController()
        let resolveGen: any
        const promise = new Promise((resolve) => { resolveGen = resolve })
        const { sandwichPDFBuilder } = await import('./pdf')
        vi.mocked(sandwichPDFBuilder.generate).mockReturnValue(promise as any)

        const call = service.generatePDF('p1', new Blob([]), {} as any, controller.signal)
        controller.abort()
        resolveGen(new Blob(['test']))
        await call
        expect(db.savePagePDF).not.toHaveBeenCalled()
    })

    it('should handle abort in generatePDF catch block', async () => {
        const controller = new AbortController()
        const { sandwichPDFBuilder } = await import('./pdf')
        vi.mocked(sandwichPDFBuilder.generate).mockRejectedValue(new Error('Fail'))
        controller.abort()

        const spy = vi.spyOn(ocrEvents, 'emit')
        await service.generatePDF('p1', new Blob([]), {} as any, controller.signal)
        expect(spy).not.toHaveBeenCalledWith('doc:gen:error', expect.objectContaining({ type: 'pdf' }))
    })

    it('should handle abort in generateMarkdownOnly', async () => {
        const controller = new AbortController()
        vi.mocked(imageProcessor.sliceImages).mockResolvedValue(new Map())
        controller.abort()

        await expect((service as any).generateMarkdownOnly('p1', new Blob([]), { text: '', boxes: [] } as any, controller.signal)).rejects.toThrow('Aborted')
    })
})
