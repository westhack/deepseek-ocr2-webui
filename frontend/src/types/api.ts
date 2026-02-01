// API related types and interfaces

// OCR API types
export interface OCRRequest {
  image: string // Base64 encoded image
  language?: string
  options?: {
    confidence?: number
    preprocess?: boolean
    detectHandwriting?: boolean
  }
}

export interface OCRResponse {
  text: string
  confidence: number
  words?: OCRWord[]
  lines?: OCRLine[]
  processingTime: number
}

export interface OCRWord {
  text: string
  confidence: number
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface OCRLine {
  text: string
  confidence: number
  words: OCRWord[]
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
}

// Export API types
export interface ExportRequest {
  pages: ExportPageData[]
  format: 'markdown' | 'html' | 'docx' | 'pdf'
  options?: ExportOptions
}

export interface ExportPageData {
  id: string
  pageNumber: number
  text?: string
  imageData?: string  // base64 image data
  metadata?: Record<string, unknown>
}

export interface ExportOptions {
  includeImages?: boolean
  pageSize?: 'A4' | 'Letter'
  margins?: {
    top: number
    right: number
    bottom: number
    left: number
  }
  fontSize?: number
  fontFamily?: string
  title?: string
  author?: string
  subject?: string
}

export interface ExportResponse {
  blob: Blob
  filename: string
  mimeType: string
  size: number
}

// Error types
export interface APIError {
  code: string
  message: string
  details?: unknown
  timestamp: string
}

// Progress tracking
export interface ProgressUpdate {
  type: 'progress'
  current: number
  total: number
  message?: string
  percentage: number
}

export interface ProcessingStatus {
  type: 'status'
  status: 'started' | 'processing' | 'completed' | 'error' | 'cancelled'
  message?: string
  error?: string
}

// WebSocket or EventSource message types
export type ProcessingMessage = ProgressUpdate | ProcessingStatus

// Third-party API configurations
export interface ThirdPartyAPIConfig {
  provider: 'tesseract' | 'google-cloud' | 'azure-vision' | 'aws-textract'
  apiKey?: string
  endpoint?: string
  region?: string
  options?: Record<string, unknown>
}