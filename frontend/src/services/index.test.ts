import { describe, it, expect } from 'vitest'
import * as services from './index'

describe('services entry point', () => {
  it('should export all required services and types', () => {
    expect(services.pdfService).toBeDefined()
    expect(services.ocrService).toBeDefined()
    expect(services.exportService).toBeDefined()
    expect(services.PDFService).toBeDefined()
    expect(services.OCRService).toBeDefined()
    expect(services.ExportService).toBeDefined()
  })
})
