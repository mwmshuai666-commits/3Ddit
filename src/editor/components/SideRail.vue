<script setup>
/**
 * 左侧图标栏（Tripo 工作台那种窄竖栏）：跳「搭建」面板的各个栏目。
 * 之所以单独做一条而不是塞进侧栏：它是导航，得跟「面板开着没有」无关 ——
 * 面板折叠起来也还能点，点了自动展开（见 store 里的 focusLibSection）。
 */
import { ui, focusLibSection, toggleLeftPanel } from '../store/editor'
import Icon from './Icon.vue'

/** 左栏 → LibraryPanel 的栏目（键名和 store 的 LIB_SECTIONS 对齐） */
const LIB_LINKS = [
  { key: 'ground', label: '底板', icon: 'layers' },
  { key: 'primitive', label: '几何体', icon: 'box' },
  { key: 'light', label: '灯光', icon: 'sun' },
  { key: 'effect', label: '特效', icon: 'sparkles' },
  { key: 'model', label: '模型', icon: 'cube' },
  { key: 'html', label: '元素', icon: 'code' },
  { key: 'web', label: '网页', icon: 'globe' },
  { key: 'env', label: '环境', icon: 'image' },
]

function isActive(item) {
  return ui.leftTab === 'library' && ui.libOpen[item.key]
}

function go(item) {
  focusLibSection(item.key)
}
</script>

<template>
  <aside class="rail">
    <button
      v-for="it in LIB_LINKS"
      :key="it.key"
      class="rail-btn"
      :class="{ active: isActive(it) }"
      :title="it.label"
      @click="go(it)"
    >
      <span class="rail-ico"><Icon :name="it.icon" :size="18" /></span>
      <span class="rail-label">{{ it.label }}</span>
    </button>

    <div class="rail-foot">
      <button
        class="rail-btn"
        :class="{ active: !ui.leftOpen }"
        :title="ui.leftOpen ? '折叠面板' : '展开面板'"
        @click="toggleLeftPanel()"
      >
        <span class="rail-ico"><Icon name="panelLeft" :size="18" /></span>
        <span class="rail-label">面板</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.rail {
  width: var(--w-rail);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 0 var(--s-2);
}
.rail-btn {
  position: relative;
  width: 46px;
  padding: 7px 0 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--t-muted);
  cursor: pointer;
  transition:
    background var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
.rail-btn:hover {
  background: rgb(255 255 255 / 6%);
  color: var(--t-body);
}
.rail-btn.active {
  background: rgb(255 255 255 / 8%);
  color: var(--accent);
}
/* 选中态外沿一根小黄条：窄栏里没有地方放底色块，只能靠边缘提示 */
.rail-btn.active::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: var(--r-pill);
  background: var(--accent);
  box-shadow: var(--glow-accent);
}
.rail-ico {
  display: inline-grid;
  place-items: center;
  height: 20px;
}
.rail-label {
  font-size: var(--fs-2xs);
  line-height: 1.2;
  letter-spacing: 0.02em;
}
.rail-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}
@media (prefers-reduced-motion: reduce) {
  .rail-btn {
    transition: none;
  }
}
</style>
