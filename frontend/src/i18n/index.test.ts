import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SUPPORT_LOCALES, setLocale, getCurrentLocale, i18n, getInitialLocale } from './index'

describe('i18n Service', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
        })
        vi.stubGlobal('navigator', {
            language: 'en-US'
        })
    })

    it('defines supported locales', () => {
        expect(SUPPORT_LOCALES).toContain('en')
        expect(SUPPORT_LOCALES).toContain('zh-CN')
        expect(SUPPORT_LOCALES).toContain('zh-TW')
        expect(SUPPORT_LOCALES).toContain('ja-JP')
    })

    it('sets and gets locale correctly', () => {
        setLocale('zh-CN')
        expect(getCurrentLocale()).toBe('zh-CN')
        expect(localStorage.setItem).toHaveBeenCalledWith('locale', 'zh-CN')

        setLocale('zh-TW')
        expect(getCurrentLocale()).toBe('zh-TW')
        expect(localStorage.setItem).toHaveBeenCalledWith('locale', 'zh-TW')

        setLocale('ja-JP')
        expect(getCurrentLocale()).toBe('ja-JP')
        expect(localStorage.setItem).toHaveBeenCalledWith('locale', 'ja-JP')

        setLocale('en')
        expect(getCurrentLocale()).toBe('en')
        expect(localStorage.setItem).toHaveBeenCalledWith('locale', 'en')
    })

    describe('getInitialLocale', () => {
        it('returns stored locale if valid', () => {
            vi.mocked(localStorage.getItem).mockReturnValue('zh-CN')
            expect(getInitialLocale()).toBe('zh-CN')
        })

        it('returns default if stored locale is invalid', () => {
            vi.mocked(localStorage.getItem).mockReturnValue('invalid')
            expect(getInitialLocale()).toBe('en')
        })

        it('returns zh-TW if browser language is zh-TW or zh-HK', () => {
            vi.mocked(localStorage.getItem).mockReturnValue(null)

            vi.stubGlobal('navigator', { language: 'zh-TW' })
            expect(getInitialLocale()).toBe('zh-TW')

            vi.stubGlobal('navigator', { language: 'zh-HK' })
            expect(getInitialLocale()).toBe('zh-TW')
        })

        it('returns zh-CN if browser language starts with zh but not TW/HK', () => {
            vi.mocked(localStorage.getItem).mockReturnValue(null)
            vi.stubGlobal('navigator', { language: 'zh-CN' })
            expect(getInitialLocale()).toBe('zh-CN')

            vi.stubGlobal('navigator', { language: 'zh-SG' })
            expect(getInitialLocale()).toBe('zh-CN')
        })

        it('returns ja-JP if browser language starts with ja', () => {
            vi.mocked(localStorage.getItem).mockReturnValue(null)
            vi.stubGlobal('navigator', { language: 'ja' })
            expect(getInitialLocale()).toBe('ja-JP')

            vi.stubGlobal('navigator', { language: 'ja-JP' })
            expect(getInitialLocale()).toBe('ja-JP')
        })

        it('returns default if no stored locale and browser is English', () => {
            vi.mocked(localStorage.getItem).mockReturnValue(null)
            vi.stubGlobal('navigator', { language: 'en-GB' })
            expect(getInitialLocale()).toBe('en')
        })
    })

    it('has a valid i18n instance', () => {
        expect(i18n.global.locale.value).toBeDefined()
        expect(i18n.global.availableLocales).toContain('en')
        expect(i18n.global.availableLocales).toContain('zh-CN')
        expect(i18n.global.availableLocales).toContain('zh-TW')
        expect(i18n.global.availableLocales).toContain('ja-JP')
    })
})
