<template>
  <NDropdown
    placement="bottom-end"
    data-testid="language-selector-dropdown"
    trigger="click"
    :options="languageOptions"
    @select="handleLanguageChange"
  >
    <NButton
      quaternary
      circle
      size="small"
      class="lang-selector-btn"
      data-testid="language-selector-button"
    >
      <template #icon>
        <NIcon size="20">
          <LanguageOutline />
        </NIcon>
      </template>
    </NButton>
  </NDropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NIcon, NDropdown } from 'naive-ui'
import { LanguageOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { setLocale, type SupportedLocale } from '@/i18n'

const { locale } = useI18n()

const languageOptions = computed(() => [
  {
    label: 'English',
    key: 'en',
    disabled: locale.value === 'en'
  },
  {
    label: '简体中文',
    key: 'zh-CN',
    disabled: locale.value === 'zh-CN'
  },
  {
    label: '繁體中文',
    key: 'zh-TW',
    disabled: locale.value === 'zh-TW'
  },
  {
    label: '日本語',
    key: 'ja-JP',
    disabled: locale.value === 'ja-JP'
  }
])


function handleLanguageChange(key: string) {
  setLocale(key as SupportedLocale)
}
</script>

<style scoped>
/* No additional styles needed */
</style>
