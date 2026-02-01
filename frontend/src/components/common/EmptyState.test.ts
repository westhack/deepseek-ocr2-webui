import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from './EmptyState.vue'
import { NButton } from 'naive-ui'
import { i18n } from '../../../tests/setup'

describe('EmptyState', () => {
    const mountOptions = {
        global: {
            plugins: [i18n],
            components: {
                NButton
            }
        }
    }

    it('renders correctly', () => {
        const wrapper = mount(EmptyState, mountOptions)

        expect(wrapper.text()).toContain('DeepSeek-OCR2-WebUI')
        expect(wrapper.find('.empty-state-hero').exists()).toBe(true)
    })

    it('emits add-files event when button is clicked', async () => {
        const wrapper = mount(EmptyState, mountOptions)

        // Find button and click
        await wrapper.find('button.empty-add-btn').trigger('click')
        expect(wrapper.emitted('add-files')).toBeTruthy()
    })
})
