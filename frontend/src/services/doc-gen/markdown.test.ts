import { describe, it, expect } from 'vitest'
import { MarkdownAssembler } from './markdown'
import type { OCRResult } from '@/services/ocr'
import sample1 from '../../../tests/e2e/samples/sample1.json'
import sample4 from '../../../tests/e2e/samples/sample4.json'
import sample5 from '../../../tests/e2e/samples/sample5.json'

describe('MarkdownAssembler', () => {
    const assembler = new MarkdownAssembler()
    const DIMS_1000 = { w: 1000, h: 1000 }

    it('should return raw_text as fallback if no tags found', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: 'Hello World',
            raw_text: 'Hello World', // No tags
            boxes: [],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())
        expect(result).toBe('Hello World')
    })

    it('should capture interstitial text between tags (Gap Text Bug Fix)', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            // Tag -> Gap Text -> Tag
            raw_text:
                '<|ref|>text<|/ref|><|det|>[[0,0,10,10]]<|/det|>First Block' +
                '\nIMPORTANT GAP TEXT\n' + // This text is NOT part of the regex match for the first block if not careful, or between blocks
                '<|ref|>text<|/ref|><|det|>[[0,20,10,30]]<|/det|>Second Block',
            boxes: [],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())
        expect(result).toContain('First Block')
        expect(result).toContain('IMPORTANT GAP TEXT')
        expect(result).toContain('Second Block')
    })

    it('should render side-by-side elements as a table', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            /* 
               Layout:
               Left block: 0-400 (Text)
               Right block: 500-900 (Image)
               Both Y: 0-100 (Perfect Overlap)
            */
            raw_text:
                '<|ref|>text<|/ref|><|det|>[[0,0,400,100]]<|/det|>Left Text\n' +
                '<|ref|>image<|/ref|><|det|>[[500,0,900,100]]<|/det|>',
            boxes: [
                { box: [0, 0, 400, 100], label: 'text' },
                { box: [500, 0, 900, 100], label: 'image' }
            ],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        const imageMap = new Map<string, string>([['1', 'img-right']]) // index 1 is image

        const result = assembler.assemble(ocrResult, imageMap)

        expect(result).toMatch(/<table\s/)
        expect(result).toContain('Left Text')
        expect(result).toContain('scan2doc-img:img-right')

        expect(result).toContain('width="50%"')
    })

    it('should render sequential elements normally (no table)', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            /*
               Layout:
               Top: 0-100
               Bottom: 200-300
            */
            raw_text:
                '<|ref|>text<|/ref|><|det|>[[0,0,100,100]]<|/det|>Top Line\n' +
                '<|ref|>text<|/ref|><|det|>[[0,200,100,300]]<|/det|>Bottom Line',
            boxes: [
                { box: [0, 0, 100, 100], label: 'text' },
                { box: [0, 200, 100, 300], label: 'text' }
            ],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())

        expect(result).toContain('Top Line')
        expect(result).toContain('Bottom Line')
        expect(result).not.toMatch(/<table\s/)
    })

    it('should clean raw_text by removing noisy ref tags (title, text) from visible content', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            // The REF tag contains "title", the content contains "My Title"
            raw_text: '<|ref|>title<|/ref|><|det|>[[0,0,100,100]]<|/det|>My Title',
            boxes: [{ box: [0, 0, 100, 100], label: 'title' }],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())

        // "title" from the ref tag should not appear in the FINAL markdown output
        // The parser logic uses 'title' as type, but only outputs 'content' ("My Title")
        expect(result).toContain('My Title')
        expect(result).not.toContain('title') // The word "title" shouldn't leak
    })

    it('should throw error if raw_text is missing', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: 'Fallback Text',
            // @ts-expect-error -- testing missing raw_text
            raw_text: null,
            boxes: [],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        expect(() => assembler.assemble(ocrResult, new Map())).toThrow('OCR result missing raw_text')
    })

    it('should handle approximate coordinate matching and normalized coords', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            /*
               Normalized raw_text coords: [100, 100, 200, 200] (0-1000 scale)
               Absolute boxes: [200, 200, 400, 400] (for 2000x2000 image)
            */
            raw_text: '<|ref|>image<|/ref|><|det|>[[100,100,200,200]]<|/det|>',
            boxes: [
                { box: [200, 200, 400, 400], label: 'image' }
            ],
            image_dims: { w: 2000, h: 2000 },
            prompt_type: 'document'
        }
        const imageMap = new Map<string, string>([['0', 'img-real']])

        const result = assembler.assemble(ocrResult, imageMap)

        expect(result).toContain('![Figure 1](scan2doc-img:img-real)')
    })

    describe('Real World Sample Integration', () => {
        it('should correctly process sample1.json structure and preserve ALL content', () => {
            // Setup Image Map based on sample1 boxes
            const imageMap = new Map<string, string>([
                ['6', 'img-6'],
                ['7', 'img-7'],
                ['12', 'img-12'],
                ['13', 'img-13'],
                ['14', 'img-14'],
                ['15', 'img-15']
            ])

            // @ts-expect-error -- importing json as any/unknown
            const result = assembler.assemble(sample1 as OCRResult, imageMap)

            // 1. Verify Noisy Labels are gone
            expect(result).not.toMatch(/^title$/m)
            expect(result).not.toMatch(/^text$/m)

            // 2. Generic Content Verification
            // Extract all meaningful text chunks from raw_text using a simplified Logic
            // We want to ensure everything that LOOKS like content (not tags) exists in Result.

            const rawText = sample1.raw_text || ''
            // Split by tags to get text chunks
            // Regex to split by <|ref|>...<|/det|>
            // We can just replace all tags with a special delimiter, then split
            const cleanedRaw = rawText.replace(/<\|ref\|>.*?<\|\/ref\|><\|det\|>\[\[.*?\]\]<\|\/det\|>/g, '___SPLIT___')
            const expectedChunks = cleanedRaw.split('___SPLIT___')
                .map(s => s.trim())
                .filter(s => s.length > 0)

            // Verify EVERY chunk exists in the output
            for (const chunk of expectedChunks) {
                // We need to be careful about images. 
                // Images in raw_text might be empty string or usually blank after tag.
                // If the chunk is just blank, we filtered it out above.
                // If the chunk contains content, it MUST be in the result.
                expect(result).toContain(chunk)
            }

            // Also sanity check specifically for known fields just in case regex logic above is slightly off vs parser
            expect(result).toContain('OSTE0KJ3000')
            expect(result).toContain('骨密度')

            // 3. Verify Table Layout exists
            const tableIndex = result.search(/<table\s/)
            expect(tableIndex).not.toBe(-1)

            const tablePart = result.substring(tableIndex)
            const imgCount = (tablePart.match(/scan2doc-img:img-/g) || []).length
            expect(imgCount).toBeGreaterThanOrEqual(4)
        })
    })
    it('should normalize LaTeX delimiters from \\(..\\) and \\[..\\] to $..$ and $$..$$', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            // Input has mixed or non-standard delimiters for markdown-it
            raw_text: '<|ref|>text<|/ref|><|det|>[[0,0,100,100]]<|/det|>Inline: \\(E=mc^2\\) and Block: \\[x^2 + y^2 = z^2\\]',
            boxes: [{ box: [0, 0, 100, 100], label: 'text' }],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())

        // Expect normalization
        expect(result).toContain('$E=mc^2$')
        expect(result).toContain('$$x^2 + y^2 = z^2$$')

        // Should NOT contain the old delimiters
        expect(result).not.toContain('\\(E=mc^2\\)')
        expect(result).not.toContain('\\[x^2')
    })

    it('should correctly process sample4.json containing LaTeX formulas', () => {
        // @ts-expect-error -- importing json as any/unknown
        const result = assembler.assemble(sample4 as OCRResult, new Map())

        // The processed output MUST contain $..$ formulas
        expect(result).toContain('$100^{\\circ}\\mathrm{C}$')
        expect(result).toContain('$50^{\\circ}\\mathrm{C}$')

        // Should not contain the original \( ... \)
        expect(result).not.toContain('\\(100^{\\circ}\\mathrm{C}\\)')
    })

    describe('Text-Image Layout (sample5.json scenario)', () => {
        it('should group vertically stacked text blocks in the same column', () => {
            /*
             * Layout: Two text blocks on the left, image on the right
             * Expected: text1 and text2 should be in the same column (stacked)
             *           image should be in a separate column
             */
            const ocrResult: OCRResult = {
                success: true,
                text: '',
                raw_text:
                    '<|ref|>text<|/ref|><|det|>[[0,0,400,100]]<|/det|>First paragraph text\n' +
                    '<|ref|>text<|/ref|><|det|>[[0,150,400,300]]<|/det|>Second paragraph text\n' +
                    '<|ref|>image<|/ref|><|det|>[[500,0,900,250]]<|/det|>',
                boxes: [
                    { box: [0, 0, 400, 100], label: 'text' },
                    { box: [0, 150, 400, 300], label: 'text' },
                    { box: [500, 0, 900, 250], label: 'image' }
                ],
                image_dims: DIMS_1000,
                prompt_type: 'document'
            }
            const imageMap = new Map<string, string>([['2', 'img-right']])

            const result = assembler.assemble(ocrResult, imageMap)

            // Should have table structure
            expect(result).toMatch(/<table\s/)
            expect(result).toContain('</table>')

            // Both texts should be in the output
            expect(result).toContain('First paragraph text')
            expect(result).toContain('Second paragraph text')

            // The two text blocks should be joined with <br/><br/> (same column)
            expect(result).toContain('First paragraph text<br/><br/>Second paragraph text')

            // Image should be present
            expect(result).toContain('scan2doc-img:img-right')

            // Should have exactly 2 <td> elements (two columns)
            const tdCount = (result.match(/<td/g) || []).length
            expect(tdCount).toBe(2)
        })

        it('should bind image_caption with image in the same cell', () => {
            /*
             * Layout: Image followed by caption directly below
             * Expected: caption content should be merged into image cell
             */
            const ocrResult: OCRResult = {
                success: true,
                text: '',
                raw_text:
                    '<|ref|>text<|/ref|><|det|>[[0,0,400,300]]<|/det|>Some text content\n' +
                    '<|ref|>image<|/ref|><|det|>[[500,0,900,250]]<|/det|>\n' +
                    '<|ref|>image_caption<|/ref|><|det|>[[550,260,850,290]]<|/det|><center>Figure 1-2 Caption</center>',
                boxes: [
                    { box: [0, 0, 400, 300], label: 'text' },
                    { box: [500, 0, 900, 250], label: 'image' },
                    { box: [550, 260, 850, 290], label: 'image_caption' }
                ],
                image_dims: DIMS_1000,
                prompt_type: 'document'
            }
            const imageMap = new Map<string, string>([['1', 'img-diagram']])

            const result = assembler.assemble(ocrResult, imageMap)

            // Should have table structure
            expect(result).toMatch(/<table\s/)

            // Image and caption should be in the same cell (connected by <br/>)
            expect(result).toMatch(/img-diagram.*<br\/>.*Figure 1-2 Caption/)

            // Should have exactly 2 columns (text column and image+caption column)
            const tdCount = (result.match(/<td/g) || []).length
            expect(tdCount).toBe(2)
        })

        it('should render blocks without horizontal overlap as separate rows', () => {
            /*
             * Layout: Title at top, text below (no horizontal overlap)
             * Expected: Each block should be a separate row, no table
             */
            const ocrResult: OCRResult = {
                success: true,
                text: '',
                raw_text:
                    '<|ref|>title<|/ref|><|det|>[[100,100,500,150]]<|/det|>Title Text\n' +
                    '<|ref|>text<|/ref|><|det|>[[100,200,500,400]]<|/det|>Body content',
                boxes: [
                    { box: [100, 100, 500, 150], label: 'title' },
                    { box: [100, 200, 500, 400], label: 'text' }
                ],
                image_dims: DIMS_1000,
                prompt_type: 'document'
            }

            const result = assembler.assemble(ocrResult, new Map())

            // Should NOT use table for vertically stacked single-column blocks
            expect(result).not.toMatch(/<table\s/)

            // Both should be present as separate paragraphs
            expect(result).toContain('Title Text')
            expect(result).toContain('Body content')
        })

        it('should correctly layout sample5.json with left-text and right-image using boxes coordinates', () => {
            /*
             * sample5.json has:
             * - Block 5 (text): X: 119-870, Y: 596-676 (left)
             * - Block 6 (text): X: 119-872, Y: 680-977 (left, below Block 5)
             * - Block 7 (image): X: 893-1250, Y: 596-943 (right, overlaps both texts in Y)
             * - Block 8 (caption): X: 936-1220, Y: 950-981 (right, below image)
             * 
             * Expected: Table with 2 columns:
             *   - Left column: text5 + text6 stacked
             *   - Right column: image + caption merged
             */
            // @ts-expect-error -- importing json as any/unknown
            const result = assembler.assemble(sample5 as OCRResult, new Map([['7', 'test-image']]))

            // Should have table structure for the text+image section
            expect(result).toMatch(/<table\s/)

            // The two text blocks about 五行相生 should be present
            expect(result).toContain('五行相生，指木、火、土、金、水之间存在着有序的递相资生')
            expect(result).toContain('五行相生次序是：木生火')

            // The image should be present
            expect(result).toContain('scan2doc-img:test-image')

            // The caption should be present
            expect(result).toContain('图1-2 五行相生相克示意图')

            // Image and caption should be in the same cell (merged with <br/>)
            expect(result).toMatch(/scan2doc-img:test-image.*<br\/>.*图1-2/)

            // The text blocks should be stacked (joined with <br/><br/>)
            expect(result).toMatch(/递相资生.*<br\/><br\/>.*五行相生次序是/)
        })
    })
})
