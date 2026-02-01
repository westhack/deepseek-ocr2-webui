import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, generatePageId } from '@/db/index'
import type { DBPage } from '@/db/index'
import fileAddService from '@/services/add'
import { pdfEvents } from '@/services/pdf/events'
import { ocrEvents } from '@/services/ocr/events'
import { storeLogger } from '@/utils/logger'
import { getRandomId } from '@/utils/crypto'

export interface PageProcessingLog {
  id: string
  timestamp: Date
  level: 'info' | 'warning' | 'error' | 'success'
  message: string
  details?: unknown
}

export interface PageOutput {
  format: 'text' | 'markdown' | 'html'
  content: string
  confidence?: number
}

export type PageStatus =
  | 'pending_render' | 'rendering'
  | 'pending_ocr' | 'recognizing' | 'ocr_success'
  | 'pending_gen' | 'generating_markdown' | 'markdown_success'
  | 'generating_pdf' | 'pdf_success' | 'generating_docx'
  | 'ready' | 'completed' | 'error'

const STORAGE_KEY_SHOW_OVERLAY = 'scan2doc_show_overlay'

export interface Page {
  id: string
  fileName: string
  pageNumber?: number
  fileSize: number
  fileType: string
  origin: 'upload' | 'scanner' | 'pdf_generated'
  status: PageStatus
  progress: number
  ocrText?: string
  thumbnailData?: string
  width?: number
  height?: number
  outputs: PageOutput[]
  logs: PageProcessingLog[]
  createdAt: Date
  updatedAt: Date
  processedAt?: Date
  order: number
}



function waitForPDFQueuedPromise(timeout = 10000): Promise<void> {
  return new Promise<void>((resolve) => {
    const handler = () => {
      pdfEvents.off('pdf:pages:queued', handler)
      resolve()
    }
    pdfEvents.on('pdf:pages:queued', handler)
    setTimeout(() => {
      pdfEvents.off('pdf:pages:queued', handler)
      resolve()
    }, timeout)
  })
}

export const usePagesStore = defineStore('pages', () => {
  // State
  const pages = ref<Page[]>([])
  const selectedPageIds = ref<string[]>([])
  const processingQueue = ref<string[]>([])
  const pdfProcessing = ref({
    active: false,
    total: 0,
    completed: 0,
    currentFile: undefined as string | undefined
  })
  const showOverlay = ref(localStorage.getItem('scan2doc_show_overlay') !== 'false')
  const isInitialized = ref(false)

  // Queue to serialize file addition operations (prevents order race conditions)
  let fileAdditionQueue = Promise.resolve()

  // Getters
  const pagesByStatus = computed(() => (status: PageStatus) =>
    pages.value.filter(page => page.status === status)
  )

  const selectedPages = computed(() =>
    pages.value.filter(page => selectedPageIds.value.includes(page.id))
  )

  const processingPages = computed(() => {
    return pages.value.filter(page =>
      page.status === 'pending_render' ||
      page.status === 'rendering' ||
      page.status === 'recognizing' ||
      page.status === 'pending_ocr'
    )
  })

  const completedPages = computed(() =>
    pages.value.filter(page => page.status === 'completed' || page.status === 'ready' || page.status === 'ocr_success')
  )

  const totalPages = computed(() => pages.value.length)

  const overallProgress = computed(() => {
    if (pages.value.length === 0) return 0
    const totalProgress = pages.value.reduce((sum, page) => sum + page.progress, 0)
    return Math.round(totalProgress / pages.value.length)
  })

  // Actions
  async function addPage(page: Omit<Page, 'id' | 'createdAt' | 'updatedAt' | 'order'> & { id?: string; order?: number }) {
    const id = page.id || generatePageId()
    // Fix Truthiness Bug: 0 is falsy but valid, -1 is truthy but invalid
    const hasValidOrder = page.order !== undefined && page.order !== -1
    const order = hasValidOrder ? page.order! : (await db.getNextOrder())

    // Create the page object
    const newPage: Page = {
      ...page,
      id,
      order,
      createdAt: new Date(),
      updatedAt: new Date(),
      outputs: page.outputs || [],
      logs: page.logs || []
    }

    pages.value.push(newPage)
    // Sort pages by order
    pages.value.sort((a, b) => a.order - b.order)

    return newPage
  }

  function updatePage(id: string, updates: Partial<Page>) {
    const index = pages.value.findIndex(p => p.id === id)
    if (index !== -1) {
      pages.value[index] = {
        ...pages.value[index]!,
        ...updates,
        updatedAt: new Date()
      }

      // If status is becoming ready/completed, ensure progress is 100 and set processedAt
      if (updates.status === 'ready' || updates.status === 'completed') {
        const p = pages.value[index]!
        p.progress = 100
        p.processedAt = new Date()
      }
    }
  }

  function updatePageProgress(id: string, progress: number) {
    updatePage(id, { progress })
  }

  function updatePageStatus(id: string, status: PageStatus) {
    updatePage(id, { status })
  }

  function addPageLog(id: string, log: Omit<PageProcessingLog, 'id' | 'timestamp'>) {
    const index = pages.value.findIndex(p => p.id === id)
    if (index !== -1) {
      pages.value[index]!.logs.push({
        ...log,
        id: `page_log_${Date.now()}_${getRandomId()}`,
        timestamp: new Date()
      })
      pages.value[index]!.updatedAt = new Date()
    }
  }

  function setOcrResult(id: string, text: string) {
    updatePage(id, { ocrText: text })
  }

  function addOutput(id: string, output: PageOutput) {
    const index = pages.value.findIndex(p => p.id === id)
    if (index !== -1) {
      pages.value[index]!.outputs.push(output)
      pages.value[index]!.updatedAt = new Date()
    }
  }

  function selectPage(id: string) {
    if (!selectedPageIds.value.includes(id)) {
      selectedPageIds.value.push(id)
    }
  }

  function deselectPage(id: string) {
    selectedPageIds.value = selectedPageIds.value.filter(oldId => oldId !== id)
  }

  function togglePageSelection(id: string) {
    if (selectedPageIds.value.includes(id)) {
      deselectPage(id)
    } else {
      selectPage(id)
    }
  }

  function selectAllPages() {
    selectedPageIds.value = pages.value.map(page => page.id)
  }

  function clearSelection() {
    selectedPageIds.value = []
  }

  function setShowOverlay(value: boolean) {
    showOverlay.value = value
    localStorage.setItem(STORAGE_KEY_SHOW_OVERLAY, String(value))
  }

  // Unified deletion function for both single and batch deletions
  function deletePages(pageIds: string[]) {
    const deletedPages: Page[] = []

    // Find and collect all pages to be deleted
    for (const pageId of pageIds) {
      const index = pages.value.findIndex(page => page.id === pageId)
      if (index !== -1) {
        const deletedPage = pages.value[index]
        if (deletedPage) {
          deletedPages.push(deletedPage)
        }
      }
    }

    if (deletedPages.length === 0) {
      return null
    }

    // Remove pages from store (in reverse order to maintain correct indices)
    const sortedIndices = pageIds
      .map(pageId => pages.value.findIndex(page => page.id === pageId))
      .filter(index => index !== -1)
      .sort((a, b) => b - a)

    for (const index of sortedIndices) {
      const deletedPage = pages.value[index]
      if (deletedPage) {
        pages.value.splice(index, 1)
        deselectPage(deletedPage.id)
      }
    }

    return deletedPages.length === 1 ? deletedPages[0] : deletedPages
  }

  function deletePage(pageId: string) {
    const result = deletePages([pageId])
    return Array.isArray(result) ? result[0] || null : result
  }


  function deleteAllPages() {
    pages.value = []
    selectedPageIds.value = []
    processingQueue.value = []
  }

  function addToProcessingQueue(pageId: string) {
    if (!processingQueue.value.includes(pageId)) {
      processingQueue.value.push(pageId)
    }
  }

  function removeFromProcessingQueue(pageId: string) {
    const index = processingQueue.value.indexOf(pageId)
    if (index !== -1) {
      processingQueue.value.splice(index, 1)
    }
  }

  function reset() {
    deleteAllPages()
  }

  // Queue Management Getters
  const activeOCRTasks = computed(() =>
    pages.value.filter(page => page.status === 'recognizing')
  )

  const queuedOCRTasks = computed(() => {
    return pages.value
      .filter(page => page.status === 'pending_ocr')
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
  })

  const ocrTaskCount = computed(() =>
    activeOCRTasks.value.length + queuedOCRTasks.value.length
  )

  // Queue Management Actions
  async function cancelOCRTasks(pageIds: string[]) {
    // 1. Import queueManager (do it once, not in loop)
    const { queueManager } = await import('@/services/queue')

    // 2. Cancel in QueueManager (Logic Layer)
    // This stops the processing if running, or prevents it from starting if queued
    pageIds.forEach(id => {
      queueManager.cancelOCR(id)
    })

    // 3. Update Store Status (UI Layer)
    // We revert status to 'ready' so user can try again
    const updates = pageIds.map(id => ({
      id,
      status: 'ready' as PageStatus,
      progress: 0,
      updatedAt: new Date()
    }))

    for (const update of updates) {
      updatePage(update.id, {
        status: update.status,
        progress: update.progress
      })

      // Add log
      addPageLog(update.id, {
        level: 'warning',
        message: 'OCR task cancelled by user'
      })
    }

    // 4. Update Database (Persistence Layer)
    try {
      // We can use a loop for now, or add a batch update method to DB later if needed
      await Promise.all(updates.map(u => db.updatePage(u.id, {
        status: u.status,
        progress: u.progress,
        updatedAt: u.updatedAt
      })))
    } catch (error) {
      storeLogger.error('[Pages Store] Failed to update DB after cancellation:', error)
    }
  }

  // Database actions
  async function loadPagesFromDB() {
    try {
      const dbPages = await db.getAllPagesForDisplay()
      pages.value = dbPages.map(dbPage => dbPageToPage(dbPage))
    } catch (error) {
      storeLogger.error('[Pages Store] Failed to load pages from DB:', error)
    } finally {
      isInitialized.value = true
    }
  }

  async function savePageToDB(page: Page) {
    try {
      const dbPage = { ...pageToDBPage(page), id: page.id }
      await db.savePage(dbPage)
    } catch (error) {
      storeLogger.error('[Pages Store] Failed to save page to DB:', error)
      throw error
    }
  }

  function deletePageFromDB(id: string) {
    return db.deletePage(id)
  }

  async function deletePagesFromDB(ids: string[]) {
    if (ids.length === 1 && ids[0]) {
      await db.deletePage(ids[0])
    } else if (ids.length > 1) {
      await db.deletePagesBatch(ids)
    }
  }

  async function reorderPages(updates: { id: string; order: number }[]) {
    try {
      await db.updatePagesOrder(updates)
      for (const update of updates) {
        const page = pages.value.find(p => p.id === update.id)
        if (page) {
          page.order = update.order
        }
      }
      pages.value.sort((a, b) => a.order - b.order)
    } catch (error) {
      storeLogger.error('[Pages Store] Failed to reorder pages in DB:', error)
    }
  }

  async function addFiles(inputFiles?: File[]) {
    try {
      let files: File[] | undefined | null = inputFiles

      if (!files) {
        files = await fileAddService.triggerFileSelect()
      }

      if (!files || files.length === 0) return { success: false, error: 'No files selected', pages: [] }

      // Serializing file processing to prevent order race conditions
      // This ensures that if addFiles is called multiple times rapidly,
      // the second call waits for the first one to complete its DB interactions.
      const processFilesTask = async () => {
        const result = await fileAddService.processFiles(files)

        if (result.success && result.pages) {
          // Prepare a promise to wait for PDF pages to be queued if we detect PDF processing
          const pdfFiles = files!.filter(f => f.type === 'application/pdf')
          const waitForPDFQueued = pdfFiles.length > 0
            ? waitForPDFQueuedPromise()
            : Promise.resolve()

          for (const pageData of result.pages) {
            const page = await addPage(pageData)
            await savePageToDB(page)
          }

          // Wait for all PDF pages to be at least queued in DB before returning
          await waitForPDFQueued
        }
        return result
      }

      // Chain the task
      const resultPromise = fileAdditionQueue.then(processFilesTask)

      // Update queue pointer, catch errors to keep chain alive
      fileAdditionQueue = resultPromise.catch(() => { }) as Promise<void>

      return resultPromise
    } catch (error) {
      storeLogger.error('[Pages Store] Error adding files:', error)
      return { success: false, error: 'Failed to add files', pages: [] }
    }
  }

  function pageToDBPage(page: Page): Omit<DBPage, 'id'> {
    return {
      fileName: page.fileName,
      fileSize: page.fileSize,
      fileType: page.fileType,
      origin: page.origin,
      status: page.status,
      progress: page.progress,
      ocrText: page.ocrText,
      thumbnailData: page.thumbnailData,
      width: page.width,
      height: page.height,
      outputs: JSON.parse(JSON.stringify(page.outputs)),
      logs: JSON.parse(JSON.stringify(page.logs)),
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      processedAt: page.processedAt,
      order: page.order
    }
  }

  function dbPageToPage(dbPage: DBPage): Page {
    return {
      ...dbPage,
      id: dbPage.id!,
      createdAt: dbPage.createdAt || new Date(),
      updatedAt: dbPage.updatedAt || new Date(),
      outputs: dbPage.outputs || [],
      logs: dbPage.logs || []
    }
  }

  function setupPDFEventListeners() {
    pdfEvents.on('pdf:page:queued', async ({ pageId }) => {
      if (pages.value.some(p => p.id === pageId)) return

      try {
        const dbPage = await db.getPage(pageId)
        if (dbPage) {
          const page = dbPageToPage(dbPage)
          pages.value.push(page)
          pages.value.sort((a, b) => a.order - b.order)
          storeLogger.info(`[Pages Store] Loaded queued page from DB: ${pageId}`)
        }
      } catch (error) {
        storeLogger.error(`[Pages Store] Failed to load queued page ${pageId} from DB:`, error)
      }
    })

    pdfEvents.on('pdf:page:rendering', ({ pageId }) => {
      updatePageStatus(pageId, 'rendering')
      addPageLog(pageId, {
        level: 'info',
        message: 'Page rendering started'
      })
    })

    pdfEvents.on('pdf:page:done', async ({ pageId, thumbnailData, width, height, fileSize }) => {
      let page = pages.value.find(p => p.id === pageId)

      if (!page) {
        try {
          const dbPage = await db.getPage(pageId)
          if (dbPage) {
            page = dbPageToPage(dbPage)
            pages.value.push(page)
            pages.value.sort((a, b) => a.order - b.order)
          }
        } catch (error) {
          storeLogger.error(`[Pages Store] Failed to load page ${pageId} from DB:`, error)
        }
      }

      if (page) {
        updatePage(pageId, {
          status: 'ready',
          progress: 100,
          thumbnailData,
          width,
          height,
          fileSize
        })

        addPageLog(pageId, {
          level: 'success',
          message: 'Page rendered successfully'
        })
      } else {
        storeLogger.error(`[Pages Store] Page ${pageId} not found in store or database`)
      }
    })

    pdfEvents.on('pdf:page:error', ({ pageId, error }) => {
      updatePageStatus(pageId, 'error')
      addPageLog(pageId, {
        level: 'error',
        message: `Rendering failed: ${error}`
      })
    })

    pdfEvents.on('pdf:progress', ({ done, total }) => {
      pdfProcessing.value.completed = done
      pdfProcessing.value.total = total
    })

    pdfEvents.on('pdf:processing-start', ({ file, totalPages }) => {
      pdfProcessing.value.active = true
      pdfProcessing.value.total = totalPages
      pdfProcessing.value.completed = 0
      pdfProcessing.value.currentFile = file.name
    })

    pdfEvents.on('pdf:processing-complete', () => {
      pdfProcessing.value.active = false
      pdfProcessing.value.currentFile = undefined
    })

    pdfEvents.on('pdf:log', ({ pageId, message, level }) => {
      addPageLog(pageId, { level: level || 'info', message })
    })

    pdfEvents.on('pdf:processing-error', ({ file, error }) => {
      storeLogger.error(`[Pages Store] Global PDF processing error for ${file?.name}:`, error)
    })
  }

  function setupOCREventListeners() {
    ocrEvents.on('ocr:queued', ({ pageId }) => {
      updatePageStatus(pageId, 'pending_ocr')
      addPageLog(pageId, {
        level: 'info',
        message: 'OCR task queued'
      })
      db.updatePage(pageId, { status: 'pending_ocr' }).catch(err => {
        storeLogger.error(`[Pages Store] Failed to update OCR status (queued) for ${pageId}:`, err)
      })
    })

    ocrEvents.on('ocr:start', ({ pageId }) => {
      updatePageStatus(pageId, 'recognizing')
      addPageLog(pageId, {
        level: 'info',
        message: 'OCR processing started'
      })
      db.updatePage(pageId, { status: 'recognizing' }).catch(err => {
        storeLogger.error(`[Pages Store] Failed to update OCR status (start) for ${pageId}:`, err)
      })
    })

    ocrEvents.on('ocr:success', ({ pageId, result }) => {
      updatePage(pageId, {
        status: 'ocr_success',
        ocrText: result.text
      })

      addPageLog(pageId, {
        level: 'success',
        message: 'OCR completed successfully'
      })

      db.updatePage(pageId, {
        status: 'ocr_success',
        ocrText: result.text,
        processedAt: new Date(),
        progress: 100
      }).catch(err => {
        storeLogger.error(`[Pages Store] Failed to update OCR status (success) for ${pageId}:`, err)
      })
    })

    ocrEvents.on('ocr:error', ({ pageId, error }) => {
      updatePageStatus(pageId, 'error')
      addPageLog(pageId, {
        level: 'error',
        message: `OCR failed: ${error.message}`
      })
      db.updatePage(pageId, { status: 'error' }).catch(err => {
        storeLogger.error(`[Pages Store] Failed to update OCR status (error) for ${pageId}:`, err)
      })
    })
  }

  function setupDocGenEventListeners() {
    ocrEvents.on('doc:gen:queued', async ({ pageId }) => {
      try {
        await db.updatePage(pageId, { status: 'pending_gen' })
        updatePageStatus(pageId, 'pending_gen')
        addPageLog(pageId, {
          level: 'info',
          message: 'Generation task queued'
        })
      } catch (err) {
        storeLogger.error(`[Pages Store] Failed to update status (queued) for ${pageId}:`, err)
        addPageLog(pageId, { level: 'error', message: 'Failed to update status in DB' })
      }
    })

    ocrEvents.on('doc:gen:start', async ({ pageId, type }) => {
      const statusMap: Record<string, PageStatus> = {
        markdown: 'generating_markdown',
        pdf: 'generating_pdf',
        docx: 'generating_docx'
      }
      const newStatus = statusMap[type] || 'completed'

      try {
        await db.updatePage(pageId, { status: newStatus })
        updatePageStatus(pageId, newStatus)
        addPageLog(pageId, {
          level: 'info',
          message: `Started generating ${type}`
        })
      } catch (err) {
        storeLogger.error(`[Pages Store] Failed to update status (start) for ${pageId} (${type}):`, err)
        addPageLog(pageId, { level: 'error', message: `Failed to update status in DB for ${type}` })
      }
    })

    ocrEvents.on('doc:gen:success', async ({ pageId, type }) => {
      const statusMap: Record<string, PageStatus> = {
        markdown: 'markdown_success',
        pdf: 'pdf_success',
        docx: 'completed'
      }
      const newStatus = statusMap[type] || 'completed'

      try {
        // DB-First for terminal or important intermediate states
        await db.updatePage(pageId, {
          status: newStatus,
          processedAt: new Date(),
          // We don't store the full content here, it's in specific tables
          // but we add a log entry/output placeholder
        })

        updatePageStatus(pageId, newStatus)
        addPageLog(pageId, {
          level: 'success',
          message: `Generated ${type} successfully`
        })

        addOutput(pageId, {
          format: type as 'markdown' | 'text' | 'html',
          content: `(Saved to DB)`
        })
      } catch (err) {
        storeLogger.error(`[Pages Store] Failed to update status (success) for ${pageId} (${type}):`, err)
        // If it's a final state and DB failed, mark as error to avoid misleading users
        updatePageStatus(pageId, 'error')
        addPageLog(pageId, {
          level: 'error',
          message: `Critical: Generated ${type} but failed to save status to DB. Data might be lost on refresh.`
        })
      }
    })

    ocrEvents.on('doc:gen:error', ({ pageId, type, error }) => {
      updatePageStatus(pageId, 'error')
      addPageLog(pageId, {
        level: 'error',
        message: `Failed to generate ${type}: ${error.message}`
      })
      db.updatePage(pageId, { status: 'error' }).catch(err => {
        storeLogger.error(`[Pages Store] Failed to update status (error) for ${pageId}:`, err)
      })
    })
  }


  setupPDFEventListeners()
  setupOCREventListeners()
  setupDocGenEventListeners()

  return {
    pages,
    selectedPageIds,
    processingQueue,
    pdfProcessing,
    showOverlay,
    pagesByStatus,
    selectedPages,
    processingPages,
    completedPages,
    totalPages,
    overallProgress,
    addPage,
    updatePage,
    updatePageProgress,
    updatePageStatus,
    addPageLog,
    setOcrResult,
    addOutput,
    selectPage,
    deselectPage,
    togglePageSelection,
    selectAllPages,
    clearSelection,
    setShowOverlay,
    deletePage,
    deletePages,
    deleteAllPages,
    addToProcessingQueue,
    removeFromProcessingQueue,
    reset,
    loadPagesFromDB,
    savePageToDB,
    deletePageFromDB,
    deletePagesFromDB,
    reorderPages,
    addFiles,
    setupPDFEventListeners,
    setupOCREventListeners,
    setupDocGenEventListeners,
    // Queue Management
    activeOCRTasks,
    queuedOCRTasks,
    ocrTaskCount,
    cancelOCRTasks,
    isInitialized
  }
})