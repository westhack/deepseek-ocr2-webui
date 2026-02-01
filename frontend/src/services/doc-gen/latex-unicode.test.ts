import { describe, it, expect } from 'vitest'
import { LatexToUnicodeConverter } from './latex-unicode'

describe('LatexToUnicodeConverter', () => {
    it('should convert units and special symbols', () => {
        expect(LatexToUnicodeConverter.convert('100^{\\circ}\\mathrm{C}')).toBe('100°C')
        expect(LatexToUnicodeConverter.convert('30\\%')).toBe('30%')
        expect(LatexToUnicodeConverter.convert('\\infty')).toBe('∞')
    })

    it('should convert Greek letters', () => {
        expect(LatexToUnicodeConverter.convert('\\alpha + \\beta = \\pi')).toBe('α + β = π')
        expect(LatexToUnicodeConverter.convert('\\Delta')).toBe('Δ')
    })

    it('should convert operators and relations', () => {
        expect(LatexToUnicodeConverter.convert('a \\times b \\le c')).toBe('a × b ≤ c')
        expect(LatexToUnicodeConverter.convert('x \\rightarrow y')).toBe('x → y')
        expect(LatexToUnicodeConverter.convert('\\forall x \\in S')).toBe('∀ x ∈ S')
    })

    it('should convert superscripts', () => {
        expect(LatexToUnicodeConverter.convert('x^2 + y^3')).toBe('x² + y³')
        expect(LatexToUnicodeConverter.convert('10^{-1}')).toBe('10⁻¹')
        expect(LatexToUnicodeConverter.convert('x^{2n}')).toBe('x²ⁿ')
    })

    it('should clean formatting commands', () => {
        expect(LatexToUnicodeConverter.convert('\\mathrm{kg}')).toBe('kg')
        expect(LatexToUnicodeConverter.convert('\\text{Hello}')).toBe('Hello')
        expect(LatexToUnicodeConverter.convert('\\mathbf{v}')).toBe('v')
    })

    it('should handle simple fractions and square roots', () => {
        expect(LatexToUnicodeConverter.convert('\\frac{1}{2}')).toBe('(1)/(2)')
        expect(LatexToUnicodeConverter.convert('\\sqrt{x+1}')).toBe('√(x+1)')
    })

    it('should handle complex expressions (Integration Test)', () => {
        // Based on user's real example
        const input = '100^{\\circ}\\mathrm{C} \\text{ is hot}'
        expect(LatexToUnicodeConverter.convert(input)).toBe('100°C is hot')
    })

    it('should preserve text that has no mapping', () => {
        expect(LatexToUnicodeConverter.convert('Hello World')).toBe('Hello World')
    })

    it('should handle delimiter cleanup inputs', () => {
        // If the input still has wrapping \( \)
        expect(LatexToUnicodeConverter.convert('\\(x=1\\)')).toBe('x=1')
    })

    it('should handle specific logic symbols', () => {
        expect(LatexToUnicodeConverter.convert('\\exists x \\in \\mathbb{R}, x > 0')).toBe('∃ x ∈ R, x > 0') // mathbb might need adding or it just strips
        expect(LatexToUnicodeConverter.convert('A \\cup B \\subset C')).toBe('A ∪ B ⊂ C')
    })

    it('should handle subscript (no conversion but clean)', () => {
        expect(LatexToUnicodeConverter.convert('x_{1} + x_{2}')).toBe('x1 + x2')
    })

    it('should handle combined superscript and subscript', () => {
        expect(LatexToUnicodeConverter.convert('x_{i}^{2}')).toBe('xi²')
    })
    it('should handle mapSuperscript unknown chars (fallback)', () => {
        // x^{a} -> xa (linearize fallback)
        expect(LatexToUnicodeConverter.convert('x^{a}')).toBe('xa')
        // x^{1a} -> x1a (linearize fallback)
        expect(LatexToUnicodeConverter.convert('x^{1a}')).toBe('x1a')
        // Valid group
        expect(LatexToUnicodeConverter.convert('x^{12}')).toBe('x¹²')
        // Degree symbol special path
        expect(LatexToUnicodeConverter.convert('x^{°}')).toBe('x°')
    })

    it('should return original text if no mapping found or regex fails', () => {
        expect(LatexToUnicodeConverter.convert('Hello World')).toBe('Hello World')
        // Test fallback for unknown symbol
        expect(LatexToUnicodeConverter.convert('\\unknownsymbol')).toBe('\\unknownsymbol')
    })
})
