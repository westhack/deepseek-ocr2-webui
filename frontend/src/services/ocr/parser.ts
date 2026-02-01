import type { OCRBox } from './index'

/**
 * Normalizes a box from 0-1000 normalized coordinates to absolute pixel coordinates.
 * If the coordinates are already likely absolute (max > 1000), it returns them as-is.
 */
function isNormalizationNeeded(maxCoord: number, dims: { w: number; h: number }): boolean {
    if (maxCoord > 1000) return false
    return dims.w > 1010 || dims.h > 1010 || dims.w < 990 || dims.h < 990
}

export function normalizeBox(coords: number[], dims: { w: number; h: number }): [number, number, number, number] {
    if (coords.length < 4) return [0, 0, 0, 0]

    // Ensure we have numbers and at least 4 elements
    const c = coords.map(v => v || 0)
    const maxCoord = Math.max(...c)

    const x1 = c[0] ?? 0
    const y1 = c[1] ?? 0
    const x2 = c[2] ?? 0
    const y2 = c[3] ?? 0

    if (isNormalizationNeeded(maxCoord, dims)) {
        return [
            (x1 / 1000) * dims.w,
            (y1 / 1000) * dims.h,
            (x2 / 1000) * dims.w,
            (y2 / 1000) * dims.h
        ]
    }

    return [x1, y1, x2, y2]
}

/**
 * Parses raw_text string to extract OCR boxes.
 * Format: <|ref|>TYPE<|/ref|><|det|>[[x,y,x,y], [x,y,x,y]]<|/det|>CONTENT
 */
export function parseOCRBoxes(rawText: string, imageDims: { w: number; h: number }): OCRBox[] {
    const boxes: OCRBox[] = []
    // Regex to find the whole det block
    const detBlockRegex = /<\|ref\|>(.*?)<\|\/ref\|><\|det\|>\[\[(.*?)\]\]<\|\/det\|>/g

    let match
    while ((match = detBlockRegex.exec(rawText)) !== null) {
        const label = match[1]?.trim().toLowerCase() || 'text'
        const allCoordsStr = match[2]
        if (!allCoordsStr) continue

        // Split by "], [" to get individual box strings
        const boxStrings = allCoordsStr.split(/\],?\s*\[/)

        for (const boxStr of boxStrings) {
            const coords = boxStr.split(',').map(s => Number(s.trim()))
            if (coords.length === 4) {
                const absBox = normalizeBox(coords, imageDims)
                boxes.push({
                    label,
                    box: absBox
                })
            }
        }
    }

    return boxes
}
