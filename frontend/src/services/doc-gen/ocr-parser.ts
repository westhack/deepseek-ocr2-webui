/**
 * Shared OCR raw_text parsing utilities
 * Used by both Markdown and PDF generation
 */

export interface ParsedBlock {
    type: string
    content: string
    box: [number, number, number, number] // [x1, y1, x2, y2]
}

export interface ImageDims {
    w: number
    h: number
}

export interface OCRBox {
    label: string
    box: [number, number, number, number]
}

/**
 * Parse OCR raw_text with special tags into structured blocks.
 * Uses the boxes array for accurate coordinates when available.
 * 
 * Format: <|ref|>TYPE<|/ref|><|det|>[[x1,y1,x2,y2]]<|/det|>CONTENT
 * 
 * @param rawText The raw_text string from OCR result
 * @param imageDims Image dimensions for coordinate normalization
 * @param boxes Optional boxes array with accurate coordinates
 * @returns Array of parsed blocks with type, content, and box coordinates
 */
export function parseRawText(rawText: string, imageDims: ImageDims, boxes?: OCRBox[]): ParsedBlock[] {
    const parsedBlocks: ParsedBlock[] = []
    const usedBoxIndices = new Set<number>()

    if (!rawText) return parsedBlocks

    // Regex to capture Ref, Det, and Content
    // <|ref|>TYPE<|/ref|><|det|>[[x,y,x,y]]<|/det|>CONTENT
    const regex = /<\|ref\|>(.*?)<\|\/ref\|><\|det\|>\[\[(.*?)\]\]<\|\/det\|>([\s\S]*?)(?=(?:<\|ref\|>)|$)/g

    let match
    while ((match = regex.exec(rawText)) !== null) {
        const block = processMatch(match, imageDims, boxes, usedBoxIndices)
        if (block) {
            parsedBlocks.push(block)
        }
    }

    return parsedBlocks
}

/**
 * Process a single regex match and return a ParsedBlock or null
 */
function processMatch(
    match: RegExpExecArray,
    imageDims: ImageDims,
    boxes: OCRBox[] | undefined,
    usedBoxIndices: Set<number>
): ParsedBlock | null {
    const typeMatch = match[1]
    const coordsStr = match[2]
    const rawContent = match[3]

    // Skip if any capture group is undefined
    if (!typeMatch || !coordsStr || rawContent === undefined) return null

    const type = typeMatch.trim().toLowerCase()
    const rawCoords = coordsStr.split(',').map(Number)

    if (rawCoords.length !== 4) return null

    const content = rawContent.trim()
    const finalBox = resolveBoxCoordinates(rawCoords, imageDims, boxes, usedBoxIndices)

    return { type, content, box: finalBox }
}

/**
 * Resolve the final box coordinates by trying to match with boxes array,
 * falling back to normalized coordinates.
 */
function resolveBoxCoordinates(
    rawCoords: number[],
    imageDims: ImageDims,
    boxes: OCRBox[] | undefined,
    usedBoxIndices: Set<number>
): [number, number, number, number] {
    if (boxes && boxes.length > 0) {
        const matchingBoxIndex = findMatchingBoxIndex(rawCoords, boxes, imageDims, usedBoxIndices)
        const matchedBox = matchingBoxIndex !== -1 ? boxes[matchingBoxIndex] : undefined
        if (matchedBox) {
            usedBoxIndices.add(matchingBoxIndex)
            return matchedBox.box
        }
    }

    // Fallback to normalized coords
    const normalized = normalizeBox(rawCoords, imageDims)
    return normalized as [number, number, number, number]
}

/**
 * Find matching box index by comparing normalized coordinates with boxes array.
 * Uses a tolerance-based approach to match coordinates.
 */
export function findMatchingBoxIndex(
    rawCoords: number[],
    boxes: OCRBox[],
    imageDims: ImageDims | undefined,
    usedBoxIndices: Set<number> = new Set()
): number {
    if (!imageDims || boxes.length === 0 || rawCoords.length !== 4) return -1

    // Normalize the raw coords to actual image dimensions for comparison
    // Normalize the raw coords to actual image dimensions for comparison
    const dims = imageDims!
    const normalizedCoords = [
        (rawCoords[0]! / 1000) * dims.w,
        (rawCoords[1]! / 1000) * dims.h,
        (rawCoords[2]! / 1000) * dims.w,
        (rawCoords[3]! / 1000) * dims.h,
    ]

    // Use a percentage-based tolerance (5% of image dimension)
    const toleranceX = imageDims.w * 0.05
    const toleranceY = imageDims.h * 0.05

    for (let i = 0; i < boxes.length; i++) {
        // Skip already matched boxes
        if (usedBoxIndices.has(i)) continue

        const currentBox = boxes[i]
        if (!currentBox) continue

        if (isBoxMatching(currentBox.box, normalizedCoords, toleranceX, toleranceY)) {
            return i
        }
    }

    return -1
}

function isBoxMatching(
    box1: [number, number, number, number],
    box2: number[],
    toleranceX: number,
    toleranceY: number
): boolean {
    return (
        Math.abs(box1[0] - (box2[0] || 0)) <= toleranceX &&
        Math.abs(box1[1] - (box2[1] || 0)) <= toleranceY &&
        Math.abs(box1[2] - (box2[2] || 0)) <= toleranceX &&
        Math.abs(box1[3] - (box2[3] || 0)) <= toleranceY
    )
}

/**
 * Normalize box coordinates from 0-1000 scale to actual image dimensions if needed.
 * 
 * @param coords Raw coordinates [x1, y1, x2, y2]
 * @param dims Image dimensions
 * @returns Normalized coordinates
 */
export function normalizeBox(coords: number[], dims: ImageDims | undefined): number[] {
    if (!dims || coords.length < 4) return [0, 0, 0, 0]

    // If max coordinate <= 1000 and the image dimension is > 1000, 
    // assume it is 1000-normalized.
    const maxCoord = Math.max(...coords)
    if (maxCoord <= 1000 && (dims.w > 1000 || dims.h > 1000)) {
        return [
            ((coords[0] || 0) / 1000) * dims.w,
            ((coords[1] || 0) / 1000) * dims.h,
            ((coords[2] || 0) / 1000) * dims.w,
            ((coords[3] || 0) / 1000) * dims.h,
        ]
    }
    return coords
}

