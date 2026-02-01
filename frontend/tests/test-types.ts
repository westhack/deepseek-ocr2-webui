/**
 * Common test utility types - shared across all test files
 */

import type { DBPage, DBFile } from '@/db'

/**
 * Deep partial type
 */
export type PartialDeep<T> = {
    [P in keyof T]?: T[P] extends object ? PartialDeep<T[P]> : T[P]
}

/**
 * Mock DB page for testing
 */
export type MockDBPage = Partial<DBPage>

/**
 * Mock DB file for testing
 */
export type MockDBFile = Partial<DBFile>

/**
 * Generic mock object
 */
export type MockObject<T = unknown> = Record<string, T>

/**
 * Worker message type
 */
export interface WorkerMessage {
    type: string
    payload?: unknown
    [key: string]: unknown
}

/**
 * Global test type extensions
 */
declare global {
    interface Window {
        pageIdCounter?: number
    }

     
    var pageIdCounter: number | undefined
}
