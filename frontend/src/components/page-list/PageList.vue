<template>
  <div class="page-list-container">
    <!-- Selection Toolbar -->
    <div
      v-if="pages.length > 0"
      class="selection-toolbar"
      data-testid="selection-toolbar"
    >
      <NCheckbox
        :checked="isAllSelected"
        :indeterminate="isPartiallySelected"
        size="small"
        data-testid="select-all-checkbox"
        @update:checked="handleSelectAll"
      />

      <!-- Page Count -->
      <span
        class="page-count-text"
        data-testid="page-count-badge"
      >
        {{ 
          hasSelection 
            ? $t(props.pages.length > 1 ? 'pageList.selectedCount_plural' : 'pageList.selectedCount', [pagesStore.selectedPageIds.length, props.pages.length])
            : $t('pageList.pageCount', props.pages.length) 
        }}
      </span>
      
      <!-- Export dropdown button -->
      <NDropdown
        v-if="hasSelection"
        trigger="click"
        :options="exportMenuOptions"
        placement="bottom-start"
        @select="handleExportSelect"
      >
        <NButton
          data-testid="export-selected-btn"
          role="button"
          text
          size="tiny"
          circle
          :title="$t('common.export')"
          class="export-selected-btn"
          @mouseenter="isExportHovered = true"
          @mouseleave="isExportHovered = false"
        >
          <template #icon>
            <NIcon
              size="18"
              :color="PRIMARY_COLOR"
            >
              <Download v-if="isExportHovered" />
              <DownloadOutline v-else />
            </NIcon>
          </template>
        </NButton>
      </NDropdown>

      <!-- Batch OCR button -->
      <NButton
        v-if="hasSelection"
        data-testid="batch-ocr-btn"
        role="button"
        text
        size="tiny"
        circle
        :title="$t('pageList.scanSelected')"
        class="batch-ocr-btn keep-queue-open"
        @click="handleBatchOCR"
        @mouseenter="isScanHovered = true"
        @mouseleave="isScanHovered = false"
      >
        <template #icon>
          <NIcon
            size="18"
            :color="PRIMARY_COLOR"
          >
            <DocumentText v-if="isScanHovered" />
            <DocumentTextOutline v-else />
          </NIcon>
        </template>
      </NButton>

      <!-- Delete button -->
      <NButton
        v-if="hasSelection"
        data-testid="delete-selected-btn"
        role="button"
        text
        size="tiny"
        circle
        :style="{
          transition: 'all 0.2s ease'
        }"
        :title="$t('pageList.deleteSelected')"
        class="delete-selected-btn"
        @click="handleBatchDelete"
        @mouseenter="isDeleteHovered = true"
        @mouseleave="isDeleteHovered = false"
      >
        <template #icon>
          <NIcon
            size="18"
            :color="isDeleteHovered ? '#d03050' : '#d03050'"
          >
            <Trash v-if="isDeleteHovered" />
            <TrashOutline v-else />
          </NIcon>
        </template>
      </NButton>
    </div>

    <NScrollbar class="page-list">
      <div class="page-list-content">
        <draggable
          v-model="localPages"
          item-key="id"
          handle=".drag-handle"
          ghost-class="ghost"
          chosen-class="chosen"
          @start="handleDragStart"
          @end="handleDragEnd"
        >
          <template #item="{ element: page }">
            <PageItem
              :page="page"
              :is-active="page.id === selectedId"
              @click="selectPage"
              @delete="handlePageDeleted"
            />
          </template>
        </draggable>

        <!-- Empty state when no pages -->
        <NEmpty
          v-if="localPages.length === 0"
          :description="$t('pageList.noPages')"
          class="empty-state"
        >
          <template #icon>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line
                x1="12"
                y1="18"
                x2="12"
                y2="12"
              />
              <line
                x1="9"
                y1="15"
                x2="12"
                y2="12"
              />
              <line
                x1="15"
                y1="15"
                x2="12"
                y2="12"
              />
            </svg>
          </template>
        </NEmpty>
      </div>
    </NScrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, h } from 'vue'
import { useI18n } from 'vue-i18n'
import draggable from 'vuedraggable'
import { usePagesStore } from '@/stores/pages'
import PageItem from '@/components/page-item/PageItem.vue'
import type { Page } from '@/stores/pages'
import { TrashOutline, DownloadOutline, DocumentTextOutline, Trash, DocumentText, Download } from '@vicons/ionicons5'
import { NScrollbar, NEmpty, NCheckbox, NButton, NIcon, NDropdown, useMessage, useNotification, useDialog } from 'naive-ui'
import IconWord from '@/components/icons/IconWord.vue'
import IconPDF from '@/components/icons/IconPDF.vue'
import IconMarkdown from '@/components/icons/IconMarkdown.vue'
import { exportService } from '@/services/export'
import { ocrService } from '@/services/ocr'
import { db } from '@/db'
import { PRIMARY_COLOR } from '@/theme/vars'
import { useHealthStore } from '@/stores/health'

import { uiLogger } from '@/utils/logger'

const { t } = useI18n()

const props = defineProps<{
  pages: Page[]
  selectedId: string | null
}>()

type ExportFormat = 'markdown' | 'docx' | 'pdf'

const emit = defineEmits<{
  pageSelected: [page: Page]
  pageDeleted: [page: Page]
  batchDeleted: [pages: Page[]]
}>()

const pagesStore = usePagesStore()
const isDeleteHovered = ref(false)
const isScanHovered = ref(false)
const isExportHovered = ref(false)
const isDragging = ref(false)
const message = useMessage()
const notification = useNotification()
const dialog = useDialog()

// Local copy of pages for drag and drop
const localPages = ref<Page[]>([...props.pages])

// Watch for changes in props.pages and update local copy
watch(() => props.pages, (newPages) => {
  if (isDragging.value) return
  localPages.value = [...newPages]
}, { deep: true, immediate: true })

// Computed properties for selection state
const hasSelection = computed(() => pagesStore.selectedPageIds.length > 0)
const isAllSelected = computed(() =>
  props.pages.length > 0 && pagesStore.selectedPageIds.length === props.pages.length
)
const isPartiallySelected = computed(() =>
  pagesStore.selectedPageIds.length > 0 && pagesStore.selectedPageIds.length < props.pages.length
)

function selectPage(page: Page) {
  emit('pageSelected', page)
}

function handlePageDeleted(page: Page) {
  emit('pageDeleted', page)
}

function handleSelectAll(checked: boolean) {
  if (checked) {
    pagesStore.selectAllPages()
  } else {
    pagesStore.clearSelection()
  }
}

function handleBatchDelete() {
  const selectedPages = pagesStore.selectedPages
  if (selectedPages.length > 0) {
    // Emit batch delete event
    emit('batchDeleted', selectedPages)
  }
}

async function handleBatchOCR() {
  const selectedPages = pagesStore.selectedPages
  if (selectedPages.length === 0) return



  const healthStore = useHealthStore()
  
  // Check for Unavailable or Full status
  if (!healthStore.isHealthy || healthStore.isFull) {
    const isFull = healthStore.isFull
    dialog.error({
      title: isFull ? t('errors.ocrQueueFullTitle') : t('errors.ocrServiceUnavailableTitle'),
      content: isFull ? t('errors.ocrQueueFull') : t('errors.ocrServiceUnavailable'),
      positiveText: t('common.ok')
    })
    return
  }

  // Call batch OCR service
  const result = await ocrService.queueBatchOCR(selectedPages)

  // Show result notification (using notification like single-page OCR)
  if (result.queued > 0) {
    const msg = t('pageList.addedToQueue', [result.queued, result.queued > 1 ? 's' : ''])
    if (result.skipped > 0) {
      // 注意: Naive UI 的 notification API 不支持 class 选项
      notification.success({
        content: msg + ` (${t('pageList.skippedProcessed', [result.skipped])})`,
        duration: 2500,
        closable: false
      })
    } else {
      // 注意: Naive UI 的 notification API 不支持 class 选项
      notification.success({
        content: msg,
        duration: 2500,
        closable: false
      })
    }
  } else {
    // 注意: Naive UI 的 notification API 不支持 class 选项
    notification.warning({
      content: t('pageList.allProcessed'),
      duration: 2500,
      closable: false
    })
  }
}

// Export functionality
const exportMenuOptions = computed(() => {
  const stats = exportStats.value
  return [
    {
      label: t('pageList.exportAs', [`Markdown (${stats.markdown}/${stats.total})`]),
      key: 'markdown',
      disabled: stats.markdown === 0,
      icon: () => h(NIcon, { color: '#24292e' }, { default: () => h(IconMarkdown) })
    },
    {
      label: t('pageList.exportAs', [`DOCX (${stats.docx}/${stats.total})`]),
      key: 'docx',
      disabled: stats.docx === 0,
      icon: () => h(NIcon, { color: '#2b579a' }, { default: () => h(IconWord) })
    },
    {
      label: t('pageList.exportAs', [`PDF (${stats.pdf}/${stats.total})`]),
      key: 'pdf',
      disabled: stats.pdf === 0,
      icon: () => h(NIcon, { color: '#b30b00' }, { default: () => h(IconPDF) })
    }
  ]
})

const exportStats = ref({
  total: 0,
  markdown: 0,
  docx: 0,
  pdf: 0
})

// Watch selected pages and update stats
watch(() => pagesStore.selectedPages, async (selected) => {
  const total = selected.length
  if (total === 0) {
    exportStats.value = { total: 0, markdown: 0, docx: 0, pdf: 0 }
    return
  }

  const results = await Promise.all(
    selected.map(async (page) => ({
      hasMarkdown: await hasFormat(page.id, 'markdown'),
      hasDocx: await hasFormat(page.id, 'docx'),
      hasPdf: await hasFormat(page.id, 'pdf')
    }))
  )

  exportStats.value = {
    total,
    markdown: results.filter(r => r.hasMarkdown).length,
    docx: results.filter(r => r.hasDocx).length,
    pdf: results.filter(r => r.hasPdf).length
  }
}, { immediate: true })

async function handleExportSelect(key: string) {
  if (key === 'markdown' || key === 'docx' || key === 'pdf') {
    await handleQuickExport(key as ExportFormat)
  }
}

async function handleQuickExport(format: ExportFormat) {
  const { validPages, invalidPages } = await checkPagesReadiness(
    pagesStore.selectedPages,
    format
  )
  
  // All pages ready, export directly
  if (invalidPages.length === 0) {
    await performExport(validPages, format)
    message.success(t('pageList.exportedPages', [validPages.length]))
    return
  }

  // No pages ready, show warning
  if (validPages.length === 0) {
    dialog.warning({
      title: t('pageList.cannotExport'),
      content: t('pageList.allPagesNotReady', [invalidPages.length]),
      positiveText: t('common.ok')
    })
    return
  }
  
  // Some pages not ready, show confirmation
  await showExportConfirmDialog(validPages, invalidPages, format)
}

async function checkPagesReadiness(pages: Page[], format: ExportFormat) {
  const checks = await Promise.all(
    pages.map(async (page) => ({
      page,
      isReady: await hasFormat(page.id, format)
    }))
  )
  
  return {
    validPages: checks.filter(c => c.isReady).map(c => c.page),
    invalidPages: checks.filter(c => !c.isReady).map(c => c.page)
  }
}

async function hasFormat(pageId: string, format: ExportFormat): Promise<boolean> {
  if (format === 'markdown' || format === 'docx') {
    const md = await db.getPageMarkdown(pageId)
    return !!md && md.content.length > 0
  } else if (format === 'pdf') {
    const pdf = await db.getPagePDF(pageId)
    return !!pdf
  }
  return false
}

async function showExportConfirmDialog(
  validPages: Page[],
  invalidPages: Page[],
  format: string
) {
  return new Promise((resolve) => {
    dialog.warning({
      title: t('pageList.somePagesNotReady'),
      class: 'export-warning-dialog',
      content: () => h('div', { class: 'export-warning-content' }, [
        h('p', { style: 'margin-bottom: 12px' },
          t('pageList.pagesNotReady', [invalidPages.length, validPages.length + invalidPages.length, format.toUpperCase()])
        ),
        h('div', {
          class: 'page-list-preview',
          style: 'max-height: 150px; overflow-y: auto; background: #f5f5f5; padding: 8px; border-radius: 4px; margin-bottom: 12px'
        },
          invalidPages.map(p =>
            h('div', { style: 'font-size: 13px; color: #666; padding: 2px 0' },
              `• ${p.fileName}`
            )
          )
        ),
        h('p', { style: 'font-size: 13px; color: #666' },
          t('pageList.youCanCancel')
        )
      ]),
      positiveText: t('pageList.skipAndExport'),
      negativeText: t('common.cancel'),
      onPositiveClick: async () => {
        await performExport(validPages, format as ExportFormat)
        message.success(
          t('pageList.exportedSkipped', [validPages.length, invalidPages.length])
        )
        resolve(true)
      },
      onNegativeClick: () => {
        resolve(false)
      }
    })
  })
}

async function performExport(pages: Page[], format: ExportFormat) {
  try {
    const options = {
      format: format,
      includeImages: true,
      useDataURI: false
    }
    
    if (format === 'markdown') {
      const result = await exportService.exportToMarkdown(pages, options)
      exportService.downloadBlob(result)
    } else if (format === 'docx') {
      const result = await exportService.exportToDOCX(pages, options)
      exportService.downloadBlob(result)
    } else if (format === 'pdf') {
      const result = await exportService.exportToPDF(pages, options)
      exportService.downloadBlob(result)
    }
  } catch (error) {
    uiLogger.error('Export failed:', error)
    // 注意: Naive UI 的 message API 不支持 class 选项
    message.error(t('errors.failedToExportMarkdown'))
  }
}



interface DragEndEvent {
  oldIndex: number
  newIndex: number
}

function handleDragStart() {
  isDragging.value = true
}

async function handleDragEnd(event: DragEndEvent) {
  isDragging.value = false
  const { oldIndex, newIndex } = event

  if (oldIndex !== newIndex) {
    // Create new order mapping
    const newOrder = localPages.value.map((page, index) => ({
      id: page.id,
      order: index
    }))

    // Update store and database
    await pagesStore.reorderPages(newOrder)
  }
}

// Expose nothing for now as currentPage is controlled by parent
defineExpose({})
</script>

<style scoped>
.page-list-container {
  display: flex;
  padding: 8px 0 8px 8px;
  flex-direction: column;
  height: 100%;
}

.selection-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 31px 8px 26px; /* Align with page checkboxes: drag-handle(8px) + checkbox margin-left(8px) */
  border-bottom: 1px solid #f0f0f0;
  min-height: 40px;
}

.page-count-text {
  font-size: 13px;
  color: #666;
  margin-left: 4px;
}


.export-selected-btn {
  margin-left: auto;
}

.delete-selected-btn {
  margin-right: 8px;
}

.batch-ocr-btn {
  margin-left: 0;
}

.page-list {
  flex: 1;
  padding-right: 12px; /* Extra space to prevent page item borders from overlapping scrollbar */
}

.page-list-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 8px 8px 8px;
}

/* Draggable ghost class for vuedraggable */
.ghost {
  opacity: 0.5;
  background: var(--n-pressed-color);
}

/* Draggable chosen class for vuedraggable */
.chosen {
  cursor: grabbing;
}

.empty-state {
  padding: 32px 16px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>