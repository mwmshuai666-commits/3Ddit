<script setup>
import { editor, setGizmoMode, frameSelected, saveNow, newScene } from '../store/editor'
import ExportMenu from './ExportMenu.vue'

const modes = [
  { key: 'translate', label: '移动', hotkey: 'W' },
  { key: 'rotate', label: '旋转', hotkey: 'E' },
  { key: 'scale', label: '缩放', hotkey: 'R' },
]

function fmtTime(d) {
  return d
    ? d.toLocaleTimeString('zh-CN', { hour12: false })
    : ''
}
</script>

<template>
  <header class="toolbar">
    <div class="brand">
      <span class="brand-dot"></span>
      数字孪生场景编辑器
      <span class="brand-ver">P0</span>
    </div>

    <div class="tool-group">
      <button
        v-for="m in modes"
        :key="m.key"
        class="tool-btn"
        :class="{ active: editor.gizmoMode === m.key }"
        @click="setGizmoMode(m.key)"
      >
        {{ m.label }} <kbd>{{ m.hotkey }}</kbd>
      </button>
      <button class="tool-btn" @click="frameSelected">聚焦 <kbd>F</kbd></button>
    </div>

    <div class="spacer"></div>

    <div class="save-status" :class="{ saving: editor.saving }">
      {{ editor.saving ? '保存中…' : editor.savedAt ? `已自动保存 ${fmtTime(editor.savedAt)}` : '尚未保存' }}
    </div>
    <button class="tool-btn primary" @click="saveNow">保存</button>
    <ExportMenu />
    <button class="tool-btn" @click="newScene">新建</button>
  </header>
</template>

<style scoped>
.toolbar {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: #11151d;
  border-bottom: 1px solid #232a38;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #e6ecf5;
}
.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4da3ff, #7b5bff);
}
.brand-ver {
  font-size: 11px;
  color: #7b89a3;
  border: 1px solid #2f3a4e;
  border-radius: 4px;
  padding: 0 5px;
}
.tool-group {
  display: flex;
  gap: 4px;
  margin-left: 18px;
}
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  color: #c6d0e0;
  background: #1a2030;
  border: 1px solid #2a3346;
  border-radius: 6px;
  cursor: pointer;
}
.tool-btn:hover {
  border-color: #3d8bff;
  color: #fff;
}
.tool-btn.active {
  background: #16345f;
  border-color: #3d8bff;
  color: #8fc0ff;
}
.tool-btn.primary {
  background: #1c56c8;
  border-color: #2f6fe0;
  color: #fff;
}
.tool-btn.primary:hover {
  background: #2466e2;
}
kbd {
  font-family: inherit;
  font-size: 10px;
  color: #7b89a3;
  background: #0d111a;
  border: 1px solid #2a3346;
  border-radius: 3px;
  padding: 0 4px;
}
.spacer {
  flex: 1;
}
.save-status {
  font-size: 12px;
  color: #6d7c96;
}
.save-status.saving {
  color: #c9a14e;
}
</style>
