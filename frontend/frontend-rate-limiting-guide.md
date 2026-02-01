# Frontend Rate Limiting Integration Guide

## Background

The backend has implemented Client ID + IP composite rate limiting. This document provides a complete integration guide for frontend developers.

---

## Backend API Reference

### GET `/health` - Health Check

**Request Headers** (optional):

| Header | Description |
|--------|-------------|
| `X-Client-ID` | Client unique identifier (if provided, returns queue position) |

**Response Example 1**: Idle state

```json
{
  "status": "healthy",
  "backend": "cuda",
  "platform": "Linux",
  "model_loaded": true,
  "ocr_queue": {
    "depth": 2,
    "max_size": 8,
    "is_full": false
  },
  "rate_limits": {
    "max_per_client": 1,
    "max_per_ip": 4,
    "active_clients": 2,
    "active_ips": 1
  }
}
```

**Response Example 2**: With `X-Client-ID` and in queue

```json
{
  "status": "busy",
  "ocr_queue": { "depth": 5, "max_size": 8, "is_full": false },
  "your_queue_status": {
    "client_id": "abc-123-def",
    "position": 3,
    "total_queued": 5
  }
}
```

**`status` Field Values**:

| Value | Condition | Description |
|-------|-----------|-------------|
| `healthy` | depth < max/2 | Queue idle, new requests processed immediately |
| `busy` | max/2 ≤ depth < max | Queue busy, new requests will be queued |
| `full` | depth ≥ max | Queue full, new requests will be rejected |

---

### POST `/ocr` - OCR Recognition

**Request Headers**:

| Header | Description |
|--------|-------------|
| `X-Client-ID` | Client unique identifier (required for rate limiting) |

**Success Response** (200):

```json
{
  "success": true,
  "text": "Recognized text content",
  "raw_text": "Raw text",
  "boxes": [],
  "image_dims": { "w": 800, "h": 600 }
}
```

**Rate Limited Response** (429):

```json
{ "detail": "OCR queue full, please retry later" }
```

```json
{ "detail": "Client at max concurrency (1)" }
```

```json
{ "detail": "IP at max concurrency (4)" }
```

---

## Frontend Changes

### Phase 1: Client ID Service

**New file**: `src/services/clientId.ts`

```typescript
const SESSION_KEY = 'ocr-client-id'

export function getClientId(): string {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
        id = crypto.randomUUID()
        sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
}
```

---

### Phase 2: OCR Request Header

**Modify**: `src/services/ocr/providers.ts`

```diff
+ import { getClientId } from '@/services/clientId'

  const response = await fetch(url, {
      method: 'POST',
      body: formData,
-     signal: options?.signal
+     signal: options?.signal,
+     headers: { 'X-Client-ID': getClientId() }
  })
```

---

### Phase 3: Health Request Header

**Modify**: `src/services/health/index.ts`

```diff
+ import { getClientId } from '@/services/clientId'

  const response = await fetch(`${this.apiBaseUrl}/health`, {
-     signal: controller.signal
+     signal: controller.signal,
+     headers: { 'X-Client-ID': getClientId() }
  })
```

**New types**: `src/services/health/types.ts`

```typescript
export interface HealthResponse {
    status: 'healthy' | 'busy' | 'full'
    ocr_queue: {
        depth: number
        max_size: number
        is_full: boolean
    }
    rate_limits: {
        max_per_client: number
        max_per_ip: number
        active_clients: number
        active_ips: number
    }
    your_queue_status?: {
        client_id: string
        position: number | null
        total_queued: number
    }
}
```

---

### Phase 4: 429 Error Handling

**Rate limit reason parsing**:

```typescript
type RateLimitReason = 'queue_full' | 'client_limit' | 'ip_limit' | 'unknown'

function parseRateLimitReason(detail: string): RateLimitReason {
    if (detail.includes('queue full')) return 'queue_full'
    if (detail.includes('Client at max')) return 'client_limit'
    if (detail.includes('IP at max')) return 'ip_limit'
    return 'unknown'
}
```

**User-friendly messages**:

| Reason | User Message |
|--------|--------------|
| `queue_full` | 🔴 Service is overloaded, please try again later |
| `client_limit` | ⏳ You already have a request in progress |
| `ip_limit` | 🚫 Too many requests from your network |

---

### Phase 5: Status Indicator UI

**Display based on `status`**:

| status | Icon | Color |
|--------|------|-------|
| `healthy` | 🟢 | Green |
| `busy` | 🟡 | Yellow |
| `full` | 🔴 | Red |

**Queue position hint** (when `position` has value):

```
🔄 Your request is #3 in queue (5 total)
```

---

## Verification

```bash
cd frontend
npm run test -- src/services/clientId.test.ts
npm run test -- src/services/ocr/providers.test.ts
```
