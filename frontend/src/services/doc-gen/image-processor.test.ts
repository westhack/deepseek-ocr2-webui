import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ImageProcessor } from './image-processor'
import { db } from '@/db'

// Mock DB
vi.mock('@/db', () => ({
    db: {
        savePageExtractedImage: vi.fn()
    }
}))

describe('ImageProcessor', () => {
    let processor: ImageProcessor
    let originalCreateImageBitmap: any
    let originalOffscreenCanvas: any

    beforeEach(() => {
        processor = new ImageProcessor()
        vi.clearAllMocks()

        // Mock Browser Envs
        originalCreateImageBitmap = global.createImageBitmap
        originalOffscreenCanvas = global.OffscreenCanvas

        global.createImageBitmap = vi.fn().mockResolvedValue({
            close: vi.fn(),
            width: 100,
            height: 100
        } as any)

        global.OffscreenCanvas = class {
            constructor() { }
            getContext() {
                return {
                    drawImage: vi.fn(),
                }
            }
            convertToBlob() {
                return Promise.resolve(new Blob(['img data'], { type: 'image/png' }))
            }
        } as any
    })

    afterEach(() => {
        global.createImageBitmap = originalCreateImageBitmap
        global.OffscreenCanvas = originalOffscreenCanvas
    })

    it('should ignore "table" labels by default', async () => {
        const pageId = 'p1'
        const blob = new Blob(['fake-image'])
        const boxes = [
            { label: 'table', box: [0, 0, 10, 10] },
            { label: 'text', box: [20, 20, 30, 30] } // text should also be ignored
        ]

        // @ts-expect-error -- implementation detail mock
        const result = await processor.sliceImages(pageId, blob, boxes)

        expect(result.size).toBe(0)
        expect(global.createImageBitmap).not.toHaveBeenCalled()
    })

    it('should process "image" and "figure" labels', async () => {
        const pageId = 'p1'
        const blob = new Blob(['fake-image'])
        const boxes = [
            { label: 'image', box: [0, 0, 10, 10] },
            { label: 'figure', box: [20, 20, 30, 30] }
        ]

        // @ts-expect-error -- implementation detail mock
        const result = await processor.sliceImages(pageId, blob, boxes)

        expect(result.size).toBe(2)
        expect(global.createImageBitmap).toHaveBeenCalled()
        expect(db.savePageExtractedImage).toHaveBeenCalledTimes(2)
    })

    it('should skip invalid dimensions', async () => {
        const pageId = 'p1'
        const blob = new Blob(['fake-image'])
        const boxes = [
            { label: 'image', box: [0, 0, 0, 0] } // Width/Height 0
        ]

        // @ts-expect-error -- implementation detail mock
        const result = await processor.sliceImages(pageId, blob, boxes)

        expect(result.size).toBe(0)
    })

    it('should handle context creation failure', async () => {
        const pageId = 'p1'
        const blob = new Blob(['fake-image'])
        const boxes = [
            { label: 'image', box: [0, 0, 10, 10] }
        ]

        global.OffscreenCanvas = class {
            constructor() { }
            getContext() {
                return null // Simulate failure
            }
        } as any

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

        // @ts-expect-error -- implementation detail mock
        const result = await processor.sliceImages(pageId, blob, boxes)

        expect(result.size).toBe(0)
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to get 2D context'))
        consoleSpy.mockRestore()
    })

    it('should handle errors during processing', async () => {
        const pageId = 'p1'
        const blob = new Blob(['fake-image'])
        const boxes = [
            { label: 'image', box: [0, 0, 10, 10] }
        ]

        global.createImageBitmap = vi.fn().mockRejectedValue(new Error('Bitmap Error'))
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

        // @ts-expect-error -- implementation detail mock
        await expect(processor.sliceImages(pageId, blob, boxes)).rejects.toThrow('Bitmap Error')

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to process images'), expect.any(Error))
        consoleSpy.mockRestore()
    })
})
