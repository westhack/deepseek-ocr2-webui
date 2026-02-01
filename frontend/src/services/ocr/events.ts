import mitt from 'mitt'
import type { OCRResult } from './index'

type OCREvents = {
    // OCR 阶段
    'ocr:queued': { pageId: string }
    'ocr:start': { pageId: string }
    'ocr:success': { pageId: string; result: OCRResult }
    'ocr:error': { pageId: string; error: Error }

    // 文档生成阶段
    'doc:gen:queued': { pageId: string }
    'doc:gen:start': { pageId: string; type: 'markdown' | 'pdf' | 'html' | 'docx' | 'all' }
    'doc:gen:success': { pageId: string; type: string; url?: string }
    'doc:gen:error': { pageId: string; type: string; error: Error }
}

export const ocrEvents = mitt<OCREvents>()

export type { OCREvents }
