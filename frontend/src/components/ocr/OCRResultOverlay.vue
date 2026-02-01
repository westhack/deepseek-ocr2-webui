<template>
  <div class="ocr-result-overlay">
    <div
      v-for="(boxItem, index) in computedBoxes"
      :key="index"
      class="ocr-box"
      :style="getBoxStyle(boxItem.box, boxItem.label)"
      :title="boxItem.label"
    >
      <div 
        class="box-label"
        :style="{ backgroundColor: getLabelColor(boxItem.label) }"
      >
        {{ boxItem.label }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { parseOCRBoxes } from '@/services/ocr/parser'
import type { OCRBox } from '@/services/ocr'

interface Props {
  rawText?: string
  imageDims?: { w: number; h: number }
}

const props = defineProps<Props>()

/**
 * Computed boxes parsed from rawText.
 * Throws error if rawText is missing as per user requirement.
 */
const computedBoxes = computed<OCRBox[]>(() => {
  if (!props.rawText) {
    throw new Error('OCRResultOverlay: rawText is required but missing')
  }
  
  const dims = props.imageDims || { w: 1000, h: 1000 }
  return parseOCRBoxes(props.rawText, dims)
})

/**
 * Convert [x1, y1, x2, y2] pixel coordinates to CSS percentage style
 * Uses imageDims for proper scaling, falls back to 1000x1000 for normalized coords
 */
function getBoxStyle(box: [number, number, number, number], label: string) {
  const [x1, y1, x2, y2] = box
  
  // Use image dimensions if provided, otherwise fallback to 1000x1000
  const imgW = props.imageDims?.w || 1000
  const imgH = props.imageDims?.h || 1000
  
  const left = ((x1 / imgW) * 100).toFixed(2)
  const top = ((y1 / imgH) * 100).toFixed(2)
  const width = (((x2 - x1) / imgW) * 100).toFixed(2)
  const height = (((y2 - y1) / imgH) * 100).toFixed(2)

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
    borderColor: getLabelColor(label || 'default')
  }
}

const COLOR_MAP: Record<string, string> = {
  'title': '#dc2626', // Red
  'text': '#2563eb',  // Blue
  'table': '#16a34a', // Green
  'figure': '#db2777', // Pink
  'image': '#9333ea', // Purple
  'default': '#ea580c' // Orange
}

const PALETTE = [
  '#dc2626', '#2563eb', '#16a34a', '#db2777', '#9333ea', '#ea580c', '#0891b2', '#4f46e5'
]

function getLabelColor(label: string): string {
  const color = COLOR_MAP[label.toLowerCase()]
  if (color) {
    return color
  }
  // Generate deterministic color from string hash for custom labels (e.g. found objects)
  let hash = 0
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash % PALETTE.length)
  return PALETTE[index] || PALETTE[0]!
}
</script>

<style scoped>
.ocr-result-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Let clicks pass through to image/container */
  z-index: 10;
}

.ocr-box {
  position: absolute;
  border: 2px solid;
  /* box-sizing: border-box included by default in most resets, but explicit is good */
  box-sizing: border-box;
}

.box-label {
  position: absolute;
  top: -20px; /* Position above the box */
  left: -2px; /* Align with border */
  padding: 2px 6px;
  color: white;
  font-size: 11px;
  font-weight: bold;
  border-radius: 2px;
  white-space: nowrap;
  pointer-events: auto; /* Allow hovering label if needed */
  line-height: 1.2;
}
</style>
