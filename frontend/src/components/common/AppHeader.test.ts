import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import AppHeader from './AppHeader.vue'
import { NLayoutHeader, NButton, NSpin, NIcon, NTooltip, NPopover } from 'naive-ui'
import { i18n } from '../../../tests/setup'

// Remove mock to improved coverage
// let onClickOutsideCallback: (() => void) | null = null
// vi.mock('@vueuse/core', () => ({ ... }))

// Mock child component
vi.mock('@/components/common/OCRQueuePopover.vue', () => ({
    default: {
        template: '<div>OCR Queue</div>'
    }
}))

// Mock child component
vi.mock('@/components/common/LanguageSelector.vue', () => ({
    default: {
        name: 'LanguageSelector',
        template: '<div class="language-selector-stub">Language</div>'
    }
}))

// Mock OCRHealthIndicator
vi.mock('@/components/common/OCRHealthIndicator.vue', () => ({
    default: {
        name: 'OCRHealthIndicator',
        template: '<div class="ocr-health-indicator-stub">Health</div>'
    }
}))

// Manual store mock
const mockStore = reactive({
    activeOCRTasks: [] as any[],
    queuedOCRTasks: [] as any[],
    ocrTaskCount: 0
})

vi.mock('@/stores/pages', () => ({
    usePagesStore: () => mockStore
}))

interface HeaderVM {
    showQueue: boolean;
    handleAddFiles: () => void;
    $nextTick: () => Promise<void>;
}

describe('AppHeader', () => {
    // Reset store before each test
    beforeEach(() => {
        mockStore.activeOCRTasks = []
        mockStore.queuedOCRTasks = []
        mockStore.ocrTaskCount = 0
    })

    const createMountOptions = (props = {}) => ({
        global: {
            plugins: [i18n],
            components: {
                NLayoutHeader,
                NButton,
                NSpin,
                NIcon,
                NTooltip
            },
            stubs: {
                LanguageSelector: {
                    name: 'LanguageSelector',
                    template: '<div class="language-selector-stub">Language</div>'
                },
                OCRHealthIndicator: {
                    name: 'OCRHealthIndicator',
                    template: '<div class="ocr-health-indicator-stub">Health</div>'
                },
                OCRQueuePopover: {
                    name: 'OCRQueuePopover',
                    template: '<div class="ocr-queue-popover-stub"><slot></slot></div>'
                },
                NPopover: {
                    name: 'NPopover',
                    props: ['show'],
                    emits: ['update:show'],
                    template: '<div class="n-popover-stub"><slot name="trigger"></slot><slot></slot></div>'
                },
                NDropdown: {
                    template: '<div class="n-dropdown-stub"><slot></slot></div>'
                },
                NTooltip: {
                    template: '<div class="n-tooltip-stub"><slot name="trigger"></slot><div class="tooltip-content"><slot></slot></div></div>'
                }
            }
        },
        props: {
            ...props
        }
    })

    // ... (existing tests) ...




    it('renders branding correctly', () => {
        const wrapper = mount(AppHeader, createMountOptions())

        expect(wrapper.text()).toContain('DeepSeek-OCR2-WebUI')
        expect(wrapper.find('.header-brand').exists()).toBe(true)
    })





    it('emits add-files event when import button is clicked', async () => {
        const wrapper = mount(AppHeader, createMountOptions())


        // Find the primary button (Import Files)


        // To make it robust, we can look for the button that handles the click
        await wrapper.find('button[type="button"].n-button--primary-type').trigger('click')

        expect(wrapper.emitted('add-files')).toBeTruthy()
    })

    it('displays OCR status pill when tasks are present', async () => {
        // Set store state BEFORE mount
        mockStore.activeOCRTasks = [{ id: '1', status: 'recognizing' }]
        mockStore.ocrTaskCount = 1

        const wrapper = mount(AppHeader, createMountOptions({ pageCount: 1 }))

        await wrapper.vm.$nextTick()

        expect(wrapper.text()).toContain('Processing: 1')
        expect(wrapper.find('.status-pill').exists()).toBe(true)
    })

    it('emits add-files event when add button is clicked', async () => {
        const wrapper = mount(AppHeader, createMountOptions())
        const addBtn = wrapper.find('.add-btn')
        await addBtn.trigger('click')
        expect(wrapper.emitted('add-files')).toBeTruthy()
    })

    it('toggles showQueue when event is emitted from popover', async () => {
        mockStore.ocrTaskCount = 1
        const wrapper = mount(AppHeader, createMountOptions())
        const vm = wrapper.vm as unknown as HeaderVM
        await vm.$nextTick()

        // Set showQueue to true first
        vm.showQueue = true
        await vm.$nextTick()

        // Find the popover stub
        const popover = wrapper.findComponent({ name: 'OCRQueuePopover' })
        expect(popover.exists()).toBe(true)

        // Emit close event
        await popover.vm.$emit('close')
        expect(vm.showQueue).toBe(false)
    })

    it('does not display OCR status pill when tasks are empty', async () => {
        mockStore.ocrTaskCount = 0
        const wrapper = mount(AppHeader, createMountOptions())
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.status-pill').exists()).toBe(false)
    })

    it('toggles showQueue when status-pill is clicked', async () => {
        // Set store state to show the status pill
        mockStore.activeOCRTasks = [{ id: '1', status: 'recognizing' }]
        mockStore.ocrTaskCount = 1

        const wrapper = mount(AppHeader, createMountOptions())
        const vm = wrapper.vm as unknown as HeaderVM
        await vm.$nextTick()

        // Initially showQueue should be false
        expect(vm.showQueue).toBe(false)

        // Find the status pill and click it
        const statusPill = wrapper.find('.status-pill')
        expect(statusPill.exists()).toBe(true)

        await statusPill.trigger('click')

        // showQueue should now be true
        expect(vm.showQueue).toBe(true)

        // Click again to toggle off
        await statusPill.trigger('click')
        expect(vm.showQueue).toBe(false)
    })

    it('closes showQueue via onClickOutside', async () => {
        // Set store state to enable popover display
        mockStore.ocrTaskCount = 1

        // Attach to document body to make onClickOutside work
        const div = document.createElement('div')
        document.body.appendChild(div)

        const wrapper = mount(AppHeader, {
            ...createMountOptions(),
            attachTo: div
        })
        const vm = wrapper.vm as unknown as HeaderVM
        await vm.$nextTick()

        // Set showQueue to true to simulate open state
        vm.showQueue = true
        await vm.$nextTick()
        expect(vm.showQueue).toBe(true)

        // Dispatch a click event on document body (outside of popover)
        document.body.click() // JSDOM supports this or dispatchEvent

        await vm.$nextTick()
        expect(vm.showQueue).toBe(false)

        wrapper.unmount()
        div.remove()
    })

    it('does not close showQueue when clicking ignored elements', async () => {
        // Set store to allow queue
        mockStore.ocrTaskCount = 1

        const ignoreSelectors = [
            '.keep-queue-open',
            '[data-testid="ocr-queue-badge"]',
            '[data-testid="ocr-trigger-btn"]',
            '[data-testid="ocr-mode-dropdown"]',
            '[data-testid="ocr-actions-container"]',
            '.ocr-actions',
            '.ocr-mode-selector'
        ]

        // Create a container for all ignored elements
        const div = document.createElement('div')
        document.body.appendChild(div)

        // Create elements for each selector
        const elements = ignoreSelectors.map(selector => {
            const el = document.createElement('div')
            if (selector.startsWith('.')) {
                el.classList.add(selector.substring(1))
            } else if (selector.startsWith('[data-testid=')) {
                // Extract testid value: [data-testid="value"] -> value
                const match = selector.match(/data-testid="([^"]+)"/)
                if (match && match[1]) {
                    el.setAttribute('data-testid', match[1])
                }
            }
            div.appendChild(el)
            return el
        })

        const wrapper = mount(AppHeader, {
            ...createMountOptions(),
            attachTo: div
        })
        const vm = wrapper.vm as unknown as HeaderVM
        await vm.$nextTick()

        // Test each element
        for (const el of elements) {
            // Open queue
            vm.showQueue = true
            await vm.$nextTick()
            expect(vm.showQueue).toBe(true)

            // Click ignored element
            el.click()
            await vm.$nextTick()

            // Should still be open
            expect(vm.showQueue).toBe(true)
        }

        wrapper.unmount()
        div.remove()
    })

    it('renders GitHub links with correct hrefs', () => {
        const wrapper = mount(AppHeader, createMountOptions())

        const links = [
            'https://github.com/westhack/DeepSeek-OCR2-WebUI',
            'https://github.com/westhack/DeepSeek-OCR2-WebUI/issues',
            'https://github.com/westhack/DeepSeek-OCR2-WebUI#readme'
        ]

        links.forEach(href => {
            const link = wrapper.find(`a[href="${href}"]`)
            expect(link.exists()).toBe(true)
            expect(link.attributes('target')).toBe('_blank')
        })
    })

    it('exposes handleAddFiles and showQueue', async () => {
        const wrapper = mount(AppHeader, createMountOptions())
        const vm = wrapper.vm as unknown as HeaderVM

        // Test exposed method
        vm.handleAddFiles()
        expect(wrapper.emitted('add-files')).toBeTruthy()

        // Test exposed property
        vm.showQueue = true
        expect(vm.showQueue).toBe(true)
    })



    it('renders standalone OCRHealthIndicator when no tasks and queue hidden', async () => {
        mockStore.ocrTaskCount = 0
        const wrapper = mount(AppHeader, createMountOptions())
        const vm = wrapper.vm as unknown as HeaderVM
        vm.showQueue = false
        await vm.$nextTick()

        // Should show standalone indicator
        // Note: We need to distinguish standalone vs inside popover. 
        // Inside popover it has 'compact' prop, standalone doesn't.
        // But since popover is hidden when tasks=0 && showQueue=false, we just check existence.
        expect(wrapper.findComponent({ name: 'OCRHealthIndicator' }).exists()).toBe(true)
    })

    it('hides standalone OCRHealthIndicator when queue is shown', async () => {
        mockStore.ocrTaskCount = 0
        const wrapper = mount(AppHeader, createMountOptions())
        const vm = wrapper.vm as unknown as HeaderVM

        // Force show queue
        vm.showQueue = true
        await vm.$nextTick()

        // Standalone indicator (v-if="!showQueue") should be hidden.
        // Popover indicator (v-if="showQueue") should be shown.
        // The one in popover has 'compact' prop.
        const indicators = wrapper.findAllComponents({ name: 'OCRHealthIndicator' })
        expect(indicators.length).toBe(1)
        // Verify it is the compact one using attributes or props (depending on how stub/mock handles it)
        // Since we shallow mount or use stubs, props are passed to stub.
        expect(indicators[0]!.attributes('compact')).toBeDefined()
        // Or if defined as prop in component
        // expect(indicators[0].props('compact')).toBe(true) 
    })

    it('renders GitHub links and language selector', () => {
        const wrapper = mount(AppHeader, createMountOptions())
        expect(wrapper.find('.github-links').exists()).toBe(true)
        expect(wrapper.findAll('.github-btn').length).toBe(3)
        expect(wrapper.findComponent({ name: 'LanguageSelector' }).exists()).toBe(true)
    })



    it('displays both processing and queued counts', async () => {
        mockStore.activeOCRTasks = [{ id: '1', status: 'recognizing' }]
        mockStore.queuedOCRTasks = [{ id: '2', status: 'queued' }, { id: '3', status: 'queued' }]
        mockStore.ocrTaskCount = 3

        const wrapper = mount(AppHeader, createMountOptions())
        await wrapper.vm.$nextTick()

        const text = wrapper.text()
        expect(text).toContain('Processing: 1')
        expect(text).toContain('Waiting: 2')
    })



    it('renders tooltip contents', () => {
        // NTooltip stub renders both slots, but sometimes default slot content (text) 
        // might be tricky with stubs/internals. 
        // At least verify the trigger content which we know renders.
        const wrapper = mount(AppHeader, createMountOptions())
        expect(wrapper.text()).toContain('Star')
        expect(wrapper.text()).toContain('Issue')
        expect(wrapper.text()).toContain('Docs')
    })

    it('populates popoverContentRef when queue is shown', async () => {
        mockStore.ocrTaskCount = 1
        const wrapper = mount(AppHeader, createMountOptions())
        const vm = wrapper.vm as any // access exposed bindings

        vm.showQueue = true
        await vm.$nextTick()

        const contentComponent = wrapper.findComponent({ name: 'OCRQueuePopover' })
        expect(contentComponent.exists()).toBe(true)
        const parentElement = contentComponent.element.parentElement
        expect(parentElement).not.toBeNull()
    })

    it('updates showQueue when NPopover emits update:show', async () => {
        // Ensure clean state
        mockStore.ocrTaskCount = 0
        const wrapper = mount(AppHeader, createMountOptions())
        const vm = wrapper.vm as any

        // Step 1: Update store to satisfy v-if condition partly
        mockStore.activeOCRTasks = [{ id: '1', status: 'recognizing' }]
        mockStore.ocrTaskCount = 1
        await vm.$nextTick()

        // Verify store reactivity
        const pill = wrapper.find('.status-pill')
        expect(pill.exists()).toBe(true)

        // Step 2: Open queue to satisfy full v-if condition
        vm.showQueue = true
        await vm.$nextTick()

        // Step 3: Find component instance (Real or Stub)
        // Note: wrapper.findComponent({ name: 'NPopover' }) might fail if name inference is tricky
        // But finding by imported component definition is robust
        const popover = wrapper.findComponent(NPopover)

        if (!popover.exists()) {
            console.error('NPopover not found. HTML:', wrapper.html())
            // Debug info
        }
        expect(popover.exists()).toBe(true)

        // Step 4: Emit update:show false
        await popover.vm.$emit('update:show', false)
        await vm.$nextTick()

        expect(vm.showQueue).toBe(false)
    })
})
