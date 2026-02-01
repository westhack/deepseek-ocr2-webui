import { describe, it, expect } from 'vitest'
import { normalizeBox, parseOCRBoxes } from './parser'

describe('OCR Parser Utils', () => {
    describe('normalizeBox', () => {
        it('should normalize coordinates when max is <= 1000 and dims are large', () => {
            const coords = [100, 200, 300, 400]
            const dims = { w: 2000, h: 4000 }
            const result = normalizeBox(coords, dims)
            expect(result).toEqual([200, 800, 600, 1600])
        })

        it('should not normalize when coords seem absolute', () => {
            const coords = [1100, 200, 1300, 400]
            const dims = { w: 2000, h: 4000 }
            const result = normalizeBox(coords, dims)
            expect(result).toEqual([1100, 200, 1300, 400])
        })

        it('should normalize coordinates when width > 1010', () => {
            const result = normalizeBox([100, 100, 200, 200], { w: 1011, h: 1000 })
            expect(result[0]).toBeCloseTo(101.1)
        })

        it('should normalize coordinates when height > 1010', () => {
            const result = normalizeBox([100, 100, 200, 200], { w: 1000, h: 1011 })
            expect(result[1]).toBeCloseTo(101.1)
        })

        it('should normalize coordinates when width < 990', () => {
            const result = normalizeBox([100, 100, 200, 200], { w: 989, h: 1000 })
            expect(result[0]).toBeCloseTo(98.9)
        })

        it('should normalize coordinates when height < 990', () => {
            const result = normalizeBox([100, 100, 200, 200], { w: 1000, h: 989 })
            expect(result[1]).toBeCloseTo(98.9)
        })

        it('should not normalize when dims are close to 1000', () => {
            const coords = [100, 200, 300, 400]
            const dims = { w: 1000, h: 1000 }
            const result = normalizeBox(coords, dims)
            expect(result).toEqual([100, 200, 300, 400])
        })

        it('should not normalize when dims are 995 (close to 1000)', () => {
            const coords = [100, 100, 200, 200]
            const dims = { w: 995, h: 995 }
            expect(normalizeBox(coords, dims)).toEqual([100, 100, 200, 200])
        })

        it('should return zeros for invalid coordinates length', () => {
            expect(normalizeBox([1, 2, 3], { w: 1000, h: 1000 })).toEqual([0, 0, 0, 0])
        })
    })

    describe('parseOCRBoxes', () => {
        it('should parse simple raw_text with one box', () => {
            const rawText = '<|ref|>title<|/ref|><|det|>[[100,200,300,400]]<|/det|>Some Title'
            const dims = { w: 1000, h: 1000 }
            const result = parseOCRBoxes(rawText, dims)
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({
                label: 'title',
                box: [100, 200, 300, 400]
            })
        })

        it('should parse multiple boxes and handle normalization', () => {
            const rawText = '<|ref|>text<|/ref|><|det|>[[0,0,500,500]]<|/det|>First<|ref|>image<|/ref|><|det|>[[500,500,1000,1000]]<|/det|>'
            const dims = { w: 2000, h: 2000 }
            const result = parseOCRBoxes(rawText, dims)
            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                label: 'text',
                box: [0, 0, 1000, 1000]
            })
            expect(result[1]).toEqual({
                label: 'image',
                box: [1000, 1000, 2000, 2000]
            })
        })

        it('should parse multiple boxes from a single det tag', () => {
            const rawText = '<|ref|>all of them<|/ref|><|det|>[[120, 201, 360, 895], [310, 250, 545, 952], [520, 170, 750, 920], [728, 220, 985, 931]]<|/det|>'
            const dims = { w: 1000, h: 1000 }
            const result = parseOCRBoxes(rawText, dims)
            expect(result).toHaveLength(4)
            expect(result[0]).toEqual({ label: 'all of them', box: [120, 201, 360, 895] })
            expect(result[1]).toEqual({ label: 'all of them', box: [310, 250, 545, 952] })
            expect(result[2]).toEqual({ label: 'all of them', box: [520, 170, 750, 920] })
            expect(result[3]).toEqual({ label: 'all of them', box: [728, 220, 985, 931] })
        })

        it('should return empty array for malformed text', () => {
            const rawText = 'just some random text'
            const dims = { w: 1000, h: 1000 }
            const result = parseOCRBoxes(rawText, dims)
            expect(result).toEqual([])
        })

        it('should use default label "text" when label is empty', () => {
            const rawText = '<|ref|><|/ref|><|det|>[[100,100,200,200]]<|/det|>'
            const result = parseOCRBoxes(rawText, { w: 1000, h: 1000 })
            expect(result[0]?.label).toBe('text')
        })

        it('should ignore boxes with invalid coordinate counts', () => {
            const rawText = '<|ref|>test<|/ref|><|det|>[[100,100,200], [1,2,3,4,5]]<|/det|>'
            const result = parseOCRBoxes(rawText, { w: 1000, h: 1000 })
            expect(result).toHaveLength(0)
        })

        it('should ignore det tags with no content', () => {
            const rawText = '<|ref|>test<|/ref|><|det|>[]<|/det|>'
            const result = parseOCRBoxes(rawText, { w: 1000, h: 1000 })
            expect(result).toHaveLength(0)
        })
    })
})
