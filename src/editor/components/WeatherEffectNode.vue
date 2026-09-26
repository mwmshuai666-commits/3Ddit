<script setup>
/**
 * 天气效果节点宿主（babylon-datav/core/WeatherEffect）
 *
 * WeatherEffect 不是 Vue 组件，而是一个命令式类：new 出来之后 apply(type)
 * 就会往 scene 里灌粒子（雨/雪）并改掉 fog / ambientColor / clearColor
 * （雷电靠不停刷白 clearColor 模拟闪光）。
 *
 * 这里只做三件事：
 *   1. 按节点参数 new / apply / dispose，范围·高度·位置变化时重建实例
 *   2. 天气类型变化时原地 apply（不用重建粒子系统）
 *   3. 每次 apply 之后重新声明一次背景色 —— clearColor 是场景属性，编辑器
 *      面板上的“背景色”必须始终说话算数，否则天气效果会悄悄把它改掉
 */
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { Vector3 } from '@babylonjs/core'
import WeatherEffect from 'babylon-datav/core/WeatherEffect'
import { getEngine } from '../core/engineHolder'
import { editor } from '../store/editor'

const props = defineProps({
  node: { type: Object, required: true },
  scene: { type: Object, required: true },
})

/** 实例构造时会快照 scene 的 fog / clearColor / ambientColor，dispose 时还原 */
let fx = null

function reassertBackground() {
  getEngine()?.setBackground(editor.doc.scene.background)
}

function build() {
  fx?.dispose()
  const { props: p, transform } = props.node
  fx = new WeatherEffect(props.scene, {
    range: Number(p.range) || 140,
    height: Number(p.height) || 70,
    center: new Vector3(transform.position[0], transform.position[1], transform.position[2]),
  })
  fx.apply(p.type)
  reassertBackground()
}

onMounted(build)

onBeforeUnmount(() => {
  fx?.dispose()
  fx = null
  // 雷电的 setTimeout 可能在 dispose 之后才把 clearColor 刷白，补一次
  reassertBackground()
  setTimeout(reassertBackground, 400)
})

// 天气类型：原地切换即可
watch(
  () => props.node.props.type,
  () => {
    if (!fx) return build()
    fx.apply(props.node.props.type)
    reassertBackground()
  },
)

// 构造参数（范围 / 高度 / 位置）变化 → 只能重建实例
watch(
  () => [props.node.props.range, props.node.props.height, props.node.transform.position.join(',')],
  build,
)
</script>

<template>
  <!-- 没有 DOM 输出，只驱动 scene 里的粒子与雾效；占位元素给 Vue 一个挂载点 -->
  <div class="weather-host" />
</template>

<style scoped>
.weather-host {
  display: none;
}
</style>
