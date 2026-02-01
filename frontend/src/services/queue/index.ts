import PQueue from 'p-queue'
import { queueLogger } from '@/utils/logger'
import { useHealthStore } from '@/stores/health'

export class QueueManager {
    private ocrQueue: PQueue
    private generationQueue: PQueue
    private ocrControllers: Map<string, AbortController>
    private genControllers: Map<string, AbortController>
    private pendingOCRControllers: Map<string, AbortController>
    private pendingGenControllers: Map<string, AbortController>

    constructor() {
        this.ocrQueue = new PQueue({ concurrency: 1 })
        this.generationQueue = new PQueue({ concurrency: 1 })
        this.ocrControllers = new Map()
        this.genControllers = new Map()
        this.pendingOCRControllers = new Map()
        this.pendingGenControllers = new Map()

        this.ocrQueue.on('active', () => {
            queueLogger.debug(`[OCR Queue] Size: ${this.ocrQueue.size}  Pending: ${this.ocrQueue.pending}`)
        })

        this.generationQueue.on('active', () => {
            queueLogger.debug(`[Gen Queue] Size: ${this.generationQueue.size}  Pending: ${this.generationQueue.pending}`)
        })
    }

    /**
     * Add an OCR task to the queue
     * @param pageId The ID of the page to process
     * @param taskFn The task function that accepts an AbortSignal
     */
    async addOCRTask(pageId: string, taskFn: (signal: AbortSignal) => Promise<void>) {
        if (this.ocrControllers.has(pageId) || this.pendingOCRControllers.has(pageId)) {
            queueLogger.info(`[QueueManager] Existing OCR task for ${pageId} found. Canceling.`)
            this.cancelOCR(pageId)
        }

        const controller = new AbortController()
        // Add to pending controllers map first
        this.pendingOCRControllers.set(pageId, controller)

        // We don't await the queue.add here because we want to return immediately after queuing
        this.ocrQueue.add(async () => {
            // Move from pending to active controllers when task starts
            this.pendingOCRControllers.delete(pageId)
            this.ocrControllers.set(pageId, controller)

            if (controller.signal.aborted) {
                queueLogger.info(`[QueueManager] OCR task for page ${pageId} was aborted before start.`)
                this.ocrControllers.delete(pageId)
                return
            }

            // Wait for OCR service to be healthy before executing task
            await this.waitForHealthyService(controller.signal, pageId)

            // Check again if aborted during wait
            if (controller.signal.aborted) {
                queueLogger.info(`[QueueManager] OCR task for page ${pageId} was aborted during health wait.`)
                this.ocrControllers.delete(pageId)
                return
            }

            try {
                await taskFn(controller.signal)
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    queueLogger.info(`[QueueManager] OCR task for page ${pageId} aborted during execution.`)
                } else {
                    queueLogger.error(`[QueueManager] OCR task for page ${pageId} failed:`, error)
                }
            } finally {
                if (this.ocrControllers.get(pageId) === controller) {
                    this.ocrControllers.delete(pageId)
                }
            }
        }).catch(err => {
            queueLogger.error(`[QueueManager] Queue fatal error for page ${pageId}`, err)
        })
    }

    /**
      * Add a generation task (e.g. Markdown, PDF generation)
      */
    async addGenerationTask(pageId: string, taskFn: (signal: AbortSignal) => Promise<void>) {
        if (this.genControllers.has(pageId) || this.pendingGenControllers.has(pageId)) {
            queueLogger.info(`[QueueManager] Existing Gen task for ${pageId} found. Canceling.`)
            this.cancelGeneration(pageId)
        }

        const controller = new AbortController()
        // Add to pending controllers map first
        this.pendingGenControllers.set(pageId, controller)

        this.generationQueue.add(async () => {
            // Move from pending to active controllers when task starts
            this.pendingGenControllers.delete(pageId)
            this.genControllers.set(pageId, controller)

            if (controller.signal.aborted) {
                this.genControllers.delete(pageId)
                return
            }

            try {
                await taskFn(controller.signal)
            } catch (error) {
                if (!(error instanceof Error && error.name === 'AbortError')) {
                    queueLogger.error(`[QueueManager] Gen Task for page ${pageId} failed:`, error)
                }
            } finally {
                if (this.genControllers.get(pageId) === controller) {
                    this.genControllers.delete(pageId)
                }
            }
        }).catch(err => {
            queueLogger.error(`[QueueManager] Gen Queue fatal error for page ${pageId}`, err)
        })
    }

    /**
     * Cancel OCR task for a specific page
     */
    cancelOCR(pageId: string) {
        // 1. Cancel active (running) task
        const activeController = this.ocrControllers.get(pageId)
        if (activeController) {
            activeController.abort()
            this.ocrControllers.delete(pageId)
            queueLogger.info(`[QueueManager] Cancelled OCR task for page ${pageId}`)
            return
        }

        // 2. Cancel pending (waiting) task
        const pendingController = this.pendingOCRControllers.get(pageId)
        if (pendingController) {
            pendingController.abort()
            this.pendingOCRControllers.delete(pageId)
            queueLogger.info(`[QueueManager] Cancelled OCR task for page ${pageId}`)
        }
    }

    /**
     * Cancel Generation task for a specific page
     */
    cancelGeneration(pageId: string) {
        // 1. Cancel active (running) task
        const activeController = this.genControllers.get(pageId)
        if (activeController) {
            activeController.abort()
            this.genControllers.delete(pageId)
            queueLogger.info(`[QueueManager] Cancelled Generation task for page ${pageId}`)
            return
        }

        // 2. Cancel pending (waiting) task
        const pendingController = this.pendingGenControllers.get(pageId)
        if (pendingController) {
            pendingController.abort()
            this.pendingGenControllers.delete(pageId)
            queueLogger.info(`[QueueManager] Cancelled Generation task for page ${pageId}`)
        }
    }

    /**
     * Wait for OCR service to be healthy before proceeding
     * @param signal AbortSignal to cancel the wait
     * @param pageId Page ID for logging
     */
    private async waitForHealthyService(signal: AbortSignal, pageId: string): Promise<void> {
        const healthStore = useHealthStore()

        // If already healthy, return immediately
        if (healthStore.isHealthy) {
            return
        }

        queueLogger.warn(`[QueueManager] OCR service unavailable for page ${pageId}, waiting...`)

        // Wait for service to become healthy, checking every 2 seconds (shorter in tests)
        const checkInterval = (globalThis as unknown as { __HEALTH_CHECK_INTERVAL__?: number }).__HEALTH_CHECK_INTERVAL__ || 2000
        while (!healthStore.isHealthy && !signal.aborted) {
            await new Promise(resolve => setTimeout(resolve, checkInterval))
        }

        if (!signal.aborted) {
            queueLogger.info(`[QueueManager] OCR service recovered, proceeding with page ${pageId}`)
        }
    }

    /**
     * Cancel all tasks for a specific page
     */
    cancel(pageId: string) {
        this.cancelOCR(pageId)
        this.cancelGeneration(pageId)
    }

    /**
     * Clear all queues
     */
    clear() {
        this.ocrQueue.clear()
        this.generationQueue.clear()

        // Cancel all active tasks
        for (const [pageId] of this.ocrControllers) {
            this.cancelOCR(pageId)
        }
        for (const [pageId] of this.genControllers) {
            this.cancelGeneration(pageId)
        }

        // Cancel all pending tasks
        for (const [pageId] of this.pendingOCRControllers) {
            this.cancelOCR(pageId)
        }
        for (const [pageId] of this.pendingGenControllers) {
            this.cancelGeneration(pageId)
        }

        queueLogger.info('[QueueManager] Cleared all queues')
    }

    getStats() {
        return {
            ocr: {
                effectiveSize: this.ocrControllers.size + this.pendingOCRControllers.size,
                activeSize: this.ocrControllers.size,
                pendingSize: this.pendingOCRControllers.size,
                size: this.ocrQueue.size,
                pending: this.ocrQueue.pending,
                isPaused: this.ocrQueue.isPaused
            },
            generation: {
                effectiveSize: this.genControllers.size + this.pendingGenControllers.size,
                activeSize: this.genControllers.size,
                pendingSize: this.pendingGenControllers.size,
                size: this.generationQueue.size,
                pending: this.generationQueue.pending,
                isPaused: this.generationQueue.isPaused
            }
        }
    }
}

export const queueManager = new QueueManager()
