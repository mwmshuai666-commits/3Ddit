<script setup>
/**
 * 单个特效节点的宿主：把 babylon-datav 的 Vue 组件按节点参数拉起，
 * 再把组件内部创建的网格“认领”回节点名下。
 *
 * 那些组件是纯命令式的（无 DOM 输出），创建的网格名是写死的
 * （flexiblePipe / streamLine / arrowFlyLine / wave），也不暴露引用，
 * 所以这里按名字在 scene.meshes 里找还没归属的网格，打上 nodeId、
 * 挂到引擎的 wrapper 下、打开点选。组件自己 watch props 更新时
 * （如 ArrowFlyLine 是 dispose 后重建）会重新触发认领。
 *
 * 注意：包的 exports 是 {"./components/*": "./src/components/*.vue"}，
 * 写带后缀的路径会拼成 *.vue.vue，所以这里必须写不带后缀的路径。
 */
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import FlexiblePipe from 'babylon-datav/components/FlexiblePipe'
import StreamLine from 'babylon-datav/components/StreamLine'
// 飞线没有用包里的版本：原版的 emissiveTexture 会把颜色饱和成白色、
// 而且 GreasedLine 插件烤进 uniform 的颜色没人更新，导致改颜色无效。
// ArrowFlyLineNode.vue 是同接口的本地修正版，原因写在那份文件的头部。
import ArrowFlyLine from './ArrowFlyLineNode.vue'
import WaveWall from 'babylon-datav/components/WaveWall'
import { getEngine } from '../core/engineHolder'
import { datavTextureUrl } from '../core/datavTextures'
import { findCatalog } from '../schema/sceneSchema'
import { dataHub } from '../core/dataHub'
import { evaluateNode } from '../core/binding'

const COMPONENTS = {
  flexiblePipe: FlexiblePipe,
  streamLine: StreamLine,
  arrowFlyLine: ArrowFlyLine,
  waveWall: WaveWall,
}

const props = defineProps({
  node: { type: Object, required: true },
  scene: { type: Object, required: true },
})

const catalog = computed(() => findCatalog(props.node.kind, props.node.type))
const component = computed(() => COMPONENTS[props.node.type] || null)

/** props.points → 组件需要的入参形状 */
function mappedPoints() {
  const pts = props.node.props.points || []
  if (catalog.value?.pointProp === 'positionSrc') {
    // WaveWall：平面轮廓，第二个坐标用 z（编辑器折点里显示的 X / Z）
    return pts.map((p) => ({ x: Number(p[0]) || 0, y: Number(p[2]) || 0 }))
  }
  // ArrowFlyLine 只读前两个点，直接透传（引用不变，watch 才不会空转）
  return pts
}

/**
 * 数据注入：effect 节点的画面由这些 Vue 组件渲染，引擎侧拿不到材质句柄，
 * 所以运行时覆盖走「组件 props」这条路 —— 和 kind:'pipe' 的引擎注入等价，
 * 同样只覆盖 form 里登记过的 look 级字段，不动几何。
 *
 * direction（流向）映射成 speed 的符号：组件侧 speed 取负即反向。
 */
const tick = ref(0)
let unsub = null

/** form 里登记的字段 = 传给组件的 props，两边永远一致（+ 数据注入覆盖） */
const bindings = computed(() => {
  tick.value // 数据到达时经订阅回调自增，触发本 computed 重算
  const out = {}
  for (const f of catalog.value?.form || []) out[f.key] = props.node.props[f.key]
  // 求值本节点的绑定：没绑 / 没数据时是 {}，组件照常吃静态 props
  const patch = props.node.bindings?.length
    ? evaluateNode(props.node, dataHub.values)
    : {}
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'direction') {
      out.speed = Math.abs(Number(out.speed) || 1) * value
    } else if (key in out) {
      // 只覆盖组件真吃的字段（form 登记过的）；visible/particles 等其余 key
      // 由引擎侧 setNodeVisible / setPipeParticles 处理，这里不透传
      out[key] = value
    }
  }
  out[catalog.value.pointProp] = mappedPoints()
  const tex = datavTextureUrl(catalog.value?.texture)
  if (tex) out.textureUrl = tex
  return out
})

/**
 * 关键：这两个管类组件是用 CreateTube 的 instance 方式更新的 ——
 * 路径点数一变，只有前若干顶点被写回，剩下的还是旧顶点；
 * 且 instance 模式下管径永远取首次值。所以凡是影响几何的参数
 * （褶点数/坐标 + rebuildKeys 里登记的字段）变了就换 key 整套重新挂载，
 * 由组件的 onBeforeUnmount 负责把旧网格 dispose 干净。
 */
const mountKey = computed(() => {
  const geom = (catalog.value?.rebuildKeys || []).map((k) => props.node.props[k])
  geom.push(JSON.stringify(props.node.props.points || []))
  return `${props.node.id}|${JSON.stringify(geom)}`
})

let owned = null
let observer = null

function claim() {
  if (owned && !owned.isDisposed()) return
  const name = catalog.value?.meshName
  if (!name) return
  for (const mesh of props.scene.meshes) {
    // 只认领没归属的网格：同类型多个节点时各认各的
    if (mesh.name === name && !mesh.metadata?.nodeId) {
      mesh.metadata = { nodeId: props.node.id }
      owned = mesh
      getEngine()?.attachEffectMesh(props.node.id, mesh)
      return
    }
  }
}

onMounted(() => {
  claim()
  // 组件重建路径（dispose 后新建）在这里收口；微任务保证等组件的
  // 同步构造执行完（material / renderingGroupId / isPickable 都会被重设）
  observer = props.scene.onNewMeshAddedObservable.add((mesh) => {
    if (mesh.name === catalog.value?.meshName) Promise.resolve().then(claim)
  })
  // 数据到达 → 重算 bindings → 组件 props 热更（颜色 / 流向等）
  unsub = dataHub.subscribe(() => {
    tick.value += 1
  })
})

onBeforeUnmount(() => {
  unsub?.()
  unsub = null
  observer?.remove()
  observer = null
  // 组件自身会 dispose mesh / material / texture，这里只解除认领
  owned = null
})
</script>

<template>
  <component :is="component" v-if="component" :key="mountKey" v-bind="bindings" :scene="scene" />
</template>
