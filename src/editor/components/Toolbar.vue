<script setup>
/**
 * 顶栏（Tripo 工作台那种一整颗胶囊）：品牌 + 页面导航 + 账号动作。
 *
 * gizmo 模式（移动/旋转/缩放/聚焦）和保存都搬到视口浮层里了 —— 它们是「看场景」
 * 时才用的操作，放在顶栏只会把导航区和工具区混在一起。顶栏只留导航和账号。
 */
import { ref } from 'vue'
import {
  editor,
  ui,
  saveNow,
  newScene,
  frameScene,
  showPanelTab,
} from '../store/editor'
import ExportMenu from './ExportMenu.vue'
import UserMenu from './UserMenu.vue'
import HelpDialog from './HelpDialog.vue'
import Icon from './Icon.vue'

const helpOpen = ref(false)

function fmtTime(d) {
  return d ? d.toLocaleTimeString('zh-CN', { hour12: false }) : ''
}

/** 导航高亮全部由界面状态推导，不自己记一份「当前在第几页」 */
const NAV = [
  { key: 'home', label: '首页', go: frameScene, active: () => false },
  { key: 'library', label: '资产', go: () => showPanelTab('library'), active: () => ui.leftOpen && ui.leftTab === 'library' },
  { key: 'tree', label: '层级', go: () => showPanelTab('tree'), active: () => ui.leftOpen && ui.leftTab === 'tree' },
  { key: 'inspector', label: '属性', go: () => { ui.inspectorOpen = true }, active: () => ui.inspectorOpen },
]
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="logo"><Icon name="cube" :size="17" /></span>
      <span class="brand-text">3D 工作台</span>
    </div>

    <nav class="nav">
      <button
        v-for="l in NAV"
        :key="l.key"
        class="nav-btn"
        :class="{ active: l.active() }"
        @click="l.go"
      >
        {{ l.label }}
      </button>
    </nav>

    <div class="spacer"></div>

    <div class="top-actions">
      <!-- 有未保存更改时铃铛亮个点：颜色已经说清了，不需要图标 -->
      <button
        class="icon-btn"
        :class="{ dot: editor.dirty, busy: editor.saving }"
        :title="editor.dirty ? '有未保存更改，点击立即保存' : `已自动保存${editor.savedAt ? ' ' + fmtTime(editor.savedAt) : ''}`"
        @click="saveNow()"
      >
        <Icon name="bell" :size="16" />
      </button>
      <button class="icon-btn" title="操作说明" @click="helpOpen = true">
        <Icon name="help" :size="16" />
      </button>
      <span class="stat-pill" title="场景节点数">
        <Icon name="stack" :size="13" />
        {{ editor.doc.nodes.length }}
      </span>
      <button class="ghost-pill" title="新建场景（当前内容会被覆盖）" @click="newScene()">
        <Icon name="plus" :size="13" />
        新建
      </button>
      <ExportMenu />
      <UserMenu />
    </div>
  </header>

  <HelpDialog :open="helpOpen" @close="helpOpen = false" />
</template>

<style scoped>
.topbar {
  height: var(--h-toolbar);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 0 var(--s-3) 0 var(--s-4);
  background: linear-gradient(180deg, rgb(29 30 35 / 96%), rgb(19 20 24 / 96%));
  border: 1px solid var(--c-glass);
  border-radius: var(--r-pill);
  box-shadow: var(--shadow-card);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: 0 var(--s-1) 0 0;
  border-radius: var(--r-pill);
}
.logo {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--grad-accent);
  color: var(--on-accent);
  box-shadow: var(--glow-accent);
}
.brand-text {
  font-size: var(--fs-lg);
  font-weight: 600;
  white-space: nowrap;
}
.nav {
  display: flex;
  align-items: center;
  gap: var(--s-1);
  margin-left: var(--s-3);
}
.nav-btn {
  height: var(--h-btn);
  padding: 0 var(--s-3);
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--t-muted);
  font-size: var(--fs-md);
  white-space: nowrap;
  transition:
    background var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
.nav-btn:hover {
  background: rgb(255 255 255 / 6%);
  color: var(--t-body);
}
.nav-btn.active {
  color: var(--t-strong);
  background: rgb(255 255 255 / 9%);
}
.spacer {
  flex: 1;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
/* 玻璃小圆钮：顶栏所有次级操作的统一长相 */
.icon-btn {
  position: relative;
  width: 30px;
  height: 30px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--c-glass-strong);
  border-radius: var(--r-pill);
  background: var(--grad-glass);
  color: var(--t-body);
  cursor: pointer;
  transition:
    transform var(--dur) var(--ease),
    color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.icon-btn:hover {
  transform: translateY(-1px);
  color: var(--t-strong);
  border-color: rgb(255 255 255 / 24%);
}
.icon-btn:active {
  transform: translateY(0) scale(0.96);
}
/* 未保存提示点：右上角一颗黄点 */
.icon-btn.dot::after {
  content: '';
  position: absolute;
  top: 4px;
  right: 5px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 2px rgb(23 24 28 / 90%), var(--glow-accent);
}
.icon-btn.busy {
  color: var(--accent);
}
.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  height: 30px;
  padding: 0 var(--s-3);
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
  color: var(--t-body);
  background: var(--grad-glass);
  border: 1px solid var(--c-glass-strong);
  border-radius: var(--r-pill);
  white-space: nowrap;
}
.stat-pill .icon {
  color: var(--t-muted);
}
.ghost-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  height: 32px;
  padding: 0 var(--s-3);
  font-size: var(--fs-sm);
  color: var(--t-body);
  background: var(--grad-glass);
  border: 1px solid var(--c-glass-strong);
  border-radius: var(--r-pill);
  cursor: pointer;
  transition:
    color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.ghost-pill:hover {
  color: var(--t-strong);
  border-color: rgb(255 255 255 / 26%);
}
@media (max-width: 1080px) {
  .nav {
    margin-left: var(--s-1);
  }
  .nav-btn {
    padding: 0 var(--s-2);
  }
}
@media (max-width: 860px) {
  .brand-text,
  .nav {
    display: none;
  }
}
</style>
