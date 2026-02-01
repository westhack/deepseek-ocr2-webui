import { db } from '@/db'
import type { OCRBox } from '@/services/ocr'
import { getRandomId } from '@/utils/crypto'

export class ImageProcessor {
    /**
     * Slice images from the original page image based on OCR boxes.
     * Only processes boxes labeled 'image' or 'table'.
     * 
     * @param pageId The ID of the page
     * @param imageBlob The original image blob
     * @param boxes The OCR boxes
     * @returns A map of box index (string) to the saved extracted image ID
     */
    async sliceImages(pageId: string, imageBlob: Blob, boxes: OCRBox[]): Promise<Map<string, string>> {
        const resultMap = new Map<string, string>()
        const targetLabels = ['image', 'figure']

        // Filter relevant boxes first to avoid unnecessary bitmap creation if no images
        const relevantBoxes = boxes.map((box, index) => ({ box, index }))
            .filter(item => targetLabels.includes(item.box.label.toLowerCase()))

        if (relevantBoxes.length === 0) {
            return resultMap
        }

        let bitmap: ImageBitmap | null = null

        try {
            // Create ImageBitmap from Blob (efficient for reading)
            bitmap = await createImageBitmap(imageBlob)

            for (const { box, index } of relevantBoxes) {
                const [x1, y1, x2, y2] = box.box
                const width = x2 - x1
                const height = y2 - y1

                if (width <= 0 || height <= 0) continue

                // Use OffscreenCanvas for slicing
                // Note: In strict environments without OffscreenCanvas, we might need a fallback,
                // but it's standard in modern browsers and workers.
                const canvas = new OffscreenCanvas(width, height)
                const ctx = canvas.getContext('2d')

                if (!ctx) {
                    console.error(`[ImageProcessor] Failed to get 2D context for page ${pageId} box ${index}`)
                    continue
                }

                // Draw the slice
                // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
                ctx.drawImage(bitmap, x1, y1, width, height, 0, 0, width, height)

                // Convert to Blob
                const blob = await canvas.convertToBlob({ type: 'image/png' })

                // Generate ID
                // Format: pageId_index_uuid
                const imageId = `${pageId}_${index}_${getRandomId()}`

                // Save to DB
                await db.savePageExtractedImage({
                    id: imageId,
                    pageId,
                    box: box.box,
                    blob
                })

                resultMap.set(index.toString(), imageId)
            }

        } catch (error) {
            console.error(`[ImageProcessor] Failed to process images for page ${pageId}:`, error)
            throw error
        } finally {
            if (bitmap) {
                bitmap.close()
            }
        }

        return resultMap
    }
}

export const imageProcessor = new ImageProcessor()
