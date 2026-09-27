<script setup>
import { editor, setGizmoMode, frameSelected, saveNow, newScene } from '../store/editor'
import ExportMenu from './ExportMenu.vue'
import UserMenu from './UserMenu.vue'
import Icon from './Icon.vue'

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
      <Icon name="box" :size="16" />
      数字孪生场景编辑器
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
    <UserMenu />
    <button class="tool-btn" @click="saveNow">
      <Icon name="save" :size="13" />
      保存
    </button>
    <ExportMenu />
    <button class="tool-btn" @click="newScene">新建</button>
  </header>
</template>

<style scoped>
.toolbar {
  height: var(--h-toolbar);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 0 var(--s-4);
  background: var(--c-panel);
  border-bottom: 1px solid var(--c-line);
}
.brand {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--t-strong);
  white-space: nowrap;
}
.brand .icon {
  color: var(--t-muted);
}
.tool-group {
  display: flex;
  gap: var(--s-1);
  margin-left: var(--s-4);
}
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  height: var(--h-btn);
  padding: 0 10px;
  font-size: var(--fs-sm);
  font-family: inherit;
  color: var(--t-body);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.tool-btn:hover {
  border-color: var(--accent-line);
  color: var(--t-strong);
  background: var(--c-active);
}
.tool-btn.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-hover);
}
.tool-btn.primary {
  color: var(--on-accent);
  background: var(--accent);
  border-color: transparent;
}
.tool-btn.primary:hover {
  background: var(--accent-hover);
  border-color: transparent;
  color: var(--on-accent);
}
kbd {
  font-family: var(--font-mono);
  font-size: var(--fs-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--t-muted);
  background: var(--c-viewport);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-xs);
  padding: 0 4px;
  line-height: 1.6;
}
.spacer {
  flex: 1;
}
.save-status {
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
  color: var(--t-muted);
  white-space: nowrap;
}
.save-status.saving {
  color: var(--warn);
}
</style>
