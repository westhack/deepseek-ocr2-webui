import { describe, it, expect, vi, beforeEach } from 'vitest'
import { queueManager } from './index'
import { queueLogger } from '@/utils/logger'

// Mock health store
const mockHealthStore = {
    isHealthy: true
}
vi.mock('@/stores/health', () => ({
    useHealthStore: () => mockHealthStore
}))

describe('QueueManager', () => {
    beforeEach(() => {
        queueManager.clear()
            // Using real timers to avoid p-queue/fake-timer issues
            ; (globalThis as any).__HEALTH_CHECK_INTERVAL__ = 10
    })

    it('should process OCR tasks', async () => {
        const taskFn = vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })

        await queueManager.addOCRTask('page1', taskFn)

        // Wait a bit for it to start
        await new Promise(r => setTimeout(r, 10))
        expect(queueManager.getStats().ocr.pending).toBe(1)

        // Wait for it to finish (status change)
        await vi.waitFor(() => {
            if (queueManager.getStats().ocr.pending !== 0) throw new Error('Not finished')
        })

        expect(taskFn).toHaveBeenCalled()
    })

    it('should support concurrency limit', async () => {
        // OCR queue has concurrency 1 (updated)
        const slowTask = async () => new Promise<void>(resolve => setTimeout(resolve, 100))

        await queueManager.addOCRTask('p1', slowTask)
        await queueManager.addOCRTask('p2', slowTask)
        await queueManager.addOCRTask('p3', slowTask)

        // Wait for start
        await new Promise(r => setTimeout(r, 10))

        // Only 1 task should be running (pending count in p-queue means running + waiting)
        // Wait, in our getStats implementation:
        // pending: this.ocrQueue.pending (running tasks)
        // size: this.ocrQueue.size (running + waiting)
        expect(queueManager.getStats().ocr.pending).toBe(1)
        expect(queueManager.getStats().ocr.size).toBe(3)

        await vi.waitFor(() => {
            if (queueManager.getStats().ocr.pending !== 0) throw new Error('Not finished')
        }, { timeout: 1000 })
    })

    it('should cancel pending task', async () => {
        const taskFn = vi.fn()

        // Fill the queue first (concurrency 1, so p1 starts p2 waits)
        await queueManager.addOCRTask('p1', async () => new Promise(resolve => setTimeout(resolve, 50)))

        // Add waiting task
        await queueManager.addOCRTask('p3', taskFn)

        // Cancel p3 before it starts
        queueManager.cancel('p3')

        await vi.waitFor(() => {
            if (queueManager.getStats().ocr.pending !== 0) throw new Error('Not finished')
        })

        expect(taskFn).not.toHaveBeenCalled()
    })

    it('should abort running task', async () => {
        const abortFn = vi.fn()

        await queueManager.addOCRTask('p1', async (signal) => {
            signal.addEventListener('abort', abortFn)
            // Wait long enough to be aborted
            await new Promise(resolve => setTimeout(resolve, 200))
        })

        await new Promise(r => setTimeout(r, 50))
        expect(queueManager.getStats().ocr.pending).toBe(1)

        queueManager.cancel('p1')

        await vi.waitFor(() => {
            expect(abortFn).toHaveBeenCalled()
        })
    })

    it('should auto-cancel previous task for same pageId', async () => {
        const abortFn = vi.fn()
        const task1 = async (signal: AbortSignal) => {
            signal.addEventListener('abort', abortFn)
            await new Promise(resolve => setTimeout(resolve, 100))
        }

        await queueManager.addOCRTask('p1', task1)

        await new Promise(r => setTimeout(r, 20))

        // Add another task for p1 immediately
        await queueManager.addOCRTask('p1', async () => { })

        // Verify task1 was aborted
        await vi.waitFor(() => {
            expect(abortFn).toHaveBeenCalled()
        })
    })

    it('should process Generation tasks', async () => {
        const taskFn = vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })

        await queueManager.addGenerationTask('gen1', taskFn)

        // Wait for task to finish
        await vi.waitFor(() => {
            if (taskFn.mock.calls.length === 0) throw new Error('Task not called yet')
        }, { timeout: 500 })

        expect(taskFn).toHaveBeenCalled()
    })

    it('should cancel generation task', async () => {
        const genFn = vi.fn()

        // Fill the queue to its concurrency limit (1 for generation now too)
        await queueManager.addGenerationTask('g1', async () => new Promise(r => setTimeout(r, 100)))

        // Add a third task that should wait in queue
        await queueManager.addGenerationTask('g3', genFn)

        // Cancel g3 before it starts
        queueManager.cancel('g3')

        await vi.waitFor(() => {
            if (queueManager.getStats().generation.pending !== 0) throw new Error('Not finished')
        })

        expect(genFn).not.toHaveBeenCalled()
    })

    it('should handle errors in OCR task', async () => {
        const consoleSpy = vi.spyOn(queueLogger, 'error')

        await queueManager.addOCRTask('ocr_err', async () => {
            throw new Error('OCR failed')
        })

        await vi.waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('OCR task for page ocr_err failed'), expect.any(Error))
        })
    })

    it('should handle errors in generation task', async () => {
        const error = new Error('Gen Fail')
        const consoleSpy = vi.spyOn(queueLogger, 'error').mockImplementation(() => { })

        await queueManager.addGenerationTask('g-err', async () => {
            throw error
        })

        await vi.waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Gen Task for page g-err failed'), expect.any(Error))
        })

        consoleSpy.mockRestore()
    })

    it('should cancel both running and pending tasks (mixed state)', async () => {
        const runningTaskAborted = vi.fn()
        const pending1Executed = vi.fn()
        const pending2Executed = vi.fn()

        // Add one running task (concurrency is 1)
        await queueManager.addOCRTask('running1', async (signal) => {
            signal.addEventListener('abort', runningTaskAborted)
            await new Promise(resolve => setTimeout(resolve, 200))
        })

        // Add two pending tasks (will wait in queue)
        await queueManager.addOCRTask('pending1', pending1Executed)
        await queueManager.addOCRTask('pending2', pending2Executed)

        // Wait for running tasks to start
        await new Promise(r => setTimeout(r, 50))
        expect(queueManager.getStats().ocr.pending).toBe(1)

        // Cancel both running1 and pending1
        queueManager.cancelOCR('running1')
        queueManager.cancelOCR('pending1')

        // Wait for all tasks to finish
        await vi.waitFor(() => {
            if (queueManager.getStats().ocr.pending !== 0) throw new Error('Not finished')
        }, { timeout: 1000 })

        // Verify: running task was aborted, pending1 was not executed, pending2 was executed
        expect(runningTaskAborted).toHaveBeenCalled()
        expect(pending1Executed).not.toHaveBeenCalled()
        expect(pending2Executed).toHaveBeenCalled()
    })

    it('should wait for healthy service', async () => {
        // Mock unhealthy
        mockHealthStore.isHealthy = false

        const taskFn = vi.fn()

        // Add task
        queueManager.addOCRTask('p-health', taskFn)

        // Wait a bit, task should not have started
        await new Promise(r => setTimeout(r, 50))
        expect(taskFn).not.toHaveBeenCalled()

        // Make healthy
        mockHealthStore.isHealthy = true

        // Should finish now
        await vi.waitFor(() => {
            expect(taskFn).toHaveBeenCalled()
        }, { timeout: 1000 })
    })
})
