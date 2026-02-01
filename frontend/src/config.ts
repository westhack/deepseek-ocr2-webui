export interface AppConfig {
    apiBaseUrl: string
}

const DEV_API_BASE_URL = 'http://127.0.0.1:8000'

const PROD_API_BASE_URL = ''

export const config: AppConfig = {
    /**
     * API Base URL selection priority:
     * 1. Environment Variable: VITE_API_BASE_URL (Injected during CI/CD, e.g., GitHub Actions)
     * 2. Development Mode: DEV_API_BASE_URL (Used during local `npm run dev`)
     * 3. Production Default: PROD_API_BASE_URL (Fallback for local `npm run build`)
     */
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL
        || (import.meta.env.DEV ? DEV_API_BASE_URL : PROD_API_BASE_URL),
}
