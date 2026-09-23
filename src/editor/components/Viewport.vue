<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { initEditor } from '../store/editor'
import { getEngine } from '../core/engineHolder'

const canvasRef = ref(null)

onMounted(async () => {
  await initEditor(canvasRef.value)
})

onBeforeUnmount(() => {
  getEngine()?.dispose()
})
</script>

<template>
  <div class="viewport">
    <canvas ref="canvasRef"></canvas>
    <div class="viewport-hint">左键旋转 · 右键平移 · 滚轮缩放 · 点击物体选择</div>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  background: #05070d;
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
  left: 12px;
  bottom: 10px;
  font-size: 12px;
  color: #5d6b85;
  pointer-events: none;
  user-select: none;
}
</style>
