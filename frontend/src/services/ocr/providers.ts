import { config } from '@/config'
import { getClientId } from '@/services/clientId'
import { ocrLogger } from '@/utils/logger'
import { QueueFullError } from './types'
import type { OCRProvider, OCRResult, OCROptions } from './types'

export class DeepSeekOCRProvider implements OCRProvider {
    name = 'deepseek'

    private async createFormData(imageData: Blob | string, options?: OCROptions): Promise<FormData> {
        const formData = new FormData()

        // Handle both Blob (from file/canvas) and base64 string (legacy/other sources)
        if (imageData instanceof Blob) {
            formData.append('file', imageData, 'image.jpg')
        } else {
            const blob = await (await fetch(imageData)).blob()
            formData.append('file', blob, 'image.jpg')
        }

        const promptType = options?.prompt_type || 'document'
        formData.append('prompt_type', promptType)

        if (options?.custom_prompt && promptType === 'freeform') {
            formData.append('custom_prompt', options.custom_prompt)
        }

        if (options?.find_term && promptType === 'find') {
            formData.append('find_term', options.find_term)
        }

        const grounding = this.resolveGrounding(options, promptType)
        formData.append('grounding', String(grounding))

        return formData
    }

    private resolveGrounding(options: OCROptions | undefined, promptType: string): boolean {
        if (options?.grounding !== undefined) return options.grounding
        return ['document', 'ocr', 'find'].includes(promptType)
    }

    private async handleRateLimitError(response: Response): Promise<never> {
        const errorDetail = await response.json().catch(() => ({}))
        const detailMsg = errorDetail.detail || ''

        if (detailMsg.includes('queue full')) {
            throw new QueueFullError('Queue Full: Server queue just filled up, please try again later.')
        } else if (detailMsg.includes('Client at max')) {
            throw new Error('Client Limit: You already have a task in progress.')
        } else if (detailMsg.includes('IP at max')) {
            throw new Error('IP Limit: Too many requests from your network.')
        } else {
            throw new Error(`Rate Limit Exceeded: ${detailMsg}`)
        }
    }

    private handleProcessError(error: unknown, endpoint: string, options?: OCROptions): never {
        if (error instanceof Error && error.name === 'AbortError') {
            throw error
        }

        // Don't log QueueFullError as it will be handled by the service retry logic
        if (error instanceof QueueFullError) {
            throw error
        }

        ocrLogger.error('[DeepSeekOCRProvider] Process failed:', {
            endpoint,
            error,
            options
        })

        if (error instanceof Error) {
            throw error
        }
        throw new Error('Unknown error during OCR processing')
    }

    async process(imageData: Blob | string, options?: OCROptions): Promise<OCRResult> {
        const formData = await this.createFormData(imageData, options)

        try {
            // Construct the full URL by appending the specific endpoint
            const url = `${config.apiBaseUrl}/ocr`
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                signal: options?.signal,
                headers: {
                    'X-Client-ID': getClientId()
                }
            })

            if (!response.ok) {
                if (response.status === 429) {
                    await this.handleRateLimitError(response)
                }
                throw new Error(`OCR API Error: ${response.status} ${response.statusText}`)
            }

            const result = await response.json()

            // Map raw API response to OCRResult
            // API currently matches the interface exactly, but explicit mapping is safer
            return {
                success: result.success,
                text: result.text,
                raw_text: result.raw_text,
                boxes: result.boxes || [],
                image_dims: result.image_dims || { w: 0, h: 0 },
                prompt_type: result.prompt_type
            }
        } catch (error) {
            return this.handleProcessError(error, `${config.apiBaseUrl}/ocr`, options)
        }
    }
}
