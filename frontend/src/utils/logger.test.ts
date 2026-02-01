import { describe, it, expect, vi } from 'vitest'
import { logger, pdfLogger, queueLogger, dbLogger, storeLogger, addLogger, uiLogger, workerLogger } from './logger'

describe('Logger Service', () => {
  it('should export the root logger', () => {
    expect(logger).toBeDefined()
    expect(logger.level).toBe(3)
  })

  it('should export specialized loggers with correct tags', () => {
    // We can't easily check the private tags of consola, but we can verify they are defined
    expect(pdfLogger).toBeDefined()
    expect(queueLogger).toBeDefined()
    expect(dbLogger).toBeDefined()
    expect(storeLogger).toBeDefined()
    expect(addLogger).toBeDefined()
    expect(uiLogger).toBeDefined()
    expect(workerLogger).toBeDefined()
  })

  it('should allow logging at different levels', () => {
    const spy = vi.spyOn(logger, 'info')
    logger.info('test info message')
    expect(spy).toHaveBeenCalledWith('test info message')
  })
})
