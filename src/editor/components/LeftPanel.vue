<script setup>
import { ref } from 'vue'
import LibraryPanel from './LibraryPanel.vue'
import SceneTree from './SceneTree.vue'

const tab = ref('library')
</script>

<template>
  <aside class="left-panel">
    <div class="panel-tabs">
      <button :class="{ active: tab === 'library' }" @click="tab = 'library'">搭建</button>
      <button :class="{ active: tab === 'tree' }" @click="tab = 'tree'">层级</button>
    </div>
    <div class="panel-body">
      <LibraryPanel v-show="tab === 'library'" />
      <SceneTree v-show="tab === 'tree'" />
    </div>
  </aside>
</template>

<style scoped>
.left-panel {
  width: 264px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #0e131d;
  border-right: 1px solid #232a38;
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
</style>
