import { ocrEvents } from '@/services/ocr/events'
import { queueManager } from '@/services/queue'
import { db } from '@/db'
import { imageProcessor } from './image-processor'
import { markdownAssembler } from './markdown'
import { docxGenerator } from './docx'
import { sandwichPDFBuilder } from './pdf'
import type { OCRResult } from '@/services/ocr'

export class DocumentService {
    constructor() {
        this.init()
    }

    init() {
        // Listen to OCR success to trigger document generation automatically
        // BUT ONLY for 'document' prompt type
        ocrEvents.on('ocr:success', async ({ pageId, result }) => {
            // Only generate documents for 'document' mode OCR
            // Other modes (find, describe, etc.) should not trigger doc generation
            if (result.prompt_type !== 'document') {
                return
            }

            // Inform that generation is queued
            ocrEvents.emit('doc:gen:queued', { pageId })

            // Add to generation queue
            await queueManager.addGenerationTask(pageId, async (signal) => {
                if (signal.aborted) return
                await this.generateAll(pageId, result, signal)
            })
        })
    }

    /**
     * Orchestrates the generation of all document formats (Markdown, DOCX, PDF)
     */
    /**
     * Orchestrates the generation of all document formats (Markdown, DOCX, PDF)
     */
    async generateAll(pageId: string, ocrResult: OCRResult, signal?: AbortSignal) {
        ocrEvents.emit('doc:gen:start', { pageId, type: 'all' })

        try {
            const checkAbort = () => {
                if (signal?.aborted) throw new Error('Aborted')
            }

            checkAbort()
            const imageBlob = await this.loadImage(pageId)

            checkAbort()
            const markdown = await this.generateMarkdownOnly(pageId, this.ensureBlob(imageBlob), ocrResult, signal)

            checkAbort()
            await this.generateDocx(pageId, markdown, signal)

            checkAbort()
            await this.generatePDF(pageId, imageBlob, ocrResult, signal)

            checkAbort()
            ocrEvents.emit('doc:gen:success', { pageId, type: 'all', url: '' })

        } catch (error: unknown) {
            if (error instanceof Error && error.message === 'Aborted') return
            this.handleError(pageId, error)
        }
    }

    private async loadImage(pageId: string) {
        const imageBlob = await db.getPageImage(pageId)
        if (!imageBlob) throw new Error(`Image not found for page ${pageId}`)
        return imageBlob
    }

    private ensureBlob(imageBlob: Blob | ArrayBuffer): Blob {
        return imageBlob instanceof Blob ? imageBlob : new Blob([imageBlob])
    }

    private handleError(pageId: string, error: unknown) {
        console.error(`[DocumentService] Error generating documents for ${pageId}`, error)
        const err = error instanceof Error ? error : new Error(String(error))
        ocrEvents.emit('doc:gen:error', { pageId, type: 'all', error: err })
        throw err
    }

    private async generateMarkdownOnly(pageId: string, imageBlob: Blob, ocrResult: OCRResult, signal?: AbortSignal): Promise<string> {
        ocrEvents.emit('doc:gen:start', { pageId, type: 'markdown' })
        try {
            // Slice images
            const imageMap = await imageProcessor.sliceImages(pageId, imageBlob, ocrResult.boxes)

            if (signal?.aborted) throw new Error('Aborted')

            // Assemble Markdown
            const markdown = markdownAssembler.assemble(ocrResult, imageMap)

            // Save Markdown
            await db.savePageMarkdown({
                pageId,
                content: markdown
            })

            ocrEvents.emit('doc:gen:success', { pageId, type: 'markdown', url: '' })
            return markdown
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error))
            ocrEvents.emit('doc:gen:error', { pageId, type: 'markdown', error: err })
            throw error
        }
    }

    // Kept for backward compatibility if called directly, but now delegates or throws? 
    // Ideally we replace usages. Assuming generateMarkdown was only called internally or via init.
    async generateMarkdown(pageId: string, ocrResult: OCRResult, signal?: AbortSignal) {
        return this.generateAll(pageId, ocrResult, signal)
    }

    async generateDocx(pageId: string, markdown: string, signal?: AbortSignal) {
        ocrEvents.emit('doc:gen:start', { pageId, type: 'docx' })

        try {
            if (signal?.aborted) return

            const docxBlob = await docxGenerator.generate(markdown)

            if (signal?.aborted) return

            await db.savePageDOCX(pageId, docxBlob)

            ocrEvents.emit('doc:gen:success', { pageId, type: 'docx', url: '' })

        } catch (error) {
            if (signal?.aborted) return

            console.error(`[DocumentService] Error generating docx for ${pageId}`, error)
            const err = error instanceof Error ? error : new Error(String(error))
            ocrEvents.emit('doc:gen:error', { pageId, type: 'docx', error: err })
            // Don't throw to avoid stopping the chain if one fails? 
            // But generateAll catches it. Let's throw.
            throw err
        }
    }

    async generatePDF(pageId: string, imageBlob: Blob | ArrayBuffer, ocrResult: OCRResult, signal?: AbortSignal) {
        ocrEvents.emit('doc:gen:start', { pageId, type: 'pdf' })

        try {
            if (signal?.aborted) return

            const pdfBlob = await sandwichPDFBuilder.generate(imageBlob, ocrResult)

            if (signal?.aborted) return

            await db.savePagePDF(pageId, pdfBlob)

            ocrEvents.emit('doc:gen:success', { pageId, type: 'pdf', url: '' })

        } catch (error) {
            if (signal?.aborted) return

            console.error(`[DocumentService] Error generating PDF for ${pageId}`, error)
            const err = error instanceof Error ? error : new Error(String(error))
            ocrEvents.emit('doc:gen:error', { pageId, type: 'pdf', error: err })
            throw err
        }
    }
}

export const documentService = new DocumentService()
