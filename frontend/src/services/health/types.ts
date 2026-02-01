export interface HealthResponse {
    status: 'healthy' | 'busy' | 'full'
    backend: string
    platform: string
    model_loaded: boolean
    // Original queue fields for backward compatibility/simple display
    ocr_queue?: {
        depth: number
        max_size: number
        is_full: boolean
    }
    // New rate limiting fields
    rate_limits?: {
        max_per_client: number
        max_per_ip: number
        active_clients: number
        active_ips: number
    }
    // New personalized queue status
    your_queue_status?: {
        client_id: string
        position: number | null
        total_queued: number
    }
}

export interface HealthCheckState {
    isHealthy: boolean
    lastCheckTime: Date | null
    healthInfo: HealthResponse | null
    error: Error | null
}

export type RateLimitReason = 'queue_full' | 'client_limit' | 'ip_limit' | 'unknown'
