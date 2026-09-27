<script setup>
import { editor, selectNode, removeNode, GROUND_SELECTION } from '../store/editor'
import { findGroundCatalog } from '../schema/sceneSchema'
import { iconOf } from './icons'
import Icon from './Icon.vue'

const groundName = () => findGroundCatalog(editor.doc.scene.ground.type).name

/**
 * 目录项的 icon 字段是 unicode 数据（会进导出的 scene.json，不能改旧值），
 * 渲染时映射成 SVG 图标名；没有 icon 字段的老场景退回用 kind。
 */
const kindIcon = (node) => iconOf(node.icon || node.kind)
</script>

<template>
  <div class="tree">
    <div
      class="tree-row ground"
      :class="{ active: editor.selectedId === GROUND_SELECTION }"
      @click="selectNode(GROUND_SELECTION)"
    >
      <span class="tree-icon"><Icon name="layers" :size="14" /></span>
      <span class="tree-name">地面 · {{ groundName() }}</span>
    </div>

    <div class="tree-sep">场景节点（{{ editor.doc.nodes.length }}）</div>

    <div
      v-for="node in editor.doc.nodes"
      :key="node.id"
      class="tree-row"
      :class="{ active: editor.selectedId === node.id }"
      @click="selectNode(node.id)"
    >
      <span class="tree-icon"><Icon :name="kindIcon(node)" :size="14" /></span>
      <span class="tree-name">{{ node.name }}</span>
      <span class="tree-type">{{ node.type }}</span>
      <button class="tree-del" title="删除" @click.stop="removeNode(node.id)">
        <Icon name="trash" :size="13" />
      </button>
    </div>

    <div v-if="editor.doc.nodes.length === 0" class="tree-empty">
      还没有节点，从“搭建”页添加
    </div>
  </div>
</template>

<style scoped>
.tree {
  padding: var(--s-2);
}
.tree-row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  height: var(--h-row);
  padding: 0 var(--s-2);
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: var(--fs-sm);
  color: var(--t-body);
}
.tree-row:hover {
  background: var(--c-raised);
}
.tree-row.active {
  background: var(--accent-soft);
  color: var(--accent-hover);
}
/* 图标只做形状区分，不上糖果色——种类信息形状已经带够了 */
.tree-icon {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--t-muted);
}
.tree-row.active .tree-icon {
  color: inherit;
}
.tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-type {
  font-size: var(--fs-2xs);
  color: var(--t-faint);
  white-space: nowrap;
}
.tree-del {
  display: none;
  border: none;
  background: transparent;
  color: var(--t-faint);
  cursor: pointer;
  padding: var(--s-1);
  margin: -var(--s-1);
  border-radius: var(--r-xs);
}
.tree-row:hover .tree-del {
  display: inline-flex;
}
.tree-del:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.tree-sep {
  margin: var(--s-3) var(--s-1) var(--s-2);
  font-size: var(--fs-xs);
  color: var(--t-faint);
}
.tree-empty {
  padding: var(--s-5) var(--s-2);
  font-size: var(--fs-sm);
  color: var(--t-faint);
  text-align: center;
}
</style>
