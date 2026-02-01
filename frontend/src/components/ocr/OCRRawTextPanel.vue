<template>
  <div class="ocr-raw-text-panel">
    <div
      class="panel-header"
      @click="expanded = !expanded"
    >
      <div class="title-row">
        <NIcon :class="{ rotated: expanded }">
          <ChevronForward />
        </NIcon>
        <span class="panel-title">{{ t('ocrRawTextPanel.title') }}</span>
      </div>
      <NButton
        size="small"
        text
        circle
        :title="t('ocrRawTextPanel.copy')"
        @click.stop="handleCopy"
        @mouseenter="isCopyHovered = true"
        @mouseleave="isCopyHovered = false"
      >
        <template #icon>
          <NIcon :color="PRIMARY_COLOR">
            <Checkmark v-if="isCopied" />
            <template v-else>
              <Copy v-if="isCopyHovered" />
              <CopyOutline v-else />
            </template>
          </NIcon>
        </template>
      </NButton>
    </div>

    <NCollapseTransition :show="expanded">
      <div class="panel-content">
        <NScrollbar
          style="max-height: 200px"
          trigger="hover"
        >
          <pre class="raw-text-content">{{ text || t('ocrRawTextPanel.noText') }}</pre>
        </NScrollbar>
      </div>
    </NCollapseTransition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NCollapseTransition, NScrollbar, useMessage } from 'naive-ui'
import { CopyOutline, Copy, ChevronForward, Checkmark } from '@vicons/ionicons5'
import { uiLogger } from '@/utils/logger'
import { PRIMARY_COLOR } from '@/theme/vars'

interface Props {
  text: string
}

const props = defineProps<Props>()
const { t } = useI18n()
const expanded = ref(true)
const message = useMessage()
const isCopyHovered = ref(false)
const isCopied = ref(false)

async function handleCopy() {
  if (!props.text || isCopied.value) return

  try {
    let success = false
    if (navigator.clipboard && navigator.clipboard.writeText) {
       await navigator.clipboard.writeText(props.text)
       success = true
    } else {
       // Fallback for older browsers or non-secure contexts
       const textArea = document.createElement('textarea')
       textArea.value = props.text
       document.body.appendChild(textArea)
       textArea.select()
       try {
         document.execCommand('copy')
         success = true
       } catch (err) {
         uiLogger.error('document.execCommand copy failed', err)
         message.error(t('ocrRawTextPanel.copyFailed'))
       }
       document.body.removeChild(textArea)
    }

    if (success) {
      isCopied.value = true
      setTimeout(() => {
        isCopied.value = false
      }, 2000)
    }
  } catch (err) {
    uiLogger.error('handleCopy failed', err)
    message.error(t('ocrRawTextPanel.copyFailed'))
  }
}
</script>

<style scoped>
.ocr-raw-text-panel {
  border-top: 1px solid var(--n-border-color);
  background: #fff;
  min-width: 0;
  width: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  background: #fafafa;
  user-select: none;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--n-text-color-2);
}

.title-row .n-icon {
  transition: transform 0.2s;
}

.title-row .n-icon.rotated {
  transform: rotate(90deg);
}

.panel-content {
  padding: 0;
  border-top: 1px solid var(--n-border-color);
}

.raw-text-content {
  margin: 0;
  padding: 20px;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: v-mono, SF Mono, Menlo, Consolas, Courier, monospace;
  font-size: 13px;
  line-height: 1.5;
  color: var(--n-text-color);
  background: #fff;
}
</style>
