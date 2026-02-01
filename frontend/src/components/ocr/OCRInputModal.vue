<template>
  <NModal
    :show="show"
    preset="dialog"
    :title="title"
    :positive-text="confirmText"
    :positive-button-props="confirmButtonProps"
    :negative-text="t('common.cancel')"
    @update:show="$emit('update:show', $event)"
    @positive-click="handleSubmit"
    @negative-click="$emit('update:show', false)"
  >
    <div class="ocr-input-content">
      <NInput
        v-model:value="inputValue"
        type="textarea"
        :placeholder="placeholder"
        :rows="3"
        autofocus
        @keydown.enter.prevent="handleSubmit"
      />
    </div>
  </NModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NModal, NInput, useDialog } from 'naive-ui'
import type { OCRPromptType } from '@/services/ocr'
import { useHealthStore } from '@/stores/health'

interface Props {
  show: boolean
  mode: OCRPromptType
}

interface Emits {
  (e: 'update:show', v: boolean): void
  (e: 'submit', value: string): void
}



const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { t } = useI18n()
const healthStore = useHealthStore()
const dialog = useDialog()
const inputValue = ref('')

const isFind = computed(() => props.mode === 'find')
const title = computed(() => isFind.value ? t('ocrInputModal.locateObject') : t('ocrInputModal.customPrompt'))
const placeholder = computed(() => isFind.value
  ? t('ocrInputModal.locatePlaceholder')
  : t('ocrInputModal.promptPlaceholder')
)
const confirmText = computed(() => isFind.value ? t('ocrInputModal.locate') : t('ocrInputModal.runOCR'))

// Disable submit button only when input is empty
const confirmButtonProps = computed(() => ({
  disabled: !inputValue.value.trim()
}))

// Reset input when opening
watch(() => props.show, (val) => {
  if (val) {
    inputValue.value = ''
  }
})

/**
 * Handle form submission with health check
 * @returns false to prevent modal from auto-closing, undefined to allow closing
 */
function handleSubmit() {
  if (!inputValue.value.trim()) return false
  
  // Second layer defense: check health status before submitting
  const isUnavailable = !healthStore.isHealthy
  const isQueueFull = healthStore.isFull
  
  if (isUnavailable || isQueueFull) {
    // Show error dialog and return false to keep input modal open
    dialog.error({
      title: isQueueFull ? t('errors.ocrQueueFullTitle') : t('errors.ocrServiceUnavailableTitle'),
      content: isQueueFull ? t('errors.ocrQueueFull') : t('errors.ocrServiceUnavailable'),
      positiveText: t('common.ok')
    })
    return false  // Critical: prevent NModal from auto-closing
  }
  
  emit('submit', inputValue.value)
  emit('update:show', false)
  // Return undefined to allow default closing behavior (though we manually closed it)
}
</script>

<style scoped>
.ocr-input-content {
  margin-top: 12px;
}
</style>
