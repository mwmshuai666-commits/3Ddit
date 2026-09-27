<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { initEditor } from '../store/editor'
import { getEngine } from '../core/engineHolder'
import DatavEffects from './DatavEffects.vue'

const canvasRef = ref(null)
const scene = ref(null)

onMounted(async () => {
  await initEditor(canvasRef.value)
  // 引擎（含 scene）就绪后再挂特效组件，顺序不能反
  scene.value = getEngine()?.scene || null
})

onBeforeUnmount(() => {
  getEngine()?.dispose()
})
</script>

<template>
  <div class="viewport">
    <canvas ref="canvasRef"></canvas>
    <DatavEffects v-if="scene" :scene="scene" />
    <div class="viewport-hint">左键旋转 · 右键平移 · 滚轮缩放 · 点击物体选择</div>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  background: var(--c-viewport);
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
  touch-action: none;
}
.viewport-hint {
  position: absolute;
  left: var(--s-4);
  bottom: var(--s-2);
  font-size: var(--fs-2xs);
  line-height: 1.6;
  color: var(--t-faint);
  pointer-events: none;
  user-select: none;
}
</style>
