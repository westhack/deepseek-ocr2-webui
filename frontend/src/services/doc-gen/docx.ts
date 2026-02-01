import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    ImageRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle
} from 'docx'
import { db } from '@/db'
import { consola } from 'consola'
import MarkdownIt from 'markdown-it'
// @ts-expect-error -- No types for this specific plugin
import MarkdownItKatex from '@iktakahiro/markdown-it-katex'
import type Token from 'markdown-it/lib/token.mjs'
import { convertMathMl2Math } from '@hungknguyen/docx-math-converter'
import katex from 'katex'

// Helper to convert LaTeX to Docx Math object using KaTeX -> MathML -> OMML
// This avoids the broken 'tex2mml' dependency in convertLatex2Math
const convertLatexToDocxMath = (latex: string) => {
    try {
        // 1. Convert LaTeX to MathML using KaTeX
        const mathml = katex.renderToString(latex, {
            output: 'mathml',
            throwOnError: false,
            displayMode: true // Ensure block display for correct OMML structure
        })

        // 2. Extract strictly the MathML part if KaTeX wraps it (KaTeX output is HTML + MathML usually)
        const mathMatch = mathml.match(/<math[\s\S]*?<\/math>/)
        if (!mathMatch) return [new TextRun(latex)]

        let cleanMathml = mathMatch[0]
        // Remove annotation tags which cause warnings in docx-math-converter
        cleanMathml = cleanMathml.replace(/<annotation[\s\S]*?<\/annotation>/g, '')

        // 3. Convert MathML to OMML
        return convertMathMl2Math(cleanMathml)
    } catch (e) {
        consola.error('Failed to convert latex to math', e)
        return [new TextRun(latex)]
    }
}

// Custom type for docx runs including text, images and math
type DocxRun = TextRun | ImageRun | ReturnType<typeof convertMathMl2Math>

export class DocxGenerator {
    private md: MarkdownIt
    private isChineseDoc = false

    constructor() {
        this.md = new MarkdownIt({
            html: true
        })
        this.md.use(MarkdownItKatex)
    }

    async generate(markdown: string): Promise<Blob> {
        this.isChineseDoc = this.detectDominantLanguage(markdown)
        const tokens = this.md.parse(markdown, {})
        const children: (Paragraph | Table)[] = []

        let i = 0
        let prevWasTable = false
        while (i < tokens.length) {
            const token = tokens[i]!

            if (token.type === 'heading_open') {
                const result = this.processHeading(tokens, i)
                children.push(result.paragraph)
                prevWasTable = false
                i = result.nextIndex
            } else if (token.type === 'paragraph_open') {
                const result = await this.processParagraph(tokens, i, prevWasTable)
                if (result.paragraph) children.push(result.paragraph)
                prevWasTable = false
                i = result.nextIndex
            } else if (token.type === 'html_block') {
                const table = await this.processHtmlBlockToken(token)
                if (table) {
                    children.push(table)
                    prevWasTable = true
                }
                i++
            } else if (token.type === 'math_block') {
                // Handle Block Math: $$ ... $$
                const mathObj = this.processMathBlock(token)
                children.push(mathObj)
                prevWasTable = false
                i++
            } else {
                i++
            }
        }

        const doc = new Document({
            styles: {
                default: {
                    document: {
                        run: {
                            font: this.isChineseDoc ? 'Microsoft YaHei' : 'Arial',
                            characterSpacing: this.isChineseDoc ? 20 : 0,
                        },
                    },
                },
            },
            sections: [{
                properties: {},
                children: children
            }]
        })

        return Packer.toBlob(doc)
    }

    private processMathBlock(token: Token): Paragraph {
        // Use new converter
        const mathChildren = convertLatexToDocxMath(token.content)

        // Wrap in a paragraph
        return new Paragraph({
            children: Array.isArray(mathChildren) ? mathChildren : [mathChildren],
            spacing: {
                before: 240,
                after: this.isChineseDoc ? 0 : 240,
                line: 360,
                lineRule: 'auto'
            }
        })
    }

    private async processHtmlBlockToken(token: Token): Promise<Table | null> {
        // Simple HTML Table parser
        const content = token.content
        if (!content.includes('<table')) return null

        // Check if this is a layout table (no visible borders) vs a data table
        const isLayoutTable = content.includes('class="layout-table"')

        const rows: TableRow[] = []
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g
        let rowMatch

        while ((rowMatch = rowRegex.exec(content)) !== null) {
            const rowContent = rowMatch[1]!
            const cells: TableCell[] = []

            // Match td or th with attributes
            const cellRegex = /<(td|th)([^>]*)>([\s\S]*?)<\/\1>/g
            let cellMatch
            while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
                const cellsResult = await this.processHtmlTableCell(cellMatch, isLayoutTable)
                cells.push(cellsResult)
            }
            if (cells.length > 0) {
                rows.push(new TableRow({ children: cells }))
            }
        }

        if (rows.length === 0) {
            consola.warn('[DocxGenerator] No rows found in table')
            return null
        }

        // Use no border for layout tables, single border for data tables
        const borderStyle = isLayoutTable ? BorderStyle.NONE : BorderStyle.SINGLE
        const borderSize = isLayoutTable ? 0 : 1

        return new Table({
            rows: rows,
            width: {
                size: 100,
                type: WidthType.PERCENTAGE
            },
            borders: {
                top: { style: borderStyle, size: borderSize },
                bottom: { style: borderStyle, size: borderSize },
                left: { style: borderStyle, size: borderSize },
                right: { style: borderStyle, size: borderSize },
                insideHorizontal: { style: borderStyle, size: borderSize },
                insideVertical: { style: borderStyle, size: borderSize },
            }
        })
    }

    private async processHtmlTableCell(cellMatch: RegExpExecArray, isLayoutTable: boolean): Promise<TableCell> {
        const tagName = cellMatch[1]!
        const attributes = cellMatch[2]!
        const cellContent = cellMatch[3]!.trim()
        const isHeader = tagName.toLowerCase() === 'th'

        // Parse width attribute
        const widthMatch = attributes.match(/width="(\d+)%?"/)
        const cellWidth = (widthMatch && widthMatch[1]) ? parseInt(widthMatch[1]) : null

        // Parse cell content as Markdown to support images and formatting
        const children = await this.parseCellContent(cellContent, isHeader)

        // Use no border for layout tables, single border for data tables
        const borderStyle = isLayoutTable ? BorderStyle.NONE : BorderStyle.SINGLE
        const borderSize = isLayoutTable ? 0 : 1

        return new TableCell({
            children: children,
            width: cellWidth
                ? { size: cellWidth, type: WidthType.PERCENTAGE }
                : { size: 0, type: WidthType.AUTO },
            borders: {
                top: { style: borderStyle, size: borderSize },
                bottom: { style: borderStyle, size: borderSize },
                left: { style: borderStyle, size: borderSize },
                right: { style: borderStyle, size: borderSize },
            }
        })
    }

    private processHeading(tokens: Token[], index: number) {
        const openToken = tokens[index]!
        const inlineToken = tokens[index + 1]!

        const level = parseInt(openToken.tag.replace('h', ''))
        let headingLevel: typeof HeadingLevel[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1
        if (level === 2) headingLevel = HeadingLevel.HEADING_2
        if (level === 3) headingLevel = HeadingLevel.HEADING_3
        if (level >= 4) headingLevel = HeadingLevel.HEADING_4

        return {
            paragraph: new Paragraph({
                text: inlineToken.content,
                heading: headingLevel,
                spacing: {
                    before: 240,
                    after: this.isChineseDoc ? 0 : 240,
                    line: 360,
                    lineRule: 'auto'
                }
            }),
            nextIndex: index + 3
        }
    }

    private async processParagraph(tokens: Token[], index: number, prevWasTable = false) {
        const contentToken = tokens[index + 1]!
        let paragraph: Paragraph | null = null

        if (contentToken.type === 'inline') {
            const imageToken = contentToken.children?.find((c: Token) => c.type === 'image')
            // If only one child and it's image
            if (contentToken.children?.length === 1 && imageToken) {
                const imageId = imageToken.attrGet('src')?.split(':')[1]
                if (imageId) {
                    paragraph = await this.createImageParagraph(imageId)
                }
            } else {
                paragraph = await this.createParagraph(contentToken, prevWasTable)
            }
        }

        return { paragraph, nextIndex: index + 3 }
    }

    private async createParagraph(inlineToken: Token, prevWasTable = false): Promise<Paragraph> {
        const children = await this.createParagraphChildren(inlineToken)

        return new Paragraph({
            children: children,
            indent: this.isChineseDoc ? { firstLine: 480 } : undefined, // 2 chars indent for Chinese (24pt = 480 twips)
            spacing: {
                before: prevWasTable ? 360 : undefined,  // Extra spacing after table
                after: this.isChineseDoc ? 0 : 240,
                line: 360,
                lineRule: 'auto',
            }
        })
    }

    private async createParagraphChildren(inlineToken: Token): Promise<DocxRun[]> {
        const runs: DocxRun[] = []
        if (!inlineToken.children) {
            runs.push(new TextRun(inlineToken.content))
            return runs
        }

        let style = { bold: false, italic: false }

        for (const child of inlineToken.children) {
            if (this.updateStyle(child, style)) continue

            const result = await this.processInlineChild(child, style)
            if (result) {
                if (Array.isArray(result)) runs.push(...result)
                else runs.push(result)
            }
        }
        return runs
    }

    private async boldifyParagraphChildren(inlineToken: Token): Promise<DocxRun[]> {
        const runs: DocxRun[] = []
        if (!inlineToken.children) {
            runs.push(new TextRun({ text: inlineToken.content, bold: true }))
            return runs
        }

        let style = { bold: true, italic: false }

        for (const child of inlineToken.children) {
            // Inner bold tags in header cell are redundant but we respect them for style object state
            if (this.updateStyle(child, style)) {
                // Keep base bold true even if child.type === 'strong_close'
                style.bold = true
                continue
            }

            const result = await this.processInlineChild(child, style)
            if (result) {
                if (Array.isArray(result)) runs.push(...result)
                else runs.push(result)
            }
        }
        return runs
    }

    private updateStyle(child: Token, style: { bold: boolean, italic: boolean }): boolean {
        if (child.type === 'strong_open') { style.bold = true; return true }
        if (child.type === 'strong_close') { style.bold = false; return true }
        if (child.type === 'em_open') { style.italic = true; return true }
        if (child.type === 'em_close') { style.italic = false; return true }
        return false
    }

    private async processInlineChild(child: Token, style: { bold: boolean, italic: boolean }) {
        if (child.type === 'text') {
            return new TextRun({
                text: child.content,
                bold: style.bold,
                italics: style.italic
            })
        }

        if (child.type === 'softbreak' || child.type === 'hardbreak') {
            return new TextRun({ text: '', break: 1 })
        }

        if (child.type === 'image') {
            return this.createInlineImageRun(child)
        }

        if (child.type === 'math_inline') {
            return convertLatexToDocxMath(child.content)
        }

        return null
    }

    private async createInlineImageRun(child: Token): Promise<ImageRun | TextRun> {
        const imageId = child.attrGet('src')?.split(':')[1]
        if (!imageId) return new TextRun("[Missing Image ID]")

        try {
            const image = await db.getPageExtractedImage(imageId)
            if (image) {
                const buffer = image.blob instanceof Blob
                    ? await image.blob.arrayBuffer()
                    : image.blob
                return new ImageRun({
                    data: buffer,
                    type: 'png',
                    transformation: { width: 100, height: 100 }
                })
            }
        } catch (e) {
            consola.error(`[DocxGenerator] Failed to create inline image for ${imageId}`, e)
        }
        return new TextRun("[Missing Image]")
    }

    private async createImageParagraph(imageId: string): Promise<Paragraph | null> {
        try {
            const extractedImage = await db.getPageExtractedImage(imageId)
            if (!extractedImage) return null

            const buffer = extractedImage.blob instanceof Blob
                ? await extractedImage.blob.arrayBuffer()
                : extractedImage.blob

            return new Paragraph({
                children: [
                    new ImageRun({
                        data: buffer,
                        type: 'png',
                        transformation: {
                            width: 600,
                            height: 600
                        },
                    }),
                ],
            })
        } catch (error) {
            consola.error(`[DocxGenerator] Failed to create image paragraph for ${imageId}`, error)
            return null
        }
    }

    private detectDominantLanguage(text: string): boolean {
        // Remove common markdown syntax
        /* eslint-disable sonarjs/slow-regex */
        const cleanText = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/[#*`~> +\-=_]/g, '')
        /* eslint-enable sonarjs/slow-regex */

        const totalLength = cleanText.length
        if (totalLength === 0) return false

        // Count Chinese characters
        const chineseMatches = cleanText.match(/[\u4e00-\u9fa5]/g)
        const chineseCount = chineseMatches ? chineseMatches.length : 0

        return (chineseCount / totalLength) > 0.2
    }

    private async parseCellContent(content: string, isHeader: boolean): Promise<Paragraph[]> {
        // Convert HTML img tags back to Markdown syntax for parsing
        // This handles images that were converted to HTML in markdown.ts for preview compatibility
        let markdownContent = content.replace(
            /<img\s+src="scan2doc-img:([a-zA-Z0-9_-]+)"[^>]*alt="([^"]*)"[^>]*>/g,
            '![$2](scan2doc-img:$1)'
        ).replace(
            /<img\s+src="scan2doc-img:([a-zA-Z0-9_-]+)"[^>]*>/g,
            '![Figure](scan2doc-img:$1)'
        )

        // Convert <br/> and <br> to double newlines for paragraph breaks
        // This ensures image and caption have proper line breaks in DOCX
        markdownContent = markdownContent.replace(/<br\s*\/?>/g, '\n\n')

        // Remove <center> tags but keep content
        markdownContent = markdownContent.replace(/<\/?center>/g, '')

        // Parse the cell content as Markdown to support images and formatting
        const tokens = this.md.parse(markdownContent, {})
        const paragraphs: Paragraph[] = []

        let i = 0
        while (i < tokens.length) {
            const token = tokens[i]!

            if (token.type === 'paragraph_open') {
                const inlineToken = tokens[i + 1]
                if (inlineToken && inlineToken.type === 'inline') {
                    const children = await this.createParagraphChildren(inlineToken)

                    // Apply bold style if this is a header cell
                    const styledChildren = isHeader
                        ? await this.boldifyParagraphChildren(inlineToken)
                        : children

                    paragraphs.push(new Paragraph({ children: styledChildren }))
                }
                i += 3 // Skip paragraph_open, inline, paragraph_close
            } else {
                i++
            }
        }

        // If no paragraphs were created, return fallback text
        if (paragraphs.length === 0) {
            paragraphs.push(new Paragraph({
                children: [new TextRun({
                    /* eslint-disable sonarjs/slow-regex */
                    text: content.replace(/<[^>]*>/g, '').trim(),
                    /* eslint-enable sonarjs/slow-regex */
                    bold: isHeader
                })]
            }))
        }

        return paragraphs
    }
}

export const docxGenerator = new DocxGenerator()
