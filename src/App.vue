<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import Toolbar from './editor/components/Toolbar.vue'
import LeftPanel from './editor/components/LeftPanel.vue'
import Viewport from './editor/components/Viewport.vue'
import Inspector from './editor/components/Inspector.vue'
import {
  editor,
  setGizmoMode,
  frameSelected,
  removeNode,
  findNode,
  GROUND_SELECTION,
} from './editor/store/editor'
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

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
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
  background: #0a0e16;
  color: #c6d0e0;
  font-size: 13px;
  overflow: hidden;
}
.editor-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.status-bar {
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 12px;
  font-size: 11px;
  color: #66748e;
  background: #11151d;
  border-top: 1px solid #232a38;
}
.status-bar .spacer {
  flex: 1;
}
.status-bar .hint {
  color: #55617a;
}
</style>
