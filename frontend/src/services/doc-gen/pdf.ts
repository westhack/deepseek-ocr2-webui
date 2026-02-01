import { PDFDocument, PDFPage, rgb, PDFFont, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { OCRResult } from '@/services/ocr'
import { fontLoader, FontLoaderService } from '@/services/font/fontLoader'
import { parseRawText, type ParsedBlock } from './ocr-parser'
import { LatexToUnicodeConverter } from './latex-unicode'

// Assumed DPI for scanned documents (150 DPI is common for document scanning)
// This converts pixel dimensions to PDF points (72 points = 1 inch)
const DEFAULT_DPI = 150
const POINTS_PER_INCH = 72

export class SandwichPDFBuilder {
    /**
     * Generate a dual-layer PDF (Image + Invisible Text)
     */
    async generate(imageBlob: Blob | ArrayBuffer, ocrResult: OCRResult): Promise<Blob> {
        const arrayBuffer = imageBlob instanceof Blob ? await imageBlob.arrayBuffer() : imageBlob

        const pdfDoc = await PDFDocument.create()
        pdfDoc.registerFontkit(fontkit)

        const image = await this.embedImage(pdfDoc, arrayBuffer)

        // Try to load Chinese compatible font, fallback to Standard Helvetica
        let fontToUse: PDFFont
        try {
            const fontBytes = await fontLoader.fetchFontBytes(FontLoaderService.SC_FONT_URL)
            if (fontBytes) {
                fontToUse = await pdfDoc.embedFont(fontBytes)
            } else {
                fontToUse = await pdfDoc.embedStandardFont(StandardFonts.Helvetica)
            }
        } catch (e) {
            console.warn('[SandwichPDFBuilder] Failed to load custom font, falling back to standard font.', e)
            fontToUse = await pdfDoc.embedStandardFont(StandardFonts.Helvetica)
        }

        // Convert pixel dimensions to PDF points based on assumed DPI
        // This ensures the PDF matches the original image's physical size
        const pdfWidth = (image.width / DEFAULT_DPI) * POINTS_PER_INCH
        const pdfHeight = (image.height / DEFAULT_DPI) * POINTS_PER_INCH

        const page = pdfDoc.addPage([pdfWidth, pdfHeight])
        page.drawImage(image, {
            x: 0,
            y: 0,
            width: pdfWidth,
            height: pdfHeight,
        })

        // Overlay text using parsed blocks
        if (ocrResult.raw_text) {
            // Pass boxes array for accurate coordinates (raw_text has normalized coords)
            let blocks = parseRawText(ocrResult.raw_text, ocrResult.image_dims, ocrResult.boxes)

            // Preprocess blocks to fix common OCR parser alignment issues (e.g. table content in caption)
            blocks = this.preprocessBlocks(blocks)

            // Scale coordinates from pixel to PDF points
            const scale = pdfWidth / image.width
            this.overlayOcrText(page, blocks, pdfHeight, scale, fontToUse)
        }

        const pdfBytes = await pdfDoc.save()
        // Use Uint8Array which is a valid BlobPart
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Blob([pdfBytes as any], { type: 'application/pdf' })
    }

    /**
     * Fix common OCR issues, such as table content being assigned to the caption block
     * because the Qwen-VL tags are interleaved (Table Box -> Caption Box -> Content).
     */
    private preprocessBlocks(blocks: ParsedBlock[]): ParsedBlock[] {
        for (let i = 0; i < blocks.length - 1; i++) {
            const current = blocks[i]
            const next = blocks[i + 1]

            if (!current || !next) continue

            // Pattern: Empty 'table' block followed by a block containing <table> tags
            // This happens when the model outputs: <ref>table</ref><box>... <ref>caption</ref><box>... Content...
            if (current.type === 'table' && !current.content.trim()) {
                if (next.content && next.content.includes('<table')) {
                    // Extract all table HTML from the next block
                    const tableMatches = next.content.match(/<table[\s\S]*?<\/table>/g)

                    if (tableMatches) {
                        // Move tables to current block
                        current.content = tableMatches.join('\n\n')

                        // Remove tables from next block to avoid duplication
                        // content remains in 'next' (likely the caption text)
                        next.content = next.content.replace(/<table[\s\S]*?<\/table>/g, '').trim()
                    }
                }
            }
        }
        return blocks
    }


    private async embedImage(pdfDoc: PDFDocument, arrayBuffer: ArrayBuffer) {
        try {
            return await pdfDoc.embedJpg(arrayBuffer)
        } catch {
            try {
                return await pdfDoc.embedPng(arrayBuffer)
            } catch {
                throw new Error('Unsupported image format. Only JPG and PNG are supported.')
            }
        }
    }

    private overlayOcrText(page: PDFPage, blocks: ParsedBlock[], pdfHeight: number, scale: number, font: PDFFont) {
        for (const block of blocks) {
            if (block.type === 'image' || block.type === 'figure' || !block.content) continue

            const cleanText = this.getCleanText(block)
            if (!cleanText) continue

            const { scaledX, scaledY1, boxWidth, boxHeight } = this.scaleBoxCoordinates(block.box, scale)

            // DEBUG: Draw box border
            // this.drawDebugBox(page, scaledX, scaledY1, boxWidth, boxHeight, pdfHeight)

            const { fontSize, lines } = this.fitTextToBox(cleanText, boxWidth, boxHeight, font)
            this.drawTextLines(page, lines, scaledX, scaledY1, boxHeight, pdfHeight, fontSize, font)
        }
    }

    private getCleanText(block: ParsedBlock): string {
        if (block.type === 'table' || block.content.includes('<table')) {
            return this.cleanTableHtml(block.content)
        }
        return this.cleanTextForPdf(block.content)
    }

    private scaleBoxCoordinates(box: [number, number, number, number], scale: number) {
        const [x1, y1, x2, y2] = box
        return {
            scaledX: x1 * scale,
            scaledY1: y1 * scale,
            boxWidth: (x2 - x1) * scale,
            boxHeight: (y2 - y1) * scale
        }
    }



    private drawTextLines(
        page: PDFPage, lines: string[],
        x: number, y1: number,
        h: number,
        pdfHeight: number, fontSize: number, font: PDFFont
    ) {
        const lineHeight = fontSize * 1.2
        const baselineOffset = fontSize * 0.1
        let currentY = pdfHeight - y1 - fontSize + baselineOffset
        const bottomLimit = pdfHeight - y1 - h

        for (const line of lines) {
            if (currentY < bottomLimit) break
            try {
                page.drawText(line, {
                    x, y: currentY, size: fontSize,
                    color: rgb(1, 0, 0), opacity: 0, font: font // opacity: 1 for debug
                })
            } catch (e) {
                console.warn('[SandwichPDFBuilder] Failed to draw text line:', line.substring(0, 20), e)
            }
            currentY -= lineHeight
        }
    }

    /**
     * Find optimal font size to fit text within box using binary search and real font metrics
     */
    private fitTextToBox(text: string, boxWidth: number, boxHeight: number, font: PDFFont): { fontSize: number, lines: string[] } {
        let minFontSize = 6
        let maxFontSize = 200 // Increased max font size for large headers
        let bestFontSize = minFontSize
        let bestLines: string[] = text.split('\n')

        // Binary search for optimal font size
        // Using real font measurement for accuracy
        for (let i = 0; i < 12; i++) {
            const fontSize = (minFontSize + maxFontSize) / 2
            const lines = this.breakTextIntoLines(text, boxWidth, font, fontSize)
            const requiredHeight = lines.length * (fontSize * 1.2)

            // Basic check: fits in height?
            // Note: breakTextIntoLines ensures it fits in width
            if (requiredHeight <= boxHeight) {
                bestFontSize = fontSize
                bestLines = lines
                minFontSize = fontSize
            } else {
                maxFontSize = fontSize
            }
        }

        return { fontSize: bestFontSize, lines: bestLines }
    }

    /**
     * Parse HTML table content into structured text for PDF invisible layer.
     * Preserves rows with newlines and columns with spaces.
     */
    private cleanTableHtml(html: string): string {
        // 1. Replace row endings with newlines
        let text = html.replace(/<\/tr>/gi, '\n')
        // 2. Replace cell endings with spaces (simulating tabs/separation)
        text = text.replace(/<\/td>/gi, '  ').replace(/<\/th>/gi, '  ')
        // 3. Replace <br> with spaces to avoid breaking row structure too much, or newlines?
        // Let's use space for <br> inside a cell to keep cell content "together" relative to the row
        text = text.replace(/<br\s*\/?>/gi, ' ')
        // 4. Strip all other HTML tags
        // eslint-disable-next-line sonarjs/slow-regex
        text = text.replace(/<[^>]*>/g, '')
        // 5. Decode basic HTML entities (common in tables)
        text = text.replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
        // 6. Trim lines but preserve the main newlines
        return text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n')
    }

    /**
     * Wrap text by measuring actual width, supports both word wrap and CJK char wrap.
     * Respects explicit newlines in the input text.
     */
    private breakTextIntoLines(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
        const allLines: string[] = []

        // Split input by explicit newlines (e.g. from Table rows)
        const paragraphs = text.split('\n')

        for (const paragraph of paragraphs) {
            const lines = this.processParagraph(paragraph, maxWidth, font, fontSize)
            if (lines.length > 0) {
                allLines.push(...lines)
            }
        }


        return allLines.length > 0 ? allLines : [text]
    }

    private processParagraph(paragraph: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
        const lines: string[] = []
        let currentLine = ''
        const tokens = paragraph.match(/(\S+|\s+)/g) || []

        for (const token of tokens) {
            const trialLine = currentLine + token
            const trialWidth = font.widthOfTextAtSize(trialLine, fontSize)

            if (trialWidth <= maxWidth) {
                currentLine = trialLine
            } else {
                currentLine = this.handleOverflow(token, currentLine, maxWidth, font, fontSize, lines)
            }
        }
        if (currentLine) lines.push(currentLine)
        return lines
    }

    private handleOverflow(
        token: string,
        currentLine: string,
        maxWidth: number,
        font: PDFFont,
        fontSize: number,
        lines: string[]
    ): string {
        const isWhitespace = /^\s+$/.test(token)

        if (isWhitespace) {
            return currentLine + token
        }

        if (currentLine) {
            lines.push(currentLine)
        }

        if (font.widthOfTextAtSize(token, fontSize) > maxWidth) {
            return this.splitLongToken(token, maxWidth, font, fontSize, lines)
        }

        return token
    }

    private splitLongToken(token: string, maxWidth: number, font: PDFFont, fontSize: number, lines: string[]): string {
        let fragment = ''
        for (const char of token) {
            if (font.widthOfTextAtSize(fragment + char, fontSize) > maxWidth) {
                if (fragment) lines.push(fragment)
                fragment = char
            } else {
                fragment += char
            }
        }
        return fragment
    }

    private cleanTextForPdf(content: string): string {
        // Remove markdown headers (# ## ###)
        let text = content.replace(/^#+\s*/gm, '')
        // Remove markdown image syntax ![...](...) - simple loop approach
        text = this.removeMarkdownLinks(text, true)
        // Remove markdown links [...](...)
        text = this.removeMarkdownLinks(text, false)
        // Trim and collapse whitespace
        text = text.replace(/\s+/g, ' ').trim()

        // Normalize LaTeX delimiters and convert simple formulas to Unicode
        // \( ... \) -> converted text
        text = text.replace(/\\\((.*?)\\\)/g, (_, latex) => {
            return LatexToUnicodeConverter.convert(latex)
        })
        // \[ ... \] -> converted text (treat same as inline for text layer)
        text = text.replace(/\\\[(.*?)\\\]/g, (_, latex) => {
            return LatexToUnicodeConverter.convert(latex)
        })

        return text
    }

    private removeMarkdownLinks(text: string, isImage: boolean): string {
        const prefix = isImage ? '![' : '['
        let result = text
        let startIdx = result.indexOf(prefix)

        while (startIdx !== -1) {
            const bracketEnd = result.indexOf(']', startIdx)
            if (bracketEnd === -1) break

            if (result[bracketEnd + 1] === '(') {
                const parenEnd = result.indexOf(')', bracketEnd + 1)
                if (parenEnd !== -1) {
                    // Remove the entire markdown link/image
                    result = result.substring(0, startIdx) + result.substring(parenEnd + 1)
                } else {
                    break
                }
            } else {
                // Not a valid markdown link, move on
                startIdx = result.indexOf(prefix, startIdx + 1)
                continue
            }

            startIdx = result.indexOf(prefix)
        }

        return result
    }
}

export const sandwichPDFBuilder = new SandwichPDFBuilder()

