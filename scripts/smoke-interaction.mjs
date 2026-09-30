import {
  normalizeNodeInteraction,
  normalizeSceneCamera,
  createNode,
  PRIMITIVE_CATALOG,
} from '../src/editor/schema/sceneSchema.js'

const old = normalizeNodeInteraction({ id: 'n1', kind: 'box' })
console.log('老节点 interaction:', JSON.stringify(old))

const half = normalizeNodeInteraction({
  interaction: { trigger: 'hover', transparent: { opacity: NaN, color: '' }, camera: { duration: 999999 } },
})
console.log('残缺兜底:', JSON.stringify(half))
console.log('非法 trigger:', normalizeNodeInteraction({ interaction: { trigger: 'wave' } }).trigger)

const node = createNode('primitive', PRIMITIVE_CATALOG[0])
console.log('新建节点:', JSON.stringify(node.interaction))

const merge = (cur, patch) => normalizeNodeInteraction({
  interaction: {
    trigger: patch.trigger !== undefined ? patch.trigger : cur.trigger,
    transparent: { ...cur.transparent, ...(patch.transparent || {}) },
    outline: { ...cur.outline, ...(patch.outline || {}) },
    camera: { ...cur.camera, ...(patch.camera || {}) },
  },
})
let it = node.interaction
it = merge(it, { trigger: 'hover' })
it = merge(it, { transparent: { enabled: true } })
it = merge(it, { transparent: { color: '#ff0000' } })
console.log('合并后:', JSON.stringify(it))

console.log('camera ok:', JSON.stringify(normalizeSceneCamera({ alpha: -1.5707, beta: 1.2799, radius: 124.1234, target: [0, 4.56789, 0] })))
console.log('camera bad:', JSON.stringify(normalizeSceneCamera({ alpha: 'x', target: [0, 0] })), JSON.stringify(normalizeSceneCamera(null)))

// 7) 视角飞行：默认自动框住；custom + view 归一化；坏 view 退回 auto
console.log('camera 默认:', JSON.stringify(normalizeNodeInteraction(null).camera))
console.log('camera custom:', JSON.stringify(normalizeNodeInteraction({
  interaction: { camera: { enabled: true, mode: 'custom', view: { alpha: -1.5707, beta: 1.2799, radius: 90, target: [1.1111, 2, -3] } } },
}).camera))
console.log('camera 坏view:', JSON.stringify(normalizeNodeInteraction({ interaction: { camera: { mode: 'custom', view: { alpha: 'x' } } } }).camera))

// 8) 视角飞行机位部分合并：改一个角度不丢目标点
const cur = normalizeNodeInteraction({ interaction: { camera: { mode: 'custom', view: { alpha: -1.5707, beta: 1.2799, radius: 90, target: [1, 2, 3] } } } }).camera
const merged = normalizeNodeInteraction({ interaction: { camera: {
  ...cur,
  view: { ...(cur.view || {}), alpha: -0.5 },
} } }).camera
console.log('机位部分合并:', JSON.stringify(merged))

console.log('SMOKE-OK')
