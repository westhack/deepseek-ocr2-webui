// Common types used throughout the application

// Base interfaces
export interface BaseEntity {
  id: string
  createdAt: Date
  updatedAt: Date
}

// Processing states
export type ProcessingStatus = 'idle' | 'processing' | 'completed' | 'error' | 'cancelled'

// Task management
export interface Task extends BaseEntity {
  type: string
  status: ProcessingStatus
  progress: number
  message?: string
  error?: string
  result?: unknown
  priority: number
}

// File handling
export interface FileInfo {
  name: string
  size: number
  type: string
  lastModified: Date
}

export interface ProcessedFile extends FileInfo {
  id: string
  url: string
  thumbnailData?: string  // base64 thumbnail data
}

// UI State
export interface ModalState {
  isOpen: boolean
  title?: string
  content?: unknown
}

export interface NotificationState {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  timestamp: Date
}

// Configuration
export interface AppConfig {
  theme: 'light' | 'dark' | 'auto'
  language: string
  autoSave: boolean
  maxFileSize: number
  supportedFormats: string[]
}

// Error types
export interface AppError {
  code: string
  message: string
  details?: unknown
  timestamp: Date
  stack?: string
}

// Event types
export interface AppEvent {
  type: string
  payload: unknown
  timestamp: Date
}


export type {
  Page,
  PageProcessingLog,
  PageOutput,
} from '@/stores/pages'