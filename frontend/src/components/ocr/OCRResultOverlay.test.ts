import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OCRResultOverlay from './OCRResultOverlay.vue'

describe('OCRResultOverlay.vue', () => {
    const imageDims = { w: 1000, h: 1000 }

    it('renders nothing when rawText has no boxes', () => {
        const wrapper = mount(OCRResultOverlay, {
            props: { rawText: 'Plain text without det tags', imageDims }
        })
        expect(wrapper.findAll('.ocr-box').length).toBe(0)
    })

    it('renders correct number of boxes from rawText', () => {
        const rawText = '<|ref|>title<|/ref|><|det|>[[100,100,200,200]]<|/det|><|ref|>text<|/ref|><|det|>[[300,300,400,400]]<|/det|>'
        const wrapper = mount(OCRResultOverlay, {
            props: { rawText, imageDims }
        })
        expect(wrapper.findAll('.ocr-box').length).toBe(2)
        expect(wrapper.findAll('.box-label')[0]!.text()).toBe('title')
        expect(wrapper.findAll('.box-label')[1]!.text()).toBe('text')
    })

    it('calculates style correctly using pixel coords and image dimensions', () => {
        // Use coords > 1000 to ensure they are treated as absolute pixels, not normalized
        const rawText = '<|ref|>title<|/ref|><|det|>[[1200, 1100, 1400, 1300]]<|/det|>'
        const dims = { w: 2000, h: 2000 }

        const wrapper = mount(OCRResultOverlay, {
            props: { rawText, imageDims: dims }
        })
        const box = wrapper.find('.ocr-box')
        const style = (box.element as HTMLElement).style

        // left = 1200/2000 * 100 = 60%
        // top = 1100/2000 * 100 = 55%
        // width = (1400-1200)/2000 * 100 = 10%
        // height = (1300-1100)/2000 * 100 = 10%
        // Match values with or without .00 decimals, as some environments simplify them
        expect(style.left).toMatch(/^60(\.00)?%$/)
        expect(style.top).toMatch(/^55(\.00)?%$/)
        expect(style.width).toMatch(/^10(\.00)?%$/)
        expect(style.height).toMatch(/^10(\.00)?%$/)
    })

    it('handles multiple boxes in a single det tag', () => {
        const rawText = '<|ref|>objects<|/ref|><|det|>[[100,100,200,200], [300,300,400,400]]<|/det|>'
        const wrapper = mount(OCRResultOverlay, {
            props: { rawText, imageDims }
        })
        expect(wrapper.findAll('.ocr-box').length).toBe(2)
        expect(wrapper.findAll('.box-label')[0]!.text()).toBe('objects')
        expect(wrapper.findAll('.box-label')[1]!.text()).toBe('objects')
    })

    it('throws error when rawText is missing', () => {
        // Suppress console.error for expected Vue error
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { })

        expect(() => {
            mount(OCRResultOverlay, {
                props: { imageDims }
            } as any)
        }).toThrow('OCRResultOverlay: rawText is required but missing')

        spy.mockRestore()
    })

    it('falls back to 1000x1000 when imageDims is missing', () => {
        const rawText = '<|ref|>text<|/ref|><|det|>[[100,100,200,200]]<|/det|>'
        const wrapper = mount(OCRResultOverlay, {
            props: { rawText }
            // No imageDims - should fallback to 1000x1000 in both parser and style calc
        })
        const box = wrapper.find('.ocr-box')
        const style = (box.element as HTMLElement).style

        // [100, 100, 200, 200] / 1000 * 100 = 10%
        expect(style.left).toMatch(/^10(\.00)?%$/)
    })

    it('assigns correct colors based on labels', () => {
        const rawText = '<|ref|>title<|/ref|><|det|>[[0,0,10,10]]<|/det|><|ref|>text<|/ref|><|det|>[[10,10,20,20]]<|/det|>'
        const wrapper = mount(OCRResultOverlay, {
            props: { rawText, imageDims }
        })
        const boxes = wrapper.findAll('.ocr-box')

        // title -> #dc2626 -> rgb(220, 38, 38)
        expect(boxes[0]!.find('.box-label').attributes('style')).toContain('background-color: rgb(220, 38, 38)')

        // text -> #2563eb -> rgb(37, 99, 235)
        expect(boxes[1]!.find('.box-label').attributes('style')).toContain('background-color: rgb(37, 99, 235)')
    })

    it('handles special labels with standard colors', () => {
        const rawText = '<|ref|>table<|/ref|><|det|>[[0,0,10,10]]<|/det|><|ref|>figure<|/ref|><|det|>[[10,10,20,20]]<|/det|>'
        const wrapper = mount(OCRResultOverlay, {
            props: { rawText, imageDims }
        })
        const labels = wrapper.findAll('.box-label')

        // table -> #16a34a -> rgb(22, 163, 74)
        expect(labels[0]!.attributes('style')).toContain('rgb(22, 163, 74)')
        // figure -> #db2777 -> rgb(219, 39, 119)
        expect(labels[1]!.attributes('style')).toContain('rgb(219, 39, 119)')
    })

    it('generates consistent color for unknown labels', () => {
        const rawText = '<|ref|>UnknownXYZ<|/ref|><|det|>[[0,0,10,10]]<|/det|><|ref|>UnknownXYZ<|/ref|><|det|>[[10,10,20,20]]<|/det|>'
        const wrapper = mount(OCRResultOverlay, {
            props: { rawText, imageDims }
        })
        const labels = wrapper.findAll('.box-label')
        const color1 = labels[0]!.attributes('style')
        const color2 = labels[1]!.attributes('style')

        expect(color1).toBe(color2)
    })

    it('falls back to default color for empty labels', () => {
        const rawText = '<|ref|><|/ref|><|det|>[[0,0,10,10]]<|/det|>'
        const wrapper = mount(OCRResultOverlay, {
            props: { rawText, imageDims }
        })
        const label = wrapper.find('.box-label')
        // Default label 'text' -> #2563eb -> rgb(37, 99, 235)
        expect(label.attributes('style')).toContain('rgb(37, 99, 235)')
    })
})
