import { describe, it, expect } from 'vitest'
import { pdfEvents } from '@/services/pdf/events'

describe('PDF Events', () => {
  it('should export a mitt instance', () => {
    expect(pdfEvents).toBeDefined()
    expect(typeof pdfEvents.emit).toBe('function')
    expect(typeof pdfEvents.on).toBe('function')
    expect(typeof pdfEvents.off).toBe('function')
  })

  it('should allow emitting and listening to events', () => {
    let received = false
    const handler = () => { received = true }
    
    // We need to use 'as unknown' because the strict typing of mitt might complain 
    // about arbitrary events if not in the type definition, 
    // but here we are testing the mechanism itself.
    // However, better to use a valid event from the definition.
    
    pdfEvents.on('pdf:page:queued', handler)
    pdfEvents.emit('pdf:page:queued', { pageId: 'test-id' })
    
    expect(received).toBe(true)
    pdfEvents.off('pdf:page:queued', handler)
  })
})
