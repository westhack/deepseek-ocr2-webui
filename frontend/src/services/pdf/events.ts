import mitt from 'mitt'

type PDFEvents = {
  'pdf:page:queued': { pageId: string }
  'pdf:page:rendering': { pageId: string }
  'pdf:page:done': { pageId: string; thumbnailData?: string; width: number; height: number; fileSize: number }
  'pdf:page:error': { pageId: string; error: string }
  'pdf:progress': { done: number; total: number }
  'pdf:log': { pageId: string; message: string; level: 'info' | 'warning' | 'error' }
  'pdf:processing-start': { file: File; totalPages: number }
  'pdf:pages:queued': { file: File; totalPages: number }
  'pdf:processing-complete': { file: File; totalPages: number }
  'pdf:processing-error': { file: File; error: string }
}

// Create and export event emitter
export const pdfEvents = mitt<PDFEvents>()

// Export event type for TypeScript usage
export type { PDFEvents }