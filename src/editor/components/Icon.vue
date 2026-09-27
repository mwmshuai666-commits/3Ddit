<script setup>
/**
 * <Icon name="trash" :size="14" />
 *
 * 内容来自 icons.js 的硬编码常量，不是用户输入，所以 v-html 在这里是安全的。
 * 用户手写的 HTML 走的是 core/htmlPanel.js 那套栅格化 + sanitizeMarkup，
 * 跟这个组件没有任何关系，别把两件事混起来。
 */
import { computed } from 'vue'
import { ICONS } from './icons'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 14 },
})

const shape = computed(() => ICONS[props.name] || ICONS.box)
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="shape"
  />
</template>

<style scoped>
.icon {
  display: block;
  flex-shrink: 0;
}
</style>
