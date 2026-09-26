<script setup>
/**
 * babylon-datav 特效组件挂载点。
 *
 * 这些组件只往 scene 里加网格、不渲染 DOM，所以放进一个覆盖在视口上、
 * 且 pointer-events:none 的空壳里即可；跟着 doc 里的 effect 节点增删。
 *
 * WeatherEffect 是命令式类（自己管粒子 + 场景雾效），单独一个宿主组件。
 */
import { computed } from 'vue'
import { editor } from '../store/editor'
import DatavEffect from './DatavEffect.vue'
import WeatherEffectNode from './WeatherEffectNode.vue'

defineProps({
  scene: { type: Object, required: true },
})

const effects = computed(() =>
  editor.doc.nodes.filter((n) => n.kind === 'effect' && n.type !== 'weatherEffect'),
)
const weathers = computed(() =>
  editor.doc.nodes.filter((n) => n.kind === 'effect' && n.type === 'weatherEffect'),
)
</script>

<template>
  <div class="datav-host">
    <DatavEffect v-for="n in effects" :key="n.id" :node="n" :scene="scene" />
    <WeatherEffectNode v-for="n in weathers" :key="n.id" :node="n" :scene="scene" />
  </div>
</template>

<style scoped>
.datav-host {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
</style>
