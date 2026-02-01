
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Mock 'pdfjs-dist' and its worker URL BEFORE importing the worker
vi.mock('pdfjs-dist', () => {
  return {
    version: '4.0.0',
    GlobalWorkerOptions: {
      workerSrc: '',
    },
    getDocument: vi.fn(),
  };
});

// Mock the worker URL import
vi.mock('pdfjs-dist/legacy/build/pdf.worker.mjs?url', () => {
  return {
    default: 'mock-worker-url',
  };
});

// Mock config
vi.mock('@/services/pdf/config', () => ({
  CMAP_URL: '/cmaps/',
  CMAP_PACKED: true,
  STANDARD_FONT_DATA_URL: '/standard_fonts/',
}));

// Mock logger
vi.mock('@/utils/logger', () => ({
  workerLogger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
  addLogger: {
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

// 2. Setup Global Mocks for Worker Environment
let messageHandler: ((event: MessageEvent) => Promise<void>) | null = null;

// Mock self.addEventListener and self.postMessage
const postMessageMock = vi.fn();
const addEventListenerMock = vi.fn((type, handler) => {
  if (type === 'message') {
    messageHandler = handler;
  }
});

// Assign to globalThis (which acts as 'self' in this context)
(globalThis as any).self = globalThis;
(globalThis as any).addEventListener = addEventListenerMock;
(globalThis as any).postMessage = postMessageMock;

// Mock OffscreenCanvas
class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };
  }
  convertToBlob({ type }: { type: string }) {
    return Promise.resolve(new Blob(['mock-image-data'], { type }));
  }
}
(globalThis as any).OffscreenCanvas = MockOffscreenCanvas;


describe('pdfRender.worker', () => {
  let pdfjsLib: typeof import("pdfjs-dist");

  beforeEach(async () => {
    vi.clearAllMocks();
    messageHandler = null;

    pdfjsLib = await import('pdfjs-dist');

    vi.resetModules();

    (globalThis as any).addEventListener = addEventListenerMock;
    (globalThis as any).postMessage = postMessageMock;
    (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;

    await import('@/workers/pdfRender.worker');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createEvent = (data: unknown) => {
    return { data } as MessageEvent;
  };

  it('should register a message listener', () => {
    expect(addEventListenerMock).toHaveBeenCalledWith('message', expect.any(Function));
    expect(messageHandler).toBeInstanceOf(Function);
  });

  it('should ignore non-render messages', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    await messageHandler(createEvent({ type: 'ping' }));

    expect(pdfjsLib.getDocument).not.toHaveBeenCalled();
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it('should handle missing pageId error', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const payload = {
      // pageId missing
      pageNumber: 1,
      pdfData: new ArrayBuffer(10)
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        pageId: 'unknown',
        error: 'pageId is required'
      }
    });
  });

  it('should handle invalid pageNumber error', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const payload = {
      pageId: 'p1',
      pageNumber: 0, // Invalid
      pdfData: new ArrayBuffer(10)
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      payload: {
        pageId: 'p1',
        error: expect.stringContaining('Invalid pageNumber')
      }
    }));
  });

  it('should handle empty pdfData error', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const payload = {
      pageId: 'p1',
      pageNumber: 1,
      pdfData: new ArrayBuffer(0) // Empty
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      payload: {
        pageId: 'p1',
        error: expect.stringContaining('pdfData is empty')
      }
    }));
  });

  it('should successfully render a PDF page', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    // Setup PDF.js mocks
    const mockPage = {
      getViewport: vi.fn().mockReturnValue({ width: 100, height: 200 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      cleanup: vi.fn(),
    };
    const mockPdfDocument = {
      getPage: vi.fn().mockResolvedValue(mockPage),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    const loadingTask = {
      promise: Promise.resolve(mockPdfDocument),
    };
    (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockReturnValue(loadingTask);

    const payload = {
      pageId: 'page-123',
      pageNumber: 1,
      pdfData: new ArrayBuffer(100),
      scale: 2.0,
      imageFormat: 'png' as const,
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    // Verify two messages sent: started + result
    expect(postMessageMock).toHaveBeenCalledTimes(2);

    // Verify first message is 'started'
    expect(postMessageMock).toHaveBeenNthCalledWith(1, {
      type: 'started',
      payload: {
        pageId: 'page-123',
        pageNumber: 1
      }
    });

    // Verify second message is result
    expect(postMessageMock).toHaveBeenNthCalledWith(2, {
      pageId: 'page-123',
      imageBlob: expect.any(Blob),
      pageNumber: 1,
      width: 100,
      height: 200,
      fileSize: expect.any(Number)
    });

    // Verify PDF loading
    expect(pdfjsLib.getDocument).toHaveBeenCalledWith(expect.objectContaining({
      cMapUrl: '/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/standard_fonts/',
      useSystemFonts: true,
    }));
    expect(mockPdfDocument.getPage).toHaveBeenCalledWith(1);
    expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 2.0 });

    // Verify Render
    expect(mockPage.render).toHaveBeenCalled();

    // Verify Cleanup
    expect(mockPage.cleanup).toHaveBeenCalled();
    expect(mockPdfDocument.destroy).toHaveBeenCalled();
  });

  it('should correctly implement OffscreenCanvasFactory', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const mockPage = {
      getViewport: vi.fn().mockReturnValue({ width: 100, height: 100 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      cleanup: vi.fn(),
    };
    (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ promise: Promise.resolve({ getPage: () => mockPage, destroy: vi.fn().mockResolvedValue(undefined) }) });

    // Trigger execution
    await messageHandler(createEvent({
      type: 'render',
      payload: {
        pageId: 'p1',
        pageNumber: 1,
        pdfData: new ArrayBuffer(10),
      }
    }));

    // Verify started message was sent
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'started',
        payload: { pageId: 'p1', pageNumber: 1 }
      })
    );

    // Extract factory from getDocument call
    const params = (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const factory = params!.canvasFactory;

    expect(factory).toBeDefined();

    // Test create
    const obj = factory.create(100, 50);
    expect(obj.canvas).toBeInstanceOf(MockOffscreenCanvas);
    expect(obj.canvas.width).toBe(100);
    expect(obj.canvas.height).toBe(50);
    expect(obj.context).toBeDefined();

    // Test reset
    factory.reset(obj, 200, 150);
    expect(obj.canvas.width).toBe(200);
    expect(obj.canvas.height).toBe(150);

    // Test destroy
    factory.destroy(obj);
    expect(obj.canvas).toBeNull();
    expect(obj.context).toBeNull();

    const emptyObj = { canvas: null, context: null };
    factory.reset(emptyObj, 100, 100);
    factory.destroy(emptyObj);
  });

  it('should swallow errors during cleanup', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const mockPage = {
      getViewport: vi.fn().mockReturnValue({ width: 100, height: 100 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      cleanup: vi.fn().mockImplementation(() => { throw new Error('Cleanup error'); }),
    };
    const mockPdfDocument = {
      getPage: vi.fn().mockResolvedValue(mockPage),
      destroy: vi.fn().mockRejectedValue(new Error('Destroy error')),
    };
    (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ promise: Promise.resolve(mockPdfDocument) });

    await messageHandler(createEvent({
      type: 'render',
      payload: {
        pageId: 'p1',
        pageNumber: 1,
        pdfData: new ArrayBuffer(10),
      }
    }));

    // Should send both started and result messages despite cleanup errors
    expect(postMessageMock).toHaveBeenCalledTimes(2);
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'started' })
    );
    expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'p1' }));
  });

  it('should handle non-Error objects thrown', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw 'String error';
    });

    await messageHandler(createEvent({
      type: 'render',
      payload: {
        pageId: 'p1',
        pageNumber: 1,
        pdfData: new ArrayBuffer(10),
      }
    }));

    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        pageId: 'p1',
        error: 'Unknown rendering error'
      }
    });
  });

  it('should use fallback rendering if primary rendering fails', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const mockPage = {
      getViewport: vi.fn().mockReturnValue({ width: 100, height: 100 }),
      render: vi.fn()
        .mockReturnValueOnce({ promise: Promise.reject(new Error('Enhanced render failed')) })
        .mockReturnValueOnce({ promise: Promise.resolve() }),
      cleanup: vi.fn(),
    };
    const mockPdfDocument = {
      getPage: vi.fn().mockResolvedValue(mockPage),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ promise: Promise.resolve(mockPdfDocument) });

    const payload = {
      pageId: 'p1',
      pageNumber: 1,
      pdfData: new ArrayBuffer(10),
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    expect(mockPage.render).toHaveBeenCalledTimes(2);
    const { workerLogger } = await import('@/utils/logger');
    expect(workerLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Enhanced rendering failed'),
      expect.any(Error)
    );
    // Should send started and result messages
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'started' })
    );
    expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      pageId: 'p1'
    }));
  });

  it('should handle unexpected errors during processing', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Critical PDF Error');
    });

    const payload = {
      pageId: 'p1',
      pageNumber: 1,
      pdfData: new ArrayBuffer(10),
    };

    await messageHandler(createEvent({ type: 'render', payload }));

    const { workerLogger } = await import('@/utils/logger');
    expect(workerLogger.error).toHaveBeenCalledWith(
      'PDF rendering error:',
      expect.any(Error)
    );

    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        pageId: 'p1',
        error: 'Critical PDF Error'
      }
    });
  });

  it('should use provided fallbackFontFamily', async () => {
    if (!messageHandler) throw new Error('Message handler not registered');

    const mockPage = {
      getViewport: vi.fn().mockReturnValue({ width: 100, height: 100 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      cleanup: vi.fn(),
    };
    (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ promise: Promise.resolve({ getPage: () => mockPage, destroy: vi.fn().mockResolvedValue(undefined) }) });

    await messageHandler(createEvent({
      type: 'render',
      payload: {
        pageId: 'p1',
        pageNumber: 1,
        pdfData: new ArrayBuffer(10),
        fallbackFontFamily: 'Arial'
      }
    }));

    // Verify started message was sent
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'started' })
    );

    expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'p1' }));
  });

});
