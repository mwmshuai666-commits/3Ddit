<script setup>
/**
 * 左侧主面板：搭建（LibraryPanel）/ 层级（SceneTree）两个页签。
 *
 * 开合状态、当前页签都在 store 的 ui 里（见 store/editor.js）：左右图标栏和顶栏
 * 导航也要切这两个状态，留在组件内部就得层层传 props。
 */
import { ui, toggleLeftPanel, toggleAllLibSections, editor } from '../store/editor'
import LibraryPanel from './LibraryPanel.vue'
import SceneTree from './SceneTree.vue'
import Icon from './Icon.vue'

const TABS = [
  { key: 'library', label: '搭建', icon: 'layers' },
  { key: 'tree', label: '层级', icon: 'tree' },
]
</script>

<template>
  <aside class="panel left-panel" :class="{ collapsed: !ui.leftOpen }">
    <div class="panel-head">
      <span class="panel-title">场景搭建</span>
      <button
        class="head-btn"
        :title="ui.leftOpen ? '折叠面板' : '展开面板'"
        @click="toggleLeftPanel()"
      >
        <Icon name="panelLeft" :size="15" />
      </button>
    </div>

    <div class="panel-tabs">
      <button
        v-for="t in TABS"
        :key="t.key"
        :class="{ active: ui.leftTab === t.key }"
        :title="t.label"
        @click="ui.leftTab = t.key"
      >
        <Icon :name="t.icon" :size="14" />
        <span class="tab-text">{{ t.label }}</span>
      </button>
    </div>

    <div class="panel-body">
      <LibraryPanel v-show="ui.leftTab === 'library'" />
      <SceneTree v-show="ui.leftTab === 'tree'" />
    </div>

    <div class="panel-foot">
      <span class="foot-count" title="场景节点数">
        <Icon name="stack" :size="12" />
        {{ editor.doc.nodes.length }}
      </span>
      <button
        v-if="ui.leftTab === 'library'"
        class="foot-btn"
        title="有展开的栏目就全部收起"
        @click="toggleAllLibSections()"
      >
        全部收起
      </button>
    </div>
  </aside>
</template>

<style scoped>
.left-panel {
  width: var(--w-panel);
  transition: width var(--dur) var(--ease);
}
.left-panel.collapsed {
  width: 52px;
}
.panel-head {
  flex: 0 0 44px;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 0 var(--s-2) 0 var(--s-4);
}
.panel-title {
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--t-strong);
  white-space: nowrap;
}
.head-btn {
  margin-left: auto;
  width: 26px;
  height: 26px;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--t-muted);
  cursor: pointer;
  transition:
    color var(--dur) var(--ease),
    background var(--dur) var(--ease);
}
.head-btn:hover {
  color: var(--t-strong);
  background: rgb(255 255 255 / 7%);
}
.panel-tabs {
  display: flex;
  gap: var(--s-1);
  padding: 0 var(--s-3) var(--s-2);
  flex-shrink: 0;
}
.panel-tabs button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  height: 30px;
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--t-muted);
  font-size: var(--fs-sm);
  cursor: pointer;
  white-space: nowrap;
  transition:
    color var(--dur) var(--ease),
    background var(--dur) var(--ease);
}
.panel-tabs button:hover {
  color: var(--t-body);
  background: rgb(255 255 255 / 5%);
}
.panel-tabs button.active {
  color: var(--t-strong);
  background: rgb(255 255 255 / 9%);
}
.panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.panel-body > * {
  flex: 1;
  overflow-y: auto;
}
.panel-foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  height: var(--h-status);
  padding: 0 var(--s-2) var(--s-2);
}
.foot-count {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  font-size: var(--fs-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--t-faint);
}
.foot-btn {
  margin-left: auto;
  height: 22px;
  padding: 0 var(--s-2);
  border: 1px solid var(--c-glass);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--t-muted);
  font-size: var(--fs-2xs);
  cursor: pointer;
  transition:
    color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.foot-btn:hover {
  color: var(--t-strong);
  border-color: var(--c-glass-strong);
}
/* 折叠后只剩一条竖栏：标题和页签文字收起来，图标还是能点 */
.left-panel.collapsed .panel-head {
  justify-content: center;
  padding: 0;
}
.left-panel.collapsed .head-btn {
  margin-left: 0;
}
.left-panel.collapsed .panel-title,
.left-panel.collapsed .tab-text,
.left-panel.collapsed .panel-body,
.left-panel.collapsed .panel-foot {
  display: none;
}
.left-panel.collapsed .panel-tabs {
  flex-direction: column;
  padding: 0 var(--s-1);
}
@media (prefers-reduced-motion: reduce) {
  .left-panel {
    transition: none;
  }
}
</style>
