import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import OCRInputModal from './OCRInputModal.vue'
import { i18n } from '@/i18n'

// Mock Naive UI components
vi.mock('naive-ui', () => ({
    NModal: {
        name: 'NModal',
        props: ['show', 'preset', 'title', 'positiveText', 'negativeText'],
        template: '<div v-if="show" class="n-modal"><slot></slot><button class="btn-positive" @click="$emit(\'positive-click\')">{{positiveText}}</button><button class="btn-negative" @click="$emit(\'negative-click\')">{{negativeText}}</button></div>'
    },
    NInput: {
        name: 'NInput',
        props: ['value', 'type', 'placeholder', 'rows'],
        template: '<textarea :value="value" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value)" @keydown.enter="$emit(\'keydown\', $event)" />'
    },
    useDialog: () => ({
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
        success: vi.fn()
    })
}))

// Mock health store
const { mockHealthStore } = vi.hoisted(() => {
    return {
        mockHealthStore: {
            isHealthy: true,
            isFull: false,
            isBusy: false
        }
    }
})

vi.mock('@/stores/health', () => ({
    useHealthStore: () => mockHealthStore
}))

describe('OCRInputModal.vue', () => {
    beforeEach(() => {
        mockHealthStore.isHealthy = true
        mockHealthStore.isFull = false
        mockHealthStore.isBusy = false
        vi.clearAllMocks()
    })

    it('renders correctly when show is true', () => {
        const wrapper = mount(OCRInputModal, {
            props: {
                show: true,
                mode: 'find'
            },
            global: { plugins: [i18n] }
        })
        expect(wrapper.find('.n-modal').exists()).toBe(true)
        expect(wrapper.find('textarea').attributes('placeholder')).toContain('locate')
    })

    it('hides when show is false', () => {
        const wrapper = mount(OCRInputModal, {
            props: {
                show: false,
                mode: 'find'
            },
            global: { plugins: [i18n] }
        })
        expect(wrapper.find('.n-modal').exists()).toBe(false)
    })

    it('switches content based on mode', async () => {
        const wrapper = mount(OCRInputModal, {
            props: {
                show: true,
                mode: 'find'
            },
            global: { plugins: [i18n] }
        })
        expect((wrapper.vm as any).title).toBe('Locate Object')

        await wrapper.setProps({ mode: 'freeform' })
        expect((wrapper.vm as any).title).toBe('Custom Prompt')
        expect(wrapper.find('textarea').attributes('placeholder')).toContain('custom prompt')
    })

    it('resets input value when opened', async () => {
        const wrapper = mount(OCRInputModal, {
            props: {
                show: false,
                mode: 'find'
            },
            global: { plugins: [i18n] }
        })

        // Set some value internally
        await wrapper.vm.$nextTick();
        (wrapper.vm as any).inputValue = 'some initial value'

        // Open
        await wrapper.setProps({ show: true })
        expect((wrapper.vm as any).inputValue).toBe('')
    })

    it('emits submit and update:show when positive button clicked', async () => {
        const wrapper = mount(OCRInputModal, {
            props: {
                show: true,
                mode: 'find'
            },
            global: { plugins: [i18n] }
        })

        const input = wrapper.find('textarea')
        await input.setValue('test search')

        await wrapper.find('.btn-positive').trigger('click')

        expect(wrapper.emitted('submit')).toBeTruthy()
        expect(wrapper.emitted('submit')![0]).toEqual(['test search'])
        expect(wrapper.emitted('update:show')).toBeTruthy()
        expect(wrapper.emitted('update:show')![0]).toEqual([false])
    })

    it('does not emit submit if value is empty', async () => {
        const wrapper = mount(OCRInputModal, {
            props: {
                show: true,
                mode: 'find'
            },
            global: { plugins: [i18n] }
        })

        await wrapper.find('.btn-positive').trigger('click')
        expect(wrapper.emitted('submit')).toBeFalsy()
    })

    it('emits update:show(false) when negative button clicked', async () => {
        const wrapper = mount(OCRInputModal, {
            props: {
                show: true,
                mode: 'find'
            },
            global: { plugins: [i18n] }
        })

        await wrapper.find('.btn-negative').trigger('click')
        expect(wrapper.emitted('update:show')).toBeTruthy()
        expect(wrapper.emitted('update:show')![0]).toEqual([false])
    })

    it('handles enter key on input', async () => {
        const wrapper = mount(OCRInputModal, {
            props: {
                show: true,
                mode: 'find'
            },
            global: { plugins: [i18n] }
        })

        const input = wrapper.find('textarea')
        await input.setValue('test item')

        // Simulate enter key
        await input.trigger('keydown.enter')

        expect(wrapper.emitted('submit')).toBeTruthy()
        expect(wrapper.emitted('submit')![0]).toEqual(['test item'])
    })

    it('shows error and blocks submit when service unavailable', async () => {
        mockHealthStore.isHealthy = false
        const wrapper = mount(OCRInputModal, {
            props: {
                show: true,
                mode: 'find'
            },
            global: { plugins: [i18n] }
        })

        const input = wrapper.find('textarea')
        await input.setValue('test')

        await wrapper.find('.btn-positive').trigger('click')

        expect(wrapper.emitted('submit')).toBeFalsy()

        const dialog = (wrapper.vm as any).dialog
        expect(dialog.error).toHaveBeenCalled()
        expect(dialog.error.mock.calls[0][0].title).toBe('Service Unavailable')
    })

    it('shows error and blocks submit when queue full', async () => {
        mockHealthStore.isFull = true
        const wrapper = mount(OCRInputModal, {
            props: {
                show: true,
                mode: 'find'
            },
            global: { plugins: [i18n] }
        })

        const input = wrapper.find('textarea')
        await input.setValue('test')

        await wrapper.find('.btn-positive').trigger('click')

        expect(wrapper.emitted('submit')).toBeFalsy()

        const dialog = (wrapper.vm as any).dialog
        expect(dialog.error).toHaveBeenCalled()
        expect(dialog.error.mock.calls[0][0].title).toBe('Queue Full')
    })
})
