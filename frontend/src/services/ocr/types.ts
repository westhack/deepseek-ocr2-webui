export interface OCRBox {
    label: 'title' | 'image' | 'table' | 'text' | string
    box: [number, number, number, number] // [x1, y1, x2, y2]
}

export interface OCRResult {
    success: boolean
    text: string
    raw_text: string
    boxes: OCRBox[]
    image_dims: { w: number; h: number }
    prompt_type: string
}

export type OCRPromptType = 'document' | 'ocr' | 'free' | 'figure' | 'describe' | 'find' | 'freeform'

export interface OCROptions {
    prompt_type?: OCRPromptType
    custom_prompt?: string // used for freeform
    find_term?: string     // used for find
    grounding?: boolean    // required for all
    signal?: AbortSignal
}

export interface OCRProvider {
    name: string
    process(imageData: Blob | string, options?: OCROptions): Promise<OCRResult>
}

/**
 * Custom error thrown when the server OCR queue is full.
 */
export class QueueFullError extends Error {
    constructor(message: string = 'Server OCR queue is full') {
        super(message)
        this.name = 'QueueFullError'
        Object.setPrototypeOf(this, QueueFullError.prototype)
    }
}
