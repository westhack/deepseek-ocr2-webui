<template>
  <NBadge
    :dot="true"
    :color="statusColor"
    :processing="!isHealthy"
    :offset="compact ? [-2, 2] : [0, 0]"
  >
    <NTooltip
      v-bind="tooltipProps"
      :theme-overrides="{
        color: statusColor,
        textColor: '#fff'
      }"
    >
      <template #trigger>
        <NButton
          text
          size="small"
          :type="buttonType"
          class="health-indicator-btn"
          :class="{ 'is-compact': compact }"
        >
          <template #icon>
            <NIcon :component="StatusIcon" />
          </template>
          <span v-if="!compact">{{ $t('health.ocrService') }}</span>
        </NButton>
      </template>
      <div class="health-tooltip">
        <div class="health-status">
          <strong>{{ $t('health.status') }}:</strong> {{ statusText }}
        </div>
        <template v-if="healthInfo">
          <div><strong>{{ $t('health.backend') }}:</strong> {{ healthInfo.backend }}</div>
          <div><strong>{{ $t('health.platform') }}:</strong> {{ healthInfo.platform }}</div>
          <div v-if="healthInfo.ocr_queue">
            <strong>{{ $t('health.queue') }}:</strong> {{ healthInfo.ocr_queue.depth }} / {{ healthInfo.ocr_queue.max_size }}
          </div>
          <div v-if="isBusy">
            {{ $t('health.busyTooltip') }}
          </div>
          <div v-if="isFull">
            {{ $t('health.fullTooltip') }}
          </div>
        </template>
        <div
          v-if="lastCheckTime"
          class="health-time"
        >
          {{ $t('health.lastCheck') }}: {{ formatTime(lastCheckTime) }}
        </div>
      </div>
    </NTooltip>
  </NBadge>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NBadge, NButton, NIcon, NTooltip } from 'naive-ui'
import { HeartOutline, AlertCircleOutline } from '@vicons/ionicons5'
import { useHealthStore } from '@/stores/health'
import { PRIMARY_COLOR } from '@/theme/vars'


// No props needed
defineProps<{
  compact?: boolean
}>()

const { t } = useI18n()
const healthStore = useHealthStore()

const isHealthy = computed(() => healthStore.isHealthy)
const healthInfo = computed(() => healthStore.healthInfo)
const lastCheckTime = computed(() => healthStore.lastCheckTime)

const isBusy = computed(() => healthStore.isBusy)
const isFull = computed(() => healthStore.isFull)

const statusColor = computed(() => {
  if (isFull.value) return '#d03050' // Red
  if (isBusy.value) return '#f0a020' // Orange/Yellow
  return isHealthy.value ? PRIMARY_COLOR : '#d03050'
})

const buttonType = computed(() => {
  if (isFull.value) return 'error'
  if (isBusy.value) return 'warning'
  return isHealthy.value ? 'success' : 'error'
})

const StatusIcon = computed(() => {
  return isHealthy.value ? HeartOutline : AlertCircleOutline
})

const statusText = computed(() => {
  if (isFull.value) return t('health.full')
  if (isBusy.value) return t('health.busy')
  return isHealthy.value ? t('health.healthy') : t('health.unavailable')
})

function formatTime(date: Date): string {
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diff < 10) return t('health.justNow')
  if (diff < 60) return t('health.ago', [diff])
  if (diff < 3600) return t('health.minutesAgo', [Math.floor(diff / 60)])
  return date.toLocaleTimeString()
}

// Tooltip props for consistent style
const tooltipProps = {
  placement: 'bottom' as const,
  trigger: 'hover' as const
}
</script>

<style scoped>
.health-indicator-btn {
  padding: 0 4px;
  height: 24px;
}

.health-indicator-btn.is-compact {
  padding: 0;
  width: 24px;
  justify-content: center;
}

.health-tooltip {
  font-size: 12px;
  line-height: 1.6;
}

.health-status {
  margin-bottom: 4px;
}

.health-time {
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.8;
}
</style>
