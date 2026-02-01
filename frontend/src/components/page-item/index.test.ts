import { describe, it, expect } from 'vitest'
import { PageItem } from './index'
import PageItemComponent from './PageItem.vue'

describe('page-item index', () => {
  it('should export PageItem component', () => {
    expect(PageItem).toBe(PageItemComponent)
  })
})
