import * as pdfjsLib from 'pdfjs-dist'
import { CMAP_URL, CMAP_PACKED, STANDARD_FONT_DATA_URL } from '../services/pdf/config'
import { workerLogger } from '@/utils/logger'

// Configure worker
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface PDFRenderMessage {
  type: 'render'
  payload: {
    pdfData: ArrayBuffer
    pageId: string
    pageNumber: number
    scale?: number
    imageFormat?: 'png' | 'jpeg'
    quality?: number
    fallbackFontFamily?: string
  }
}

interface PDFRenderResult {
  pageId: string
  imageBlob: Blob // Directly return binary data
  width: number
  height: number
  pageNumber: number
  fileSize: number
}

interface PDFErrorMessage {
  pageId: string
  error: string
}

interface WorkerStartedMessage {
  type: 'started'
  payload: {
    pageId: string
    pageNumber: number
  }
}

type WorkerMessage = PDFRenderMessage
type WorkerResponse = PDFRenderResult | WorkerStartedMessage | { type: 'error'; payload: PDFErrorMessage }

// Polyfill global document for PDF.js internals that expect it even in workers
/* v8 ignore start */
if (typeof self !== 'undefined' && !self.document) {
  const mockElement = () => ({
    style: {},
    remove: () => { },
    appendChild: (child: unknown) => child,
    removeChild: (child: unknown) => child,
    setAttribute: () => { },
    getAttribute: () => null,
    textContent: '',
  });

  (self as unknown as { document: unknown }).document = {
    createElement: (tagName: string) => {
      if (tagName === 'canvas') {
        return new OffscreenCanvas(1, 1);
      }
      return mockElement();
    },
    documentElement: mockElement(),
    head: mockElement(),
    body: mockElement(),
    getElementsByTagName: () => [],
    createEvent: () => ({
      initEvent: () => { },
    }),
  };
}
/* v8 ignore stop */

// Custom CanvasFactory for Web Worker using OffscreenCanvas
interface CanvasAndContext {
  canvas: OffscreenCanvas | null
  context: OffscreenCanvasRenderingContext2D | null
}

class OffscreenCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
    return {
      canvas,
      context: canvas.getContext('2d'),
    };
  }

  reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = Math.max(1, width);
      canvasAndContext.canvas.height = Math.max(1, height);
    }
  }

  destroy(canvasAndContext: CanvasAndContext): void {
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
    }
    canvasAndContext.context = null;
  }
}

// Worker implementation
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data

  if (type !== 'render') {
    return
  }

  try {
    const result = await renderPage(payload)
    self.postMessage(result)
  } catch (error) {
    workerLogger.error('PDF rendering error:', error)

    const errorPageId = payload?.pageId || 'unknown'
    const errorResponse: WorkerResponse = {
      type: 'error',
      payload: {
        pageId: errorPageId,
        error: error instanceof Error ? error.message : 'Unknown rendering error'
      }
    }
    self.postMessage(errorResponse)
  }
})

/**
 * Main rendering logic for a single PDF page
 */
async function renderPage(payload: PDFRenderMessage['payload']): Promise<PDFRenderResult> {
  const {
    pdfData,
    pageId,
    pageNumber,
    scale = 2.5,
    imageFormat = 'png',
    quality = 0.95,
    fallbackFontFamily
  } = payload

  validateRenderInputs(payload)

  // Notify main thread that rendering is starting
  self.postMessage({
    type: 'started',
    payload: {
      pageId,
      pageNumber
    }
  })

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfData),
    cMapUrl: CMAP_URL,
    cMapPacked: CMAP_PACKED,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
    disableFontFace: true,
    fontExtraProperties: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvasFactory: new OffscreenCanvasFactory() as any,
    verbosity: 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  const pdfDocument = await loadingTask.promise

  try {
    const page = await pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale })

    // Create and configure canvas
    const canvas = new OffscreenCanvas(viewport.width, viewport.height)
    const context = configureRenderContext(canvas, scale, fallbackFontFamily)

    const renderContext = createRenderContext(context, viewport)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (page.render(renderContext as any).promise)
    } catch (renderError) {
      workerLogger.warn('Enhanced rendering failed, falling back to standard rendering:', renderError)
      await (page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport: viewport,
        intent: 'print',
         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvasFactory: new OffscreenCanvasFactory() as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).promise)
    }

    const mimeType = imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
    const blob = await canvas.convertToBlob({
      type: mimeType,
      quality: imageFormat === 'jpeg' ? quality : undefined
    })

    try {
      page.cleanup()
    } catch (e) {
      workerLogger.warn('Page cleanup failed:', e)
    }

    return {
      pageId,
      imageBlob: blob,
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      fileSize: blob.size
    }
  } finally {
    await pdfDocument.destroy().catch(() => { })
  }
}

function validateRenderInputs(payload: PDFRenderMessage['payload']): void {
  if (!payload.pageId) throw new Error('pageId is required')
  if (!payload.pageNumber || payload.pageNumber < 1) {
    throw new Error(`Invalid pageNumber: ${payload.pageNumber}`)
  }
  if (!payload.pdfData || payload.pdfData.byteLength === 0) {
    throw new Error('pdfData is empty or invalid')
  }
}

function configureRenderContext(canvas: OffscreenCanvas, scale: number, fallbackFontFamily?: string) {
  const context = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false
  }) as unknown as OffscreenCanvasRenderingContext2D

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  if (fallbackFontFamily) {
    context.font = `${16 * scale}px ${fallbackFontFamily}`
  }
  return context
}

function createRenderContext(
  context: OffscreenCanvasRenderingContext2D,
  viewport: pdfjsLib.PageViewport
) {
  return {
    canvasContext: context,
    viewport: viewport,
    intent: 'print' as const,
    renderInteractiveForms: true,
    canvasFactory: new OffscreenCanvasFactory()
  }
}