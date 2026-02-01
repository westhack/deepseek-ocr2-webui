import { consola } from 'consola'
import { getClientId } from '@/services/clientId'
import type { HealthResponse } from './types'

const healthLogger = consola.withTag('Health')

export class HealthCheckService {
    private intervalId: number | null = null
    private isHealthy: boolean = true
    private lastCheckTime: Date | null = null
    private healthInfo: HealthResponse | null = null
    private readonly checkInterval: number = 5000 // 5 seconds
    private readonly timeout: number = 60000 // 60 seconds
    private readonly apiBaseUrl: string

    constructor(apiBaseUrl: string) {
        this.apiBaseUrl = apiBaseUrl
    }

    /**
     * Start health check polling
     */
    start(): void {
        // Prevent duplicate intervals
        if (this.intervalId !== null) {
            healthLogger.warn('[HealthCheckService] Already running')
            return
        }

        healthLogger.info('[HealthCheckService] Starting health check')

        // Set a non-null value to indicate running state
        this.intervalId = 1

        // Start the polling loop
        this.pollLoop()
    }

    /**
     * Polling loop that waits for each check to complete before scheduling the next
     */
    private async pollLoop(): Promise<void> {
        // Check if service has been stopped
        if (this.intervalId === null) {
            return
        }

        // Perform health check and wait for completion
        await this.performCheck()

        // Check again if service has been stopped during the check
        if (this.intervalId === null) {
            return
        }

        // Wait for the check interval, then schedule next check
        setTimeout(() => {
            this.pollLoop()
        }, this.checkInterval)
    }

    /**
     * Stop health check polling
     */
    stop(): void {
        if (this.intervalId !== null) {
            this.intervalId = null
            healthLogger.info('[HealthCheckService] Stopped health check')
        }
    }

    /**
     * Get current health status
     */
    getStatus(): boolean {
        return this.isHealthy
    }

    /**
     * Get health info from last successful check
     */
    getHealthInfo(): HealthResponse | null {
        return this.healthInfo
    }

    /**
     * Get last check time
     */
    getLastCheckTime(): Date | null {
        return this.lastCheckTime
    }

    /**
     * Perform a single health check
     */
    private async performCheck(): Promise<void> {
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), this.timeout)

            const response = await fetch(`${this.apiBaseUrl}/health`, {
                signal: controller.signal,
                headers: {
                    'X-Client-ID': getClientId()
                }
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data: HealthResponse = await response.json()

            // Update state
            this.lastCheckTime = new Date()

            // Service is healthy if it responds successfully
            // Even 'busy' and 'full' states mean the service is operational
            if (!this.isHealthy) {
                healthLogger.success('[HealthCheckService] OCR service recovered')
            }
            this.isHealthy = true
            this.healthInfo = data

            // Log status changes for monitoring
            if (data.status !== 'healthy') {
                healthLogger.warn('[HealthCheckService] OCR service status', { status: data.status })
            }
        } catch (error) {
            // Update state
            this.lastCheckTime = new Date()

            if (this.isHealthy) {
                healthLogger.error('[HealthCheckService] OCR service is unavailable', error)
            }

            this.isHealthy = false
            this.healthInfo = null
        }
    }
}

export type { HealthResponse } from './types'
