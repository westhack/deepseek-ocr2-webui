import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { HealthCheckService } from '@/services/health'
import type { HealthResponse } from '@/services/health'
import { config } from '@/config'

export const useHealthStore = defineStore('health', () => {
    // State
    const isHealthy = ref(true)
    const healthInfo = ref<HealthResponse | null>(null)
    const lastCheckTime = ref<Date | null>(null)
    const error = ref<Error | null>(null)

    // Private members
    let healthService: HealthCheckService | null = null
    let checkInterval: number | null = null

    /**
     * Start health check polling
     */
    function startHealthCheck() {
        // Create service instance if not exists
        if (!healthService) {
            healthService = new HealthCheckService(config.apiBaseUrl)
        }

        // Start the service
        healthService.start()

        // Update status immediately
        updateStatus()

        // Set up periodic status updates
        if (checkInterval === null) {
            checkInterval = window.setInterval(() => {
                updateStatus()
            }, 1000) // Update UI every second
        }
    }

    /**
     * Stop health check polling
     */
    function stopHealthCheck() {
        if (healthService) {
            healthService.stop()
        }

        if (checkInterval !== null) {
            window.clearInterval(checkInterval)
            checkInterval = null
        }
    }

    /**
     * Update status from health service
     */
    function updateStatus() {
        if (!healthService) return

        isHealthy.value = healthService.getStatus()
        healthInfo.value = healthService.getHealthInfo()
        lastCheckTime.value = healthService.getLastCheckTime()
    }

    // Computed properties for easy access
    const queueStatus = computed(() => healthInfo.value?.ocr_queue)
    const rateLimits = computed(() => healthInfo.value?.rate_limits)
    const yourQueueStatus = computed(() => healthInfo.value?.your_queue_status)

    // Status helpers
    const isBusy = computed(() => {
        if (!healthInfo.value) return false
        return healthInfo.value.status === 'busy'
    })

    const isFull = computed(() => {
        if (!healthInfo.value) return false
        return healthInfo.value.status === 'full'
    })

    // Queue position helpers
    const queuePosition = computed(() => {
        return healthInfo.value?.your_queue_status?.position ?? null
    })

    const isProcessing = computed(() => {
        return queuePosition.value === 1
    })

    const isQueued = computed(() => {
        return (queuePosition.value ?? 0) > 1
    })

    return {
        // State
        isHealthy,
        healthInfo,
        lastCheckTime,
        error,

        // Computed
        queueStatus,
        rateLimits,
        yourQueueStatus,
        isBusy,
        isFull,
        queuePosition,
        isProcessing,
        isQueued,

        // Actions
        startHealthCheck,
        stopHealthCheck,
        updateStatus
    }
})
