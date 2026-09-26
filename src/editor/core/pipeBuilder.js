/**
 * 能量管道（折点管道）可视化构建
 *
 * 复用 babylon-datav 的 PathBuilder（`babylon-datav/core/PathBuilder`）：
 *   - buildRoundedPath(points, radius, arcSegments)  折点处按圆角半径倒角
 *   - resampleByLength(points, count)                沿弧长均匀重采样，保证光带流速均匀
 *
 * 一条管道由两层组成：
 *   - tube   内芯：发光管，opacityTexture 做流动光带（u 方向滚 uOffset）
 *   - casing 外壳：半透明深色玻璃管，罩在内芯外面
 *
 * points 使用节点局部坐标（wrapper 只负责 transform），因此修改 props.points
 * 时只需要重建几何体，不需要碰 wrapper。
 */

import {
  Vector3,
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  StandardMaterial,
  DynamicTexture,
  Texture,
} from '@babylonjs/core'
import { buildRoundedPath, resampleByLength } from 'babylon-datav/core/PathBuilder'

/** 折点倒角的圆分段 */
const CORNER_SEGMENTS = 12
/** 外壳半径 = 内芯半径 × 该系数 */
const CASING_SCALE = 2.1
/** points 少于 2 个时的兜底直线 */
const FALLBACK_POINTS = [
  [0, 2, 0],
  [0, 2, 10],
]
/** 粒子贴图：柔和圆点（dataURL，不依赖 /static 资源） */
const PARTICLE_URL =
  'data:image/svg+xml;base64,' +
  btoa(
    `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>` +
      `<radialGradient id='g' cx='50%' cy='50%' r='50%'>` +
      `<stop offset='0%' stop-color='#ffffff' stop-opacity='1'/>` +
      `<stop offset='45%' stop-color='#ffffff' stop-opacity='0.55'/>` +
      `<stop offset='100%' stop-color='#ffffff' stop-opacity='0'/>` +
      `</radialGradient><circle cx='32' cy='32' r='32' fill='url(#g)'/></svg>`,
  )
/** 粒子同时存活的最大数量 */
const PARTICLE_CAPACITY = 320

const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0))

/** 沿路径累计弧长，返回 { step, total }（路径已被 resampleByLength 均匀化，按索引线性推进即可） */
function pathMetrics(path) {
  let total = 0
  for (let i = 1; i < path.length; i += 1) total += Vector3.Distance(path[i - 1], path[i])
  return { total, step: total / Math.max(1, path.length - 1) }
}

/** JSON 数组 [[x,y,z],...] → Vector3[]（不含 null / 非数字保护） */
export function toVectorPath(points) {
  if (!Array.isArray(points)) return []
  const out = []
  for (const p of points) {
    if (!Array.isArray(p) || p.length < 2) continue
    const x = Number(p[0])
    const y = Number(p[1])
    const z = Number(p[2])
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    out.push(new Vector3(x, y, z))
  }
  return out
}

/**
 * 折点 → 可用于 CreateTube 的路径
 * @returns {Vector3[]|null} 点数不足时返回 null
 */
export function buildPipePath(points, props = {}) {
  let vec = toVectorPath(points)
  if (vec.length < 2) vec = toVectorPath(FALLBACK_POINTS)
  if (vec.length < 2) return null

  const fillet = Math.max(0, Number(props.filletRadius) || 0)
  const rounded = fillet > 0 ? buildRoundedPath(vec, fillet, CORNER_SEGMENTS) : vec

  const count = Math.max(16, Math.round(Number(props.tubeSegments) || 96))
  const smooth = resampleByLength(rounded, count)
  return smooth && smooth.length >= 2 ? smooth : rounded
}

/** 生成沿 u 方向流动的光带贴图（256×16 RGBA） */
export function createFlowTexture(scene) {
  const w = 256
  const h = 16
  const tex = new DynamicTexture('pipeFlowTex', { width: w, height: h }, scene, false)
  tex.wrapU = Texture.WRAP_ADDRESSMODE
  tex.wrapV = Texture.CLAMP_ADDRESSMODE

  const ctx = tex.getContext()
  ctx.clearRect(0, 0, w, h)

  // 通体微亮，保证整条管道可见
  const base = ctx.createLinearGradient(0, 0, 0, h)
  base.addColorStop(0, 'rgba(255,255,255,0.10)')
  base.addColorStop(0.5, 'rgba(255,255,255,0.30)')
  base.addColorStop(1, 'rgba(255,255,255,0.10)')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  // 两段高亮脉冲（uScale 决定沿管道重复几次，即光带数量）
  const pulse = (cx) => {
    const r = 30
    const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.42, 'rgba(255,255,255,0.75)')
    g.addColorStop(0.55, 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  pulse(w * 0.25)
  pulse(w * 0.75)

  tex.update(false)
  tex.hasAlpha = true
  return tex
}

/** 内芯材质：自发光 + 流动贴图 */
export function createFlowMaterial(scene, texture, hex) {
  const color = Color3.FromHexString(hex || '#00e5ff')
  const mat = new StandardMaterial('pipeFlowMat', scene)
  mat.diffuseColor = color
  mat.emissiveColor = color
  mat.specularColor = Color3.Black()
  mat.disableLighting = true
  mat.backFaceCulling = false
  mat.opacityTexture = texture
  mat.alpha = 1
  return mat
}

/** 外壳材质：半透明深色玻璃 */
export function createCasingMaterial(scene, hex, opacity) {
  const tint = Color3.FromHexString(hex || '#00e5ff')
  const mat = new StandardMaterial('pipeCasingMat', scene)
  mat.diffuseColor = new Color3(0.04, 0.06, 0.1)
  mat.emissiveColor = tint.scale(0.05)
  mat.specularColor = new Color3(0.35, 0.42, 0.5)
  mat.specularPower = 96
  mat.backFaceCulling = false
  mat.alpha = Math.min(0.9, Math.max(0, Number(opacity) || 0))
  return mat
}

/**
 * 管内粒子流动：一个发射点沿路径匀速前进，粒子脱离后原地滞留并淡出，
 * 于是连成一串沿管道跑的光点（叠加混合，像能量在管里流）。
 *
 * emitter 用常驻 Vector3：ThinParticleSystem._update 每帧读它的当前值，
 * 所以外部只需改 x/y/z，不用重新赋值。
 */
export function createPipeFlowParticles(scene, node, path, radius) {
  if (!path || path.length < 2) return null
  const props = node.props || {}
  const hex = props.color || '#00e5ff'
  const tint = Color3.FromHexString(hex)
  const size = clamp(props.particleSize, 0.05, 8) || 1

  const ps = new ParticleSystem(`pipeFlow_${node.id}`, PARTICLE_CAPACITY, scene)
  ps.particleTexture = new Texture(PARTICLE_URL, scene)
  ps.emitter = Vector3.Zero()
  ps.minEmitBox = Vector3.Zero()
  ps.maxEmitBox = Vector3.Zero()
  // 无重力、无初速度：粒子停在发射那一刻的位置，只由发射点的移动形成流动
  ps.gravity = Vector3.Zero()
  ps.direction1 = Vector3.Zero()
  ps.direction2 = Vector3.Zero()
  ps.minEmitPower = 0
  ps.maxEmitPower = 0
  ps.minLifeTime = 0.35
  ps.maxLifeTime = 0.85
  ps.emitRate = 520
  ps.updateSpeed = 0.02
  ps.minSize = radius * 0.16 * size
  ps.maxSize = radius * 0.42 * size
  ps.minScaleY = 1
  ps.maxScaleY = 1
  ps.minAngularSpeed = 0
  ps.maxAngularSpeed = 0
  ps.color1 = new Color4(tint.r, tint.g, tint.b, 1)
  ps.color2 = new Color4(Math.min(1, tint.r + 0.35), Math.min(1, tint.g + 0.35), Math.min(1, tint.b + 0.35), 0.85)
  ps.colorDead = new Color4(tint.r * 0.4, tint.g * 0.4, tint.b * 0.4, 0)
  ps.blendMode = ParticleSystem.BLENDMODE_ONEONE // 叠加发光
  ps.forceDepthWrite = false
  ps.start()

  return {
    ps,
    head: ps.emitter,
    path,
    baseMin: radius * 0.16,
    baseMax: radius * 0.42,
    ...pathMetrics(path),
  }
}

/** 粒子沿路径推进时的临时坐标（避免每帧 new Vector3） */
const _emitPos = Vector3.Zero()

/**
 * 把粒子发射点沿路径推进到弧长 head 处（path 已被 resampleByLength 均匀化，按索引线性插值即可）。
 * head 用弧长而不是索引，所以调“粒子速度”时不同长度的管道观感一致。
 * @param {Matrix} worldMatrix 节点 wrapper 的世界矩阵 —— 粒子系统跑在世界坐标里
 */
export function setPipeParticleHead(visual, head, worldMatrix) {
  const p = visual?.particles
  if (!p || p.path.length < 2 || !worldMatrix) return
  const { path, step, total } = p
  const h = total > 0 ? ((head % total) + total) % total : 0
  const i = Math.min(path.length - 2, Math.floor(h / step))
  const t = step > 0 ? (h - i * step) / step : 0
  Vector3.LerpToRef(path[i], path[i + 1], t, _emitPos)
  Vector3.TransformCoordinatesToRef(_emitPos, worldMatrix, p.head)
}

/** 释放粒子系统（“粒子流动”开关关掉 / 管道重建 / 删除节点时调用） */
export function disposePipeParticles(particles) {
  if (!particles) return
  particles.ps?.stop()
  particles.ps?.dispose()
  particles.head?.set(0, 0, 0)
}

/**
 * “粒子流动”开关：打开时补建粒子系统，关闭时停掉。
 * 粒子数量/大小由 createPipeFlowParticles + updatePipeParticleSize 负责，
 * 这里只处理有无。
 */
export function setPipeParticles(scene, node, visual) {
  if (!visual) return
  const want = node.props.particles !== false
  if (want && !visual.particles) {
    visual.particles = createPipeFlowParticles(scene, node, visual.path, visual.radius)
    updatePipeParticleSize(visual, node.props)
  } else if (!want && visual.particles) {
    disposePipeParticles(visual.particles)
    visual.particles = null
  }
}

/** 粒子大小随“粒子大小”参数变化（几何参数变化要走重建，见 pipeSignature） */
export function updatePipeParticleSize(visual, props) {
  const p = visual?.particles
  if (!p) return
  const size = clamp(props.particleSize, 0.05, 8) || 1
  p.ps.minSize = p.baseMin * size
  p.ps.maxSize = p.baseMax * size
}

/**
 * 构建一条完整管道
 * @returns {{tube:Mesh, casing:Mesh, flowMaterial, casingMaterial, flowTexture,
 *            flowOffset:number, flowHead:number, particles, tint:Color3, casingAlpha:number}}
 */
export function createPipeVisual(scene, node) {
  const props = node.props || {}
  const path = buildPipePath(props.points, props)
  const radius = Math.max(0.02, Number(props.radius) || 0.4)
  const radial = Math.max(3, Math.round(Number(props.radialSegments) || 16))
  const hex = props.color || '#00e5ff'

  const flowTexture = createFlowTexture(scene)
  flowTexture.uScale = Math.max(0.1, Number(props.repeat) || 5)
  const flowMaterial = createFlowMaterial(scene, flowTexture, hex)
  const tint = Color3.FromHexString(hex)
  const casingAlpha = Math.min(0.9, Math.max(0, Number(props.casingOpacity) || 0))
  const casingMaterial = createCasingMaterial(scene, hex, casingAlpha)

  const geometry = {
    path,
    tessellation: radial,
    updatable: true,
    invertUV: true, // u ↔ v 互换，让 u 沿管道方向 → uOffset 才能做流动
    cap: Mesh.CAP_ALL,
  }

  const tube = path
    ? MeshBuilder.CreateTube(`pipe_${node.id}`, { ...geometry, radius }, scene)
    : null
  if (tube) {
    tube.material = flowMaterial
    tube.renderingGroupId = 1 // 画在透明外壳之后
    tube.isPickable = true
    tube.metadata = { nodeId: node.id }
  }

  const casing = path
    ? MeshBuilder.CreateTube(
        `pipeCasing_${node.id}`,
        { ...geometry, radius: radius * CASING_SCALE, tessellation: Math.max(6, radial) },
        scene,
      )
    : null
  if (casing) {
    casing.material = casingMaterial
    casing.renderingGroupId = 0
    casing.isPickable = false // 点击时只选中内芯
    casing.metadata = { nodeId: node.id }
  }

  const particles =
    props.particles === false
      ? null
      : createPipeFlowParticles(scene, node, path, radius)

  return {
    tube,
    casing,
    flowMaterial,
    casingMaterial,
    flowTexture,
    flowOffset: 0,
    flowHead: 0, // 粒子发射点已走过的弧长
    particles,
    path,
    radius, // 补建粒子系统时要用（视觉上等价于 props.radius）
    tint,
    casingAlpha,
  }
}

/**
 * 影响几何的字段：任一项变化都要重建管道
 * （CreateTube 的 instance 更新要求路径点数完全相同）
 */
export function pipeSignature(props = {}) {
  const pts = (Array.isArray(props.points) ? props.points : []).map((p) => [
    Number(p?.[0]) || 0,
    Number(p?.[1]) || 0,
    Number(p?.[2]) || 0,
  ])
  return JSON.stringify([
    Number(props.radius) || 0,
    Number(props.filletRadius) || 0,
    Math.round(Number(props.radialSegments) || 16),
    Math.round(Number(props.tubeSegments) || 96),
    pts,
  ])
}

/** 只改颜色 / 外壳浓度 / 流速 / 粒子参数时不需要重建几何 */
export function updatePipeLook(visual, props) {
  if (!visual) return
  const color = Color3.FromHexString(props.color || '#00e5ff')
  visual.flowMaterial.diffuseColor = color
  visual.flowMaterial.emissiveColor = color
  visual.casingMaterial.emissiveColor = color.scale(0.05)
  visual.casingMaterial.alpha = Math.min(0.9, Math.max(0, Number(props.casingOpacity) || 0))
  visual.flowTexture.uScale = Math.max(0.1, Number(props.repeat) || 5)
  updatePipeParticleSize(visual, props)
  if (visual.particles) {
    // 粒子颜色跟随能量色（透明度沿用创建时的值）
    const p = visual.particles.ps
    p.color1.set(color.r, color.g, color.b, p.color1.a)
    p.color2.set(Math.min(1, color.r + 0.35), Math.min(1, color.g + 0.35), Math.min(1, color.b + 0.35), p.color2.a)
    p.colorDead.set(color.r * 0.4, color.g * 0.4, color.b * 0.4, 0)
  }
}

export function disposePipeVisual(visual) {
  if (!visual) return
  disposePipeParticles(visual.particles)
  visual.casing?.dispose()
  visual.tube?.dispose()
  visual.casingMaterial?.dispose()
  visual.flowMaterial?.dispose()
  visual.flowTexture?.dispose()
}
