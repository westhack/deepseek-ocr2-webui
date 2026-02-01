import type { Page } from '@/stores/pages'
import { db } from '@/db'
import JSZip from 'jszip'
import { docxGenerator } from '@/services/doc-gen/docx'
import { PDFDocument } from 'pdf-lib'

export interface ExportOptions {
  format: 'markdown' | 'html' | 'docx' | 'pdf'
  includeImages?: boolean
  useDataURI?: boolean
  pageSize?: 'A4' | 'Letter'
  margins?: {
    top: number
    right: number
    bottom: number
    left: number
  }
  fontSize?: number
  fontFamily?: string
}

export interface ExportResult {
  blob: Blob
  filename: string
  mimeType: string
  size: number
}

export class ExportService {
  async exportToMarkdown(
    pages: Page[],
    options: ExportOptions
  ): Promise<ExportResult> {
    const useZip = !options.useDataURI
    const zip = useZip ? new JSZip() : null
    let combinedMarkdown = ''
    let hasImages = false

    for (const page of pages) {
      const pageMarkdown = await db.getPageMarkdown(page.id)
      if (!pageMarkdown) continue

      if (combinedMarkdown) combinedMarkdown += '\n\n---\n\n'

      const { content, foundImages } = await this.processPageForMarkdown(pageMarkdown.content, options, zip)
      combinedMarkdown += content
      if (foundImages) hasImages = true
    }

    // If no images were found and we're in Zip mode, export as plain MD instead
    const shouldUseZip = useZip && hasImages
    return this.createExportResult(combinedMarkdown, options, shouldUseZip ? zip : null)
  }

  private async processPageForMarkdown(content: string, options: ExportOptions, zip: JSZip | null): Promise<{ content: string; foundImages: boolean }> {
    let foundImages = false

    // 1. Process Markdown images: ![Alt](scan2doc-img:ID)
    const mdRegex = /!\[([^\]]*)\]\(scan2doc-img:([^)]+)\)/g
    const mdMatches = [...content.matchAll(mdRegex)]
    for (const match of mdMatches) {
      const fullMatch = match[0]
      const altText = match[1] || ''
      const imageId = match[2] || ''
      const result = await this.performImageReplacement(content, fullMatch, imageId, altText, options, zip, false)
      content = result.newContent
      if (result.imageFound) foundImages = true
    }

    // 2. Process HTML images: <img src="scan2doc-img:ID" alt="Alt" />
    const htmlRegex = /<img\s+src="scan2doc-img:([^"]+)"\s+alt="([^"]*)"\s*\/>/g
    const htmlMatches = [...content.matchAll(htmlRegex)]
    for (const match of htmlMatches) {
      const fullMatch = match[0]
      const imageId = match[1] || ''
      const altText = match[2] || ''
      const result = await this.performImageReplacement(content, fullMatch, imageId, altText, options, zip, true)
      content = result.newContent
      if (result.imageFound) foundImages = true
    }

    return { content, foundImages }
  }

  private async performImageReplacement(
    content: string,
    fullMatch: string,
    imageId: string,
    altText: string,
    options: ExportOptions,
    zip: JSZip | null,
    isHtml: boolean
  ): Promise<{ newContent: string; imageFound: boolean }> {
    if (!imageId) return { newContent: content, imageFound: false }

    const imageRecord = await db.getPageExtractedImage(imageId)
    if (!imageRecord || !imageRecord.blob) return { newContent: content, imageFound: false }

    const blob = imageRecord.blob instanceof Blob ? imageRecord.blob : new Blob([imageRecord.blob])

    if (options.useDataURI) {
      const base64 = await this.blobToBase64(blob)
      return {
        newContent: this.replaceWithDataUri(content, fullMatch, base64, altText, isHtml),
        imageFound: true
      }
    } else if (zip) {
      const imagePath = this.addImageToZip(zip, imageId, blob)
      return {
        newContent: this.replaceWithPath(content, fullMatch, imagePath, altText, isHtml),
        imageFound: true
      }
    }
    return { newContent: content, imageFound: false }
  }

  private replaceWithDataUri(content: string, fullMatch: string, base64: string, altText: string, isHtml: boolean): string {
    if (isHtml) {
      return content.replace(fullMatch, `<img src="${base64}" alt="${altText}" />`)
    } else {
      return content.replace(fullMatch, `![${altText}](${base64})`)
    }
  }

  private replaceWithPath(content: string, fullMatch: string, imagePath: string, altText: string, isHtml: boolean): string {
    if (isHtml) {
      return content.replace(fullMatch, `<img src="${imagePath}" alt="${altText}" />`)
    } else {
      return content.replace(fullMatch, `![${altText}](${imagePath})`)
    }
  }

  private addImageToZip(zip: JSZip, imageId: string, blob: Blob): string {
    const imageName = `${imageId}.png`
    zip.folder('images')?.file(imageName, blob)
    return `images/${imageName}`
  }

  private async createExportResult(content: string, _options: ExportOptions, zip: JSZip | null): Promise<ExportResult> {
    if (zip) {
      zip.file('document.md', content)
      const blob = await zip.generateAsync({ type: 'blob' })
      const filename = await this.generateFilename('document', 'zip')
      return { blob, filename, mimeType: 'application/zip', size: blob.size }
    } else {
      const blob = new Blob([content], { type: 'text/markdown' })
      const filename = await this.generateFilename('document', 'md')
      return { blob, filename, mimeType: 'text/markdown', size: blob.size }
    }
  }

  // Helper to convert blob to base64 data URI
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        resolve(result)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  async exportToHTML(
    _pages: Page[],
    _options: ExportOptions
  ): Promise<ExportResult> {
    throw new Error('Not implemented yet')
  }

  async exportToDOCX(
    pages: Page[],
    _options: ExportOptions
  ): Promise<ExportResult> {
    let combinedMarkdown = ''

    for (const page of pages) {
      const pageMarkdown = await db.getPageMarkdown(page.id)
      if (!pageMarkdown) continue

      if (combinedMarkdown) combinedMarkdown += '\n\n---\n\n'
      combinedMarkdown += pageMarkdown.content
    }

    const blob = await docxGenerator.generate(combinedMarkdown)
    const filename = await this.generateFilename('document', 'docx')
    return {
      blob,
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: blob.size
    }
  }

  async exportToPDF(
    pages: Page[],
    _options: ExportOptions
  ): Promise<ExportResult> {
    const mergedPdf = await PDFDocument.create()

    for (const page of pages) {
      const pdfBlob = await db.getPagePDF(page.id)
      if (!pdfBlob) continue

      const pdfBytes = await pdfBlob.arrayBuffer()
      const donorPdf = await PDFDocument.load(pdfBytes)
      const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices())
      copiedPages.forEach((p) => mergedPdf.addPage(p))
    }

    const pdfBytes = await mergedPdf.save()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' })
    const filename = await this.generateFilename('document', 'pdf')

    return {
      blob,
      filename,
      mimeType: 'application/pdf',
      size: blob.size
    }
  }

  async generateFilename(
    documentName: string = 'document',
    format: string,
    timestamp: Date = new Date()
  ): Promise<string> {
    const dateStr = timestamp.toISOString().split('T')[0]
    const timeStr = (timestamp.toTimeString().split(' ')[0] || '').replace(/:/g, '-')
    const sanitizedName = documentName.replace(/[^a-zA-Z0-9]/g, '_')

    return `${sanitizedName}_${dateStr}_${timeStr}.${format}`
  }

  downloadBlob(result: ExportResult): void {
    const url = URL.createObjectURL(result.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}

export const exportService = new ExportService()