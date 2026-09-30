/**
 * 用 3dtet 项目真实的 public/scene.json 跑「manual 推送 + 悬停交互」例子。
 *   - 数据链路：播放器真实的 evaluateNode 求值 scene.json 里的 bindings
 *   - 交互链路：SceneRuntime._tagNodeMeshes 打标 → InteractionRuntime 悬停命中 → 半透明生效
 * lambo 是 glb，Node 里加载不了贴图，用同配置的占位网格代替（材质用 PBR + OPAQUE，
 * 和 glTFLoader 加载出来的一致）。
 */
import { readFileSync } from 'node:fs'
import { NullEngine, Scene, ArcRotateCamera, MeshBuilder, Vector3, PBRMaterial, Material, Color3, PointerEventTypes } from '@babylonjs/core'
import SceneRuntime from '../../babylon-scene-player/src/SceneRuntime.js'
import InteractionRuntime, { normalizeNodeInteraction } from '../../babylon-scene-player/src/interactionRuntime.js'
import { evaluateNode } from '../../babylon-scene-player/src/binding.js'

const doc = JSON.parse(readFileSync(new URL('../../3dtet/public/scene.json', import.meta.url), 'utf8'))
const lambo = doc.nodes.find((n) => n.name === 'lambo')

let ok = true
const check = (name, cond) => { console.log(`  ${cond ? '✓' : '✗'} ${name}`); if (!cond) ok = false }

console.log('[1] manual 推送 → bindings 求值（用播放器真实求值器 + 你的 scene.json）')
console.log('  scene.json 里的绑定:', JSON.stringify(lambo.bindings))
const push = (payload) => evaluateNode(lambo, { src_m: payload })
const on = push({ run: 1 })
const off = push({ run: 0 })
console.log('  pushData("src_m", { run: 1 }) →', JSON.stringify(on))
console.log('  pushData("src_m", { run: 0 }) →', JSON.stringify(off))
check('run=1 → visible: 1（模型显示）', on.visible === 1)
check('run=0 → visible: 0（模型隐藏）', off.visible === 0)

console.log('\n[2] 悬停交互（真实 interactionRuntime + 真实 _tagNodeMeshes）')
console.log('  scene.json 里的交互:', JSON.stringify(lambo.interaction))

const engine = new NullEngine()
const scene = new Scene(engine)
const camera = new ArcRotateCamera('c', -Math.PI / 2, 1.28, 40, new Vector3(0, 1, 0), scene)

// 占位 lambo：PBR 材质 + glTFLoader 的默认 OPAQUE（复现「不透明度曾失效」的场景）
const pbr = new PBRMaterial('lamboMat', scene)
pbr.transparencyMode = Material.MATERIAL_OPAQUE
const mesh = MeshBuilder.CreateBox('lambo_mesh', { size: 2 }, scene)
mesh.material = pbr

const entries = new Map()
entries.set(lambo.id, { kind: 'model', wrapper: null, object: mesh, meshes: [mesh] })

const runtime = new InteractionRuntime({
  engine, scene, camera, entries,
  frameTargetOf: () => ({ target: new Vector3(0, 1, 0), radius: 20 }),
})
runtime.attach(lambo.id, normalizeNodeInteraction(lambo))

// 播放器加载文档时的打标（修复「导出后交互选不中」的那一步）
SceneRuntime.prototype._tagNodeMeshes.call({}, lambo.id, entries.get(lambo.id))

console.log('  模拟鼠标移到 lambo 上…')
runtime._handlePointer({ type: PointerEventTypes.POINTERMOVE, pickInfo: { pickedMesh: mesh } })
check('命中节点（打标生效）', runtime._hovered === lambo.id)
check('PBR 切到 ALPHABLEND 且 alpha=0.6', pbr.transparencyMode === 2 && Math.abs(pbr.alpha - 0.6) < 1e-6)
check('材质被着色成 #00ffee', pbr.albedoColor.equals(Color3.FromHexString('#00ffee')))

console.log('  模拟鼠标移开…')
runtime._handlePointer({ type: PointerEventTypes.POINTERMOVE, pickInfo: { pickedMesh: null } })
check('还原：alpha 回 1、模式回 OPAQUE', pbr.alpha === 1 && pbr.transparencyMode === 0)

console.log(ok ? '\n3dtet 例子链路 OK —— 浏览器里看到的效果：lambo 每 2 秒显隐；鼠标划过变青色半透明、移开恢复'
  : '\nFAILED')
process.exitCode = ok ? 0 : 1
