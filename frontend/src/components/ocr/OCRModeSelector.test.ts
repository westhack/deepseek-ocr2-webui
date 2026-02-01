import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import OCRModeSelector from './OCRModeSelector.vue'
import { h } from 'vue'
import { i18n } from '../../../tests/setup'

// Mock Naive UI components
vi.mock('naive-ui', () => ({
    NButton: {
        name: 'NButton',
        props: ['type', 'loading', 'disabled'],
        template: '<button :disabled="disabled" class="n-button"><slot name="icon"></slot><slot></slot></button>'
    },
    NButtonGroup: {
        name: 'NButtonGroup',
        template: '<div class="n-button-group"><slot></slot></div>'
    },
    NDropdown: {
        name: 'NDropdown',
        props: ['options', 'trigger'],
        template: '<div class="n-dropdown"><slot></slot></div>'
    },
    NIcon: {
        name: 'NIcon',
        template: '<i class="n-icon"><slot></slot></i>'
    },
    useDialog: () => ({
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
        success: vi.fn()
    })
}))

// Mock Icons
vi.mock('@vicons/ionicons5', () => ({
    DocumentTextOutline: { name: 'DocumentTextOutline', render: () => h('svg') },
    ScanOutline: { name: 'ScanOutline', render: () => h('svg') },
    TextOutline: { name: 'TextOutline', render: () => h('svg') },
    ImageOutline: { name: 'ImageOutline', render: () => h('svg') },
    ChatboxEllipsesOutline: { name: 'ChatboxEllipsesOutline', render: () => h('svg') },
    SearchOutline: { name: 'SearchOutline', render: () => h('svg') },
    CreateOutline: { name: 'CreateOutline', render: () => h('svg') },
    ChevronDownOutline: { name: 'ChevronDownOutline', render: () => h('svg') }
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

describe('OCRModeSelector.vue', () => {
    // Reset mock before each test
    beforeEach(() => {
        mockHealthStore.isHealthy = true
        mockHealthStore.isFull = false
        mockHealthStore.isBusy = false
        vi.clearAllMocks()
    })

    it('renders default mode correctly', () => {
        const wrapper = mount(OCRModeSelector, {
            global: {
                plugins: [i18n]
            }
        })
        expect(wrapper.find('.trigger-btn').text()).toContain('Scan to Document')
    })

    it('emits run event when main button clicked', async () => {
        const wrapper = mount(OCRModeSelector, {
            global: {
                plugins: [i18n]
            }
        })
        await wrapper.find('.trigger-btn').trigger('click')
        expect(wrapper.emitted('run')).toBeTruthy()
        expect(wrapper.emitted('run')![0]).toEqual(['document'])
    })

    it('changes mode and emits run when dropdown item selected', async () => {
        const wrapper = mount(OCRModeSelector, {
            global: {
                plugins: [i18n]
            }
        })

        // Simulate selection from dropdown (via handleSelect)
        await (wrapper.vm as any).handleSelect('ocr')

        expect((wrapper.vm as any).selectedMode).toBe('ocr')
        expect(wrapper.find('.trigger-btn').text()).toContain('General OCR')
        expect(wrapper.emitted('run')![0]).toEqual(['ocr'])
    })

    it('updates button type when loading', async () => {
        const wrapper = mount(OCRModeSelector, {
            props: { loading: true },
            global: {
                plugins: [i18n]
            }
        })
        expect((wrapper.vm as any).buttonType).toBe('info')

        await wrapper.setProps({ loading: false })
        expect((wrapper.vm as any).buttonType).toBe('primary')
    })

    it('disables buttons when disabled prop is true', () => {
        const wrapper = mount(OCRModeSelector, {
            props: { disabled: true },
            global: {
                plugins: [i18n]
            }
        })
        const buttons = wrapper.findAll('.n-button')
        buttons.forEach(btn => {
            expect(btn.attributes('disabled')).toBeDefined()
        })
    })

    it('correctly generates menu options with icons', () => {
        const wrapper = mount(OCRModeSelector, {
            global: {
                plugins: [i18n]
            }
        })
        const options = (wrapper.vm as any).menuOptions
        expect(options.length).toBe(7)
        expect(options[0].label).toBe('Scan to Document')

        // Test icon rendering function
        const iconVNode = (options[0].icon as () => import('vue').VNode)()
        expect((iconVNode.type as any).name).toBe('NIcon')
    })

    it('shows error dialog when service is unavailable on main click', async () => {
        mockHealthStore.isHealthy = false
        const wrapper = mount(OCRModeSelector, {
            global: {
                plugins: [i18n]
            }
        })

        await wrapper.find('.trigger-btn').trigger('click')

        // Should NOT emit run
        expect(wrapper.emitted('run')).toBeFalsy()

        // Should show error dialog (mocked useDialog)
        const dialog = (wrapper.vm as any).dialog
        expect(dialog.error).toHaveBeenCalled()
        expect(dialog.error.mock.calls[0][0].title).toBe('Service Unavailable')
    })

    it('shows error dialog when queue is full on select', async () => {
        mockHealthStore.isFull = true
        const wrapper = mount(OCRModeSelector, {
            global: {
                plugins: [i18n]
            }
        })

        await (wrapper.vm as any).handleSelect('ocr')

        // Should NOT emit run
        expect(wrapper.emitted('run')).toBeFalsy()

        const dialog = (wrapper.vm as any).dialog
        expect(dialog.error).toHaveBeenCalled()
        expect(dialog.error.mock.calls[0][0].title).toBe('Queue Full')
    })
})
