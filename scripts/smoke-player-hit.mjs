/**
 * 闭环验证「导出的场景里交互选不中」这个 bug：
 *   播放器 SceneRuntime._tagNodeMeshes 打标 → InteractionRuntime._hitEntry 能命中。
 * 之前播放器根本没打 metadata.nodeId（文件头注还写着「没有那一套」），
 * 所有网格都命中不了，悬停 / 点击在导出的 HTML 和 npm 包里全部失灵。
 * SceneRuntime 的构造要真 canvas，但 _tagNodeMeshes 是纯函数型的，直接在原型上调用。
 */
import { NullEngine, Scene, ArcRotateCamera, MeshBuilder, Vector3, PBRMaterial, Material } from '@babylonjs/core'
import SceneRuntime from '../../babylon-scene-player/src/SceneRuntime.js'
import InteractionRuntime from '../../babylon-scene-player/src/interactionRuntime.js'

let ok = true
const check = (name, cond) => { console.log(`  ${cond ? '✓' : '✗'} ${name}`); if (!cond) ok = false }

const engine = new NullEngine()
const scene = new Scene(engine)
const camera = new ArcRotateCamera('c', -Math.PI / 2, 1.28, 40, new Vector3(0, 1, 0), scene)

// 一个真的网格（lambo 那种 glb 模型加载后就是这样的一批 mesh）
const pbr = new PBRMaterial('glbMat', scene)
pbr.transparencyMode = Material.MATERIAL_OPAQUE // glTFLoader 的默认写法
const mesh = MeshBuilder.CreateBox('lambo_mesh', { size: 2 }, scene)
mesh.material = pbr

const entries = new Map()
entries.set('n_lambo', {
  kind: 'model', wrapper: null, object: mesh, meshes: [mesh],
})

const runtime = new InteractionRuntime({
  engine, scene, camera, entries,
  frameTargetOf: () => ({ target: new Vector3(0, 1, 0), radius: 20 }),
})
runtime.attach('n_lambo', {
  trigger: 'hover',
  transparent: { enabled: true, opacity: 0.6, color: '#00ffee' },
  outline: { enabled: false, color: '#ffd640' },
  camera: { enabled: false, duration: 1200, mode: 'auto', view: null },
})

console.log('\n[修复前的行为] 网格没有 metadata.nodeId')
check('未打标时 _hitEntry 返回 null（命中不了 → 交互失灵）', runtime._hitEntry({ pickedMesh: mesh }) === null)

console.log('\n[播放器的打标] SceneRuntime._tagNodeMeshes')
SceneRuntime.prototype._tagNodeMeshes.call({}, 'n_lambo', entries.get('n_lambo'))
check('网格被打上 metadata.nodeId', mesh.metadata?.nodeId === 'n_lambo')

const hit = runtime._hitEntry({ pickedMesh: mesh })
check('打标后 _hitEntry 命中该节点', hit?.id === 'n_lambo')
check('命中的 kind 是 model（支持列表内）', hit?.entry?.kind === 'model')

console.log('\n[命中 → 半透明真的生效]')
runtime._applyNode('n_lambo', entries.get('n_lambo'))
check('PBR 被切到 ALPHABLEND 且 alpha=0.6（0.05~1 可分辨的前提）',
  pbr.transparencyMode === 2 && Math.abs(pbr.alpha - 0.6) < 1e-6 && pbr.needAlphaBlending() === true)
check('albedo 被着色成 #00ffee', pbr.albedoColor.equals(pbr.albedoColor.constructor.FromHexString('#00ffee')))
runtime.restoreNode('n_lambo')
check('还原后回到 OPAQUE + alpha 1', pbr.transparencyMode === 0 && pbr.alpha === 1)

console.log(ok ? '\n播放器命中链路 OK' : '\nFAILED')
process.exitCode = ok ? 0 : 1
