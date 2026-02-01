/**
 * A lightweight helper to convert simple LaTeX formulas to human-readable Unicode text.
 * This is "best-effort" for copy-paste UX in PDFs, not a full mathematical parser.
 */
export class LatexToUnicodeConverter {
    // Dictionary of direct symbol replacements
    private static readonly SYMBOL_MAP: Record<string, string> = {
        // Units / Symbols
        '\\circ': '°',
        '\\infty': '∞',
        '\\nabla': '∇',
        '\\partial': '∂',
        '\\%': '%',

        // Greek (Lower)
        '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε',
        '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ', '\\iota': 'ι', '\\kappa': 'κ',
        '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π',
        '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'φ',
        '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',

        // Greek (Upper)
        '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ',
        '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Upsilon': 'Υ',
        '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',

        // Operators & Relations
        '\\times': '×', '\\cdot': '·', '\\div': '÷', '\\pm': '±', '\\mp': '∓',
        '\\le': '≤', '\\leq': '≤', '\\ge': '≥', '\\geq': '≥', '\\ne': '≠', '\\neq': '≠',
        '\\approx': '≈', '\\equiv': '≡', '\\sim': '∼',
        '\\forall': '∀', '\\exists': '∃', '\\in': '∈', '\\notin': '∉',
        '\\subset': '⊂', '\\supset': '⊃', '\\cup': '∪', '\\cap': '∩',
        '\\rightarrow': '→', '\\leftarrow': '←', '\\Rightarrow': '⇒', '\\Leftrightarrow': '⇔',

        // Other common
        '\\emptyset': '∅',
        '\\angle': '∠',
    }

    private static readonly SUPERSCRIPTS: Record<string, string> = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
        'n': 'ⁿ', 'i': 'ⁱ'
    }

    // Subscripts could be added if needed, but superscripts are more common for powers/units

    static convert(latex: string): string {
        let text = latex

        // 1. Remove wrapping delimiters if present (defensive check)
        // cleanTextForPdf already passes content inside delimiters, but just in case
        text = text.replace(/^\\\((.*)\\\)$/, '$1')
        text = text.replace(/^\\\[(.*)\\\]$/, '$1')

        // 2. Format cleaning (remove formatting commands but keep content)
        // \mathrm{ABC} -> ABC, \text{...} -> ...
        // Added mathbb to supported list
        text = text.replace(/\\(mathrm|mathbf|mathit|text|textbf|mathbb)\{([^{}]+)\}/g, '$2')

        // 3. Spacing adjustments
        // \, \; \quad -> space
        text = text.replace(/\\[,;]|\\[a-z]*quad/g, ' ')

        // 3.5 Subscripts: x_{1} -> x1 (Linearize)
        // Handle grouped subscripts x_{10}
        text = text.replace(/_\{([^{}]+)\}/g, '$1')
        // Handle single char subscripts x_1
        text = text.replace(/_([0-9a-zA-Z])/g, '$1')

        // 5. Symbol replacement (Prioritize this to handle \circ inside superscripts)
        for (const [cmd, char] of Object.entries(this.SYMBOL_MAP)) {
            const escapedCmd = cmd.replace(/\\/g, '\\\\')
            const regex = new RegExp(`${escapedCmd}(?![a-zA-Z])`, 'g')
            text = text.replace(regex, char)
        }

        // 4. Superscripts: x^2 -> x²
        // Handle grouped superscripts x^{10} or x^{°}
        // If content is already converted symbol (like °), remove ^ and braces
        text = text.replace(/\^\{([^{}]+)\}/g, (_, group) => {
            // If group is a known symbol (like °), just return it
            if (group === '°') return '°'
            // Otherwise try mapping digits
            const mapped = this.mapSuperscript(group)
            // If mapping changed something (meaning it was digits), return mapped
            // If mapping didn't change (e.g. "a"), we might fallback to just return group 
            // but strictly x^a doesn't have unicode superscript.
            // For simple layout, maybe just drop ^? x^a -> xa is weird.
            // Or keep ^? 
            // Decision: transform if numeric, otherwise just return content (linearize)
            return /^[0-9+\-=()ni⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ]+$/.test(mapped) ? mapped : group
        })

        // Handle single char superscripts x^2
        text = text.replace(/\^([0-9+\-=()ni])/g, (_, char) => this.mapSuperscript(char))

        // Cleanup leftover ^ if it was preceding a symbol that got converted directly? 
        // No, step 5 ran first now. So ^\circ -> ^°. 
        // We need to handle ^° specifically or strict cleaning.
        text = text.replace(/\^°/g, '°')


        // 6. Cleanup empty groups {} 
        text = text.replace(/\{\}/g, '')

        // 8. Handling specific structures (Moved up to run before generic brace stripping)
        // Fraction: \frac{a}{b} -> (a)/(b)
        // We need to match braces recursively but JS regex doesn't support it easily.
        // Simple 1-level match:
        text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')

        // Sqrt: \sqrt{x} -> √(x)
        text = text.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')

        // 7. Remove remaining curly braces that were part of arguments
        text = text.replace(/\{([^{}]+)\}/g, '$1')

        // 9. Final Cleanup 
        // Remove known commands that weren't caught (defensive) e.g. \frac that failed to match arguments
        // text = text.replace(/\\[a-zA-Z]+/g, '') // Dangerous if we missed something important?
        // Let's leave it for now to see debug output if something remains.

        // Collapse multiple spaces
        text = text.replace(/\s+/g, ' ').trim()

        return text
    }

    private static mapSuperscript(str: string): string {
        return str.split('').map(c => this.SUPERSCRIPTS[c] || c).join('')
    }
}
