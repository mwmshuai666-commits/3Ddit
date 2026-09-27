<script setup>
import { ref, watch } from 'vue'
import LibraryPanel from './LibraryPanel.vue'
import SceneTree from './SceneTree.vue'
import Icon from './Icon.vue'

const COLLAPSE_KEY = 'twinEditor.leftPanelCollapsed'

const tab = ref('library')
const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) === '1')

const TABS = [
  { key: 'library', label: '搭建', icon: 'layers' },
  { key: 'tree', label: '层级', icon: 'tree' },
]

/** 点标签：折叠状态下先展开，再切到对应页 */
function open(next) {
  tab.value = next
  collapsed.value = false
}

function toggle() {
  collapsed.value = !collapsed.value
}

watch(collapsed, (v) => localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'))
</script>

<template>
  <aside class="left-panel" :class="{ collapsed }">
    <div class="panel-topbar">
      <span v-show="!collapsed" class="topbar-title">场景面板</span>
      <button
        class="collapse-btn"
        :title="collapsed ? '展开面板' : '折叠面板'"
        @click="toggle"
      >
        <Icon name="panelLeft" :size="14" class="flip" :class="{ flipped: collapsed }" />
      </button>
    </div>

    <div class="panel-tabs">
      <button
        v-for="t in TABS"
        :key="t.key"
        :class="{ active: tab === t.key }"
        :title="t.label"
        @click="open(t.key)"
      >
        <Icon :name="t.icon" :size="15" />
        <span class="tab-text">{{ t.label }}</span>
      </button>
    </div>

    <div class="panel-body" v-show="!collapsed">
      <LibraryPanel v-show="tab === 'library'" />
      <SceneTree v-show="tab === 'tree'" />
    </div>
  </aside>
</template>

<style scoped>
.left-panel {
  position: relative;
  width: var(--w-panel);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--c-panel);
  border-right: 1px solid var(--c-line);
  transition: width var(--dur) var(--ease);
}
.left-panel.collapsed {
  width: var(--h-toolbar);
}
.panel-topbar {
  display: flex;
  align-items: center;
  height: var(--h-status);
  flex-shrink: 0;
  padding: 0 var(--s-2);
  border-bottom: 1px solid var(--c-line);
}
.topbar-title {
  font-size: var(--fs-2xs);
  color: var(--t-faint);
  letter-spacing: 0.06em;
}
.collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--h-btn);
  height: var(--h-ctrl);
  margin-left: auto;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--t-muted);
  cursor: pointer;
}
.collapse-btn:hover {
  color: var(--t-strong);
  background: var(--c-active);
}
/* 折叠态翻转箭头方向，指向「要展开的方向」 */
.flip {
  transition: transform var(--dur) var(--ease);
}
.flip.flipped {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .left-panel,
  .flip {
    transition: none;
  }
}
.panel-tabs {
  display: flex;
  height: var(--h-row);
  flex-shrink: 0;
  border-bottom: 1px solid var(--c-line);
}
.panel-tabs button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  border: none;
  background: transparent;
  color: var(--t-muted);
  font-size: var(--fs-sm);
  font-family: inherit;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.panel-tabs button:hover {
  color: var(--t-body);
  background: var(--c-raised);
}
.panel-tabs button.active {
  color: var(--accent-hover);
  border-bottom-color: var(--accent);
  background: var(--accent-soft);
}
.panel-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.panel-body > * {
  flex: 1;
  overflow-y: auto;
}

/* ---- 折叠态：只剩一条窄竖条，标签竖排成图标 ---- */
.left-panel.collapsed .panel-topbar {
  justify-content: center;
  padding: 0;
}
.left-panel.collapsed .collapse-btn {
  margin-left: 0;
}
.left-panel.collapsed .panel-tabs {
  flex-direction: column;
  height: auto;
  flex: 1;
  border-bottom: none;
}
.left-panel.collapsed .panel-tabs button {
  flex: none;
  height: var(--h-row);
  border-bottom: 1px solid var(--c-line);
  border-left: 2px solid transparent;
}
.left-panel.collapsed .panel-tabs button.active {
  border-left-color: var(--accent);
  border-bottom-color: var(--c-line);
}
.left-panel.collapsed .tab-text {
  display: none;
}
</style>
