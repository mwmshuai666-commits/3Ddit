<script setup>
import { editor, selectNode, removeNode, GROUND_SELECTION } from '../store/editor'
import { findGroundCatalog } from '../schema/sceneSchema'

const groundName = () => findGroundCatalog(editor.doc.scene.ground.type).name
</script>

<template>
  <div class="tree">
    <div
      class="tree-row ground"
      :class="{ active: editor.selectedId === GROUND_SELECTION }"
      @click="selectNode(GROUND_SELECTION)"
    >
      <span class="tree-icon">▔</span>
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
      <span class="tree-icon" :class="node.kind">{{
        node.kind === 'light' ? '☀'
          : node.kind === 'model' ? '⬢'
          : node.kind === 'pipe' ? '⚡'
          : node.kind === 'effect' ? '✦'
          : '▣'
      }}</span>
      <span class="tree-name">{{ node.name }}</span>
      <span class="tree-type">{{ node.type }}</span>
      <button class="tree-del" title="删除" @click.stop="removeNode(node.id)">×</button>
    </div>

    <div v-if="editor.doc.nodes.length === 0" class="tree-empty">
      还没有节点，从“搭建”页添加
    </div>
  </div>
</template>

<style scoped>
.tree {
  padding: 8px;
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #c6d0e0;
}
.tree-row:hover {
  background: #1a2233;
}
.tree-row.active {
  background: #16345f;
  color: #9ecbff;
}
.tree-icon {
  width: 16px;
  text-align: center;
  color: #6f8bb8;
  flex-shrink: 0;
}
.tree-icon.light {
  color: #e8c46a;
}
.tree-icon.model {
  color: #7bd4a6;
}
.tree-icon.pipe {
  color: #4fd8ff;
}
.tree-icon.effect {
  color: #b48cff;
}
.tree-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-type {
  font-size: 10px;
  color: #5d6b85;
}
.tree-del {
  display: none;
  border: none;
  background: transparent;
  color: #8293ad;
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
}
.tree-row:hover .tree-del {
  display: inline;
}
.tree-del:hover {
  color: #ff6b6b;
}
.tree-sep {
  margin: 10px 4px 6px;
  font-size: 11px;
  color: #55617a;
}
.tree-empty {
  padding: 18px 8px;
  font-size: 12px;
  color: #55617a;
  text-align: center;
}
</style>
