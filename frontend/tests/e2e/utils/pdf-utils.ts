import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs/promises';

/**
 * Get the total number of pages in a PDF file.
 * @param filePath Path to the PDF file
 */
export async function getPdfPageCount(filePath: string): Promise<number> {
    try {
        const pdfBytes = await fs.readFile(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        return pdfDoc.getPageCount();
    } catch (error) {
        console.error(`[getPdfPageCount] Failed to read PDF at ${filePath}:`, error);
        throw error;
    }
}
