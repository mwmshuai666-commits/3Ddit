<script setup>
/**
 * 中间视口：画布 + 浮在画布上的一层薄 chrome。
 *
 * 浮层刻意只放三样东西 —— 空场景时的引导、视角/变换工具的胶囊、上传 FAB。
 * 它们都是「看着场景才会用」的操作，做成浮层而不是挤进面板，面板就能一直保持窄。
 */
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { initEditor, editor, saveNow, frameSelected, setGizmoMode, requestModelUpload } from '../store/editor'
import { getEngine } from '../core/engineHolder'
import DatavEffects from './DatavEffects.vue'
import Icon from './Icon.vue'

const canvasRef = ref(null)
const scene = ref(null)

const TOOLS = [
  { mode: 'translate', label: '移动', icon: 'move', key: 'W' },
  { mode: 'rotate', label: '旋转', icon: 'rotate', key: 'E' },
  { mode: 'scale', label: '缩放', icon: 'scale', key: 'R' },
]

function onKey(evt) {
  if (evt.metaKey || evt.ctrlKey || evt.altKey) return
  const el = document.activeElement
  // 正在打字的时候快捷键让给输入框，否则按 W 会切工具
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
  const hit = TOOLS.find((t) => t.key === evt.key.toUpperCase())
  if (hit) setGizmoMode(hit.mode)
}

onMounted(async () => {
  await initEditor(canvasRef.value)
  // 引擎（含 scene）就绪后再挂特效组件，顺序不能反
  scene.value = getEngine()?.scene || null
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  getEngine()?.dispose()
})
</script>

<template>
  <div class="viewport">
    <canvas ref="canvasRef"></canvas>
    <DatavEffects v-if="scene" :scene="scene" />

    <!-- 空场景引导：只有一块底板的时候才说这句话，别在新手头上叠一层 -->
    <div v-if="editor.loaded && editor.doc.nodes.length === 0" class="hero">
      <span class="hero-logo"><Icon name="cube" :size="22" /></span>
      <h2>准备好创造你的 3D 场景了吗？</h2>
      <p>从左边选一个几何体丢进场景，或者上传自己的 GLB 模型</p>
    </div>

    <!-- 工具胶囊：移动/旋转/缩放 + 聚焦/保存 -->
    <div class="tool-pill">
      <button
        v-for="t in TOOLS"
        :key="t.mode"
        class="tool-btn"
        :class="{ active: editor.gizmoMode === t.mode }"
        :title="`${t.label}（${t.key}）`"
        @click="setGizmoMode(t.mode)"
      >
        <Icon :name="t.icon" :size="15" />
      </button>
      <span class="tool-sep"></span>
      <button class="tool-btn" title="聚焦到选中物体（F）" @click="frameSelected()">
        <Icon name="crosshair" :size="15" />
      </button>
      <button
        class="tool-btn"
        :class="{ dot: editor.dirty }"
        :title="editor.dirty ? '有未保存更改（自动保存会在停手 0.8 秒后跑）' : '已是最新'"
        @click="saveNow()"
      >
        <Icon name="save" :size="15" />
      </button>
    </div>

    <!-- 上传模型：Tripo 那颗圆钮的对应物 -->
    <button class="fab" title="上传 GLB 模型" @click="requestModelUpload()">
      <Icon name="plus" :size="20" />
    </button>

    <div class="viewport-hint">左键旋转 · 右键平移 · 滚轮缩放 · 点击物体选择</div>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  /* 中心聚光：整页只亮这一块，面板和其他 chrome 都压在暗底上 */
  background:
    radial-gradient(ellipse 62% 58% at 50% 45%, rgb(126 130 140 / 22%) 0%, transparent 70%),
    radial-gradient(ellipse at 50% 42%, #2f3135 0%, #1c1e21 42%, var(--c-viewport) 100%);
  border-radius: var(--r-card);
  overflow: hidden;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
  touch-action: none;
}

/* ---- 空场景引导 ---- */
.hero {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  padding: var(--s-4);
  text-align: center;
  pointer-events: none;
}
.hero-logo {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: var(--s-2);
  border-radius: var(--r-md);
  background: var(--grad-accent);
  color: var(--on-accent);
  box-shadow: var(--glow-accent);
}
.hero h2 {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: 600;
  color: var(--t-strong);
}
.hero p {
  margin: 0;
  max-width: 34em;
  font-size: var(--fs-md);
  line-height: 1.7;
  color: var(--t-muted);
}

/* ---- 工具胶囊 ---- */
.tool-pill {
  position: absolute;
  top: var(--s-3);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-1);
  background: linear-gradient(150deg, rgb(255 255 255 / 11%), rgb(255 255 255 / 5%));
  border: 1px solid var(--c-glass-strong);
  border-radius: var(--r-pill);
  box-shadow: var(--shadow-pop);
  backdrop-filter: blur(14px);
}
.tool-btn {
  position: relative;
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--t-muted);
  cursor: pointer;
  transition:
    color var(--dur) var(--ease),
    background var(--dur) var(--ease);
}
.tool-btn:hover {
  color: var(--t-strong);
  background: rgb(255 255 255 / 8%);
}
/* 选中的工具用强调色：一眼看出现在在移动还是在旋转 */
.tool-btn.active {
  color: var(--accent);
  background: var(--accent-soft);
}
.tool-btn.dot::after {
  content: '';
  position: absolute;
  top: 5px;
  right: 6px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}
.tool-sep {
  width: 1px;
  height: 18px;
  margin: 0 var(--s-1);
  background: var(--c-glass-strong);
}

/* ---- 上传 FAB ---- */
.fab {
  position: absolute;
  right: var(--s-4);
  bottom: var(--s-4);
  width: 42px;
  height: 42px;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--grad-accent);
  color: var(--on-accent);
  cursor: pointer;
  box-shadow: 0 0 0 4px rgb(255 212 41 / 10%), var(--glow-accent);
  transition:
    transform var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease);
}
.fab:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 0 0 5px rgb(255 212 41 / 14%), 0 12px 26px rgb(255 212 41 / 30%);
}
.fab:active {
  transform: translateY(0) scale(0.97);
}

.viewport-hint {
  position: absolute;
  left: var(--s-3);
  bottom: var(--s-3);
  padding: 6px var(--s-3);
  font-size: var(--fs-2xs);
  line-height: 1.6;
  color: var(--t-faint);
  background: rgb(16 17 19 / 72%);
  border: 1px solid var(--c-glass);
  border-radius: var(--r-pill);
  pointer-events: none;
  user-select: none;
}
</style>
