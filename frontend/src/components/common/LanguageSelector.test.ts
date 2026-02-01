import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LanguageSelector from './LanguageSelector.vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import zhCN from '@/i18n/locales/zh-CN'
import zhTW from '@/i18n/locales/zh-TW'
import jaJP from '@/i18n/locales/ja-JP'
import { setLocale } from '@/i18n'

// Mock i18n setLocale
vi.mock('@/i18n', async () => {
    const actual = await vi.importActual('@/i18n') as any
    return {
        ...actual,
        setLocale: vi.fn()
    }
})

describe('LanguageSelector.vue', () => {
    const createI18nInstance = (locale = 'en') => createI18n({
        legacy: false,
        locale,
        fallbackLocale: 'en',
        messages: { en, 'zh-CN': zhCN, 'zh-TW': zhTW, 'ja-JP': jaJP },
        globalInjection: true
    })

    it('renders language selector button', () => {
        const i18n = createI18nInstance('en')
        const wrapper = mount(LanguageSelector, {
            global: {
                plugins: [i18n]
            }
        })
        expect(wrapper.find('.lang-selector-btn').exists()).toBe(true)
    })

    it('emits setLocale when a language is selected', async () => {
        const i18n = createI18nInstance('en')
        const wrapper = mount(LanguageSelector, {
            global: {
                plugins: [i18n]
            }
        })

        // Access the internal handleLanguageChange method
        await (wrapper.vm as any).handleLanguageChange('zh-CN')

        expect(setLocale).toHaveBeenCalledWith('zh-CN')
    })

    it('updates options when locale changes', async () => {
        const i18n = createI18nInstance('en')
        const wrapper = mount(LanguageSelector, {
            global: {
                plugins: [i18n]
            }
        })

        // Mock locale change
        i18n.global.locale.value = 'zh-CN'

        await wrapper.vm.$nextTick()
        const options = (wrapper.vm as any).languageOptions
        // zh-CN is at index 1
        expect(options[1].disabled).toBe(true)
    })

    it('correctly calculates language options', async () => {
        const i18n = createI18nInstance('en')
        const wrapper = mount(LanguageSelector, {
            global: {
                plugins: [i18n]
            }
        })

        // Initial locale is 'en'
        let options = (wrapper.vm as any).languageOptions
        expect(options).toHaveLength(4)
        expect(options[0].key).toBe('en')
        expect(options[1].key).toBe('zh-CN')
        expect(options[2].key).toBe('zh-TW')
        expect(options[3].key).toBe('ja-JP')

        // English should be disabled because current locale is 'en'
        expect(options[0].disabled).toBe(true)
        expect(options[1].disabled).toBe(false)
        expect(options[2].disabled).toBe(false)
        expect(options[3].disabled).toBe(false)

        // Change locale to zh-CN and check options again
        i18n.global.locale.value = 'zh-CN'
        await wrapper.vm.$nextTick()

        options = (wrapper.vm as any).languageOptions
        expect(options[0].disabled).toBe(false)
        expect(options[1].disabled).toBe(true)
        expect(options[2].disabled).toBe(false)
        expect(options[3].disabled).toBe(false)
    })
})
