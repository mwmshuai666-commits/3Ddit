<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import Toolbar from './editor/components/Toolbar.vue'
import LeftPanel from './editor/components/LeftPanel.vue'
import Viewport from './editor/components/Viewport.vue'
import Inspector from './editor/components/Inspector.vue'
import { getEngine } from './editor/core/engineHolder'
import { auth } from './store/auth'
import {
  editor,
  setGizmoMode,
  frameSelected,
  removeNode,
  findNode,
  GROUND_SELECTION,
} from './editor/store/editor'

/** 渲染健康度。每秒读一次就够——放在 onAfterRender 里每帧更新会白白触发响应式 */
const fps = ref(0)
const meshes = ref(0)
let tick = null

function sample() {
  const engine = getEngine()
  if (!engine?.engine) return
  fps.value = engine.engine.getFps()
  meshes.value = engine.scene?.getActiveMeshes().length || 0
}

function isTyping(target) {
  const tag = target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable
}

/** 状态栏显示名称而不是内部 id */
function selectedName() {
  if (!editor.selectedId) return null
  if (editor.selectedId === GROUND_SELECTION) return '场景底板'
  return findNode(editor.selectedId)?.name || editor.selectedId
}

const accountLabel = () =>
  auth.status === 'authed' ? `已登录 · ${auth.user?.displayName || auth.user?.username || ''}` : '未登录'

function onKeydown(e) {
  if (isTyping(e.target)) return
  switch (e.key.toLowerCase()) {
    case 'w':
      setGizmoMode('translate')
      break
    case 'e':
      setGizmoMode('rotate')
      break
    case 'r':
      setGizmoMode('scale')
      break
    case 'f':
      frameSelected()
      break
    case 'delete':
    case 'backspace':
      if (editor.selectedId && editor.selectedId !== GROUND_SELECTION) {
        removeNode(editor.selectedId)
      }
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  tick = setInterval(sample, 1000)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearInterval(tick)
})
</script>

<template>
  <div class="editor-shell">
    <Toolbar />
    <div class="editor-body">
      <LeftPanel />
      <Viewport />
      <Inspector />
    </div>
    <footer class="status-bar">
      <span>节点数：{{ editor.doc.nodes.length }}</span>
      <span v-if="selectedName()">已选中：{{ selectedName() }}</span>
      <div class="spacer"></div>
      <span class="mono">{{ fps }} FPS · {{ meshes }} 网格</span>
      <span class="dot" :class="auth.status === 'authed' ? 'on' : 'off'"></span>
      <span>{{ accountLabel() }}</span>
      <span class="hint">W 移动 · E 旋转 · R 缩放 · F 聚焦 · Delete 删除</span>
    </footer>
  </div>
</template>

<style scoped>
.editor-shell {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--c-app);
  color: var(--t-body);
  font-size: var(--fs-md);
  overflow: hidden;
}
.editor-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.status-bar {
  height: var(--h-status);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--s-4);
  padding: 0 var(--s-4);
  font-size: var(--fs-xs);
  color: var(--t-muted);
  background: var(--c-panel);
  border-top: 1px solid var(--c-line);
}
.status-bar .spacer {
  flex: 1;
}
/* 会跳动的数字统一用等宽位宽，避免每秒重绘时整行左右抖 */
.status-bar .mono {
  font-variant-numeric: tabular-nums;
  color: var(--t-muted);
  white-space: nowrap;
}
.status-bar .hint {
  color: var(--t-faint);
  white-space: nowrap;
}
/* 登录态只用一个 5px 的点表示：颜色已经说清了，不需要图标 */
.status-bar .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-bar .dot.on {
  background: var(--ok);
}
.status-bar .dot.off {
  background: var(--t-faint);
}
</style>
