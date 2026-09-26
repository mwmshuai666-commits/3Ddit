<script setup>
import { ref, watch } from 'vue'
import LibraryPanel from './LibraryPanel.vue'
import SceneTree from './SceneTree.vue'

const COLLAPSE_KEY = 'twinEditor.leftPanelCollapsed'

const tab = ref('library')
const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) === '1')

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
        {{ collapsed ? '»' : '«' }}
      </button>
    </div>

    <div class="panel-tabs">
      <button :class="{ active: tab === 'library' }" @click="open('library')">
        <span class="tab-short">搭</span>
        <span class="tab-text">搭建</span>
      </button>
      <button :class="{ active: tab === 'tree' }" @click="open('tree')">
        <span class="tab-short">层</span>
        <span class="tab-text">层级</span>
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
  width: 264px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #0e131d;
  border-right: 1px solid #232a38;
  transition: width 0.18s ease;
}
.left-panel.collapsed {
  width: 46px;
}
.panel-topbar {
  display: flex;
  align-items: center;
  height: 26px;
  flex-shrink: 0;
  padding: 0 6px;
  border-bottom: 1px solid #232a38;
}
.topbar-title {
  font-size: 11px;
  color: #55617a;
  letter-spacing: 0.5px;
}
.collapse-btn {
  width: 22px;
  height: 18px;
  margin-left: auto;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #8293ad;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.collapse-btn:hover {
  color: #9ecbff;
  background: #1a2233;
}
.panel-tabs {
  display: flex;
  height: 38px;
  flex-shrink: 0;
  border-bottom: 1px solid #232a38;
}
.panel-tabs button {
  flex: 1;
  border: none;
  background: transparent;
  color: #8b98b0;
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.panel-tabs button.active {
  color: #9ecbff;
  border-bottom-color: #3d8bff;
  background: #111927;
}
.panel-tabs .tab-short {
  display: none;
  font-size: 13px;
}
.panel-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
  height: 44px;
  border-bottom: 1px solid #1b2333;
  border-left: 2px solid transparent;
}
.left-panel.collapsed .panel-tabs button.active {
  border-left-color: #3d8bff;
  border-bottom-color: #1b2333;
}
.left-panel.collapsed .tab-text {
  display: none;
}
.left-panel.collapsed .tab-short {
  display: inline;
}
</style>
