/**
 * Test utility types for type-safe mocking
 */

import type { Mock } from 'vitest'

/**
 * Deep partial type - makes all properties optional recursively
 */
export type PartialDeep<T> = {
    [P in keyof T]?: T[P] extends object ? PartialDeep<T[P]> : T[P]
}

/**
 * Type-safe mock function wrapper
 * In Vi test, Mock<T> expects a function type, not tuple parameters.
 * @example
 * const mockFn: MockedFunction<(x: number) => string> = vi.fn()
 */
export type MockedFunction<T extends (...args: never[]) => unknown> = Mock<T>

/**
 * Mock object type - all methods become mocked functions
 */
export type MockedObject<T> = {
    [P in keyof T]: T[P] extends (...args: unknown[]) => unknown
    ? Mock<T[P]>
    : T[P]
}

/**
 * Test data wrapper - ensures test data matches expected shape
 */
export type TestData<T> = PartialDeep<T> & {
    // Ensure id is always present for entities
    id?: string | number
}
