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
  background: radial-gradient(ellipse at 50% 42%, #393a3c 0%, #252628 38%, #111214 100%);
  border-radius: 22px;
  overflow: hidden;
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
  left: 18px;
  bottom: 14px;
  padding: 6px 10px;
  font-size: var(--fs-2xs);
  line-height: 1.6;
  color: #a2a3a5;
  background: rgb(20 21 22 / 72%);
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 14px;
  pointer-events: none;
  user-select: none;
}
</style>
