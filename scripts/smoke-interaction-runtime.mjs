/**
 * 交互运行时的端到端回归（Node + NullEngine，无 GPU / 无浏览器）。
 *
 * 存在的意义：前几轮「hover 不生效 / 轮廓被填满 / 不透明度没反应」都是
 * 只在浏览器里目测发现的，每轮都要用户陪跑一遍。这个脚本把三条链路
 * （半透明还原 / 轮廓记账 / 相机飞行 + 悬停点击状态机）的关键判据钉死：
 *   - 半透明以 material.needAlphaBlending() === true 为「生效」判据
 *     （glb 的 PBR 被 glTFLoader 写成 OPAQUE，只改 alpha 时它是 false——
 *      这就是「0.05 和 0.95 一个样」的根因）
 *   - 还原后 alpha / transparencyMode / needDepthPrePass / 颜色全部归位
 *   - 0.05 与 0.95 必须产生不同 alpha（用户原始诉求的回归）
 *   - 相机飞行动画数量与可停止；悬停 / 点击 / 预览开关的状态迁移
 *
 * 跑法：npm run smoke:runtime
 */
import {
  NullEngine, Scene, ArcRotateCamera, MeshBuilder, Vector3, Color3,
  StandardMaterial, PBRMaterial, Material, PointerEventTypes,
} from '@babylonjs/core'
import InteractionRuntime from '../src/editor/core/interactionRuntime.js'
import { stopCameraFly, flyCameraTo } from '../src/editor/core/cameraFly.js'
let passed = 0
const fails = []
function check(name, cond) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`) }
  else { fails.push(name); console.log(`  ✗ ${name}`) }
}

/* ---------- 搭一个无头场景：相机 + 三种材质的网格 ---------- */
const engine = new NullEngine()
const scene = new Scene(engine)
const camera = new ArcRotateCamera('c', -Math.PI / 2, 1.28, 40, new Vector3(0, 1, 0), scene)

/** glb 场景的 PBR：glTFLoader 就是这么写的（alphaMode 默认 OPAUE → 显式 OPAQUE） */
const pbr = new PBRMaterial('glbMat', scene)
pbr.transparencyMode = Material.MATERIAL_OPAQUE
const std = new StandardMaterial('stdMat', scene)

const boxPbr = MeshBuilder.CreateBox('mPbr', { size: 2 }, scene)
boxPbr.material = pbr
const boxStd = MeshBuilder.CreateBox('mStd', { size: 2 }, scene)
boxStd.material = std
boxStd.position.x = 6
const boxPlain = MeshBuilder.CreateBox('mPlain', { size: 2 }, scene)
boxPlain.material = std // 和 boxStd 共享材质：快照按材质去重，不能互相打断
boxPlain.position.x = 12

// 引擎里网格都带 metadata.nodeId（点选/悬停都靠它往上找节点）
boxPbr.metadata = { nodeId: 'nPbr' }
boxStd.metadata = { nodeId: 'nStd' }
boxPlain.metadata = { nodeId: 'nPlain' }

const entries = new Map()
entries.set('nPbr', { kind: 'model', wrapper: null, object: boxPbr, meshes: [boxPbr] })
entries.set('nStd', { kind: 'primitive', wrapper: null, object: boxStd, meshes: [] })
entries.set('nPlain', { kind: 'primitive', wrapper: null, object: boxPlain, meshes: [] })

/** 内核的最小替身：运行时只碰这几个面 */
const fakeEngine = {
  engine,
  scene,
  camera,
  entries,
  frameTargetOf: (id) => ({ target: new Vector3(0, 2, 0), radius: 30 }),
}
const runtime = new InteractionRuntime(fakeEngine)

const cfg = {
  trigger: 'click',
  transparent: { enabled: true, opacity: 0.05, color: '#00e5ff' },
  outline: { enabled: false, color: '#ffd640' },
  camera: { enabled: false, duration: 1200, mode: 'auto', view: null },
}
for (const id of ['nPbr', 'nStd', 'nPlain']) runtime.attach(id, cfg)

/* ---------- 1. glb（PBR + OPAQUE）半透明必须真的生效 ---------- */
console.log('\n[1] glb PBR 半透明（用户原始 bug）')
console.log(`  前置状态: alpha=${pbr.alpha} transparencyMode=${pbr.transparencyMode} needAlphaBlending=${pbr.needAlphaBlending()}`)
check('复现前置：loader 写的 OPAQUE 下 alpha 被无视（needAlphaBlending=false）', pbr.needAlphaBlending() === false)
runtime._applyNode('nPbr', entries.get('nPbr'))
check('apply 后 alpha = 0.05', Math.abs(pbr.alpha - 0.05) < 1e-6)
check('apply 后 transparencyMode = ALPHABLEND(2)', pbr.transparencyMode === 2)
check('apply 后 needAlphaBlending() = true（这才是「起作用」的判据）', pbr.needAlphaBlending() === true)
check('apply 后 albedo 被着色成透明色', pbr.albedoColor.equals(Color3.FromHexString('#00e5ff')))

/* ---------- 2. 还原归位 ---------- */
console.log('\n[2] 还原归位')
runtime.restoreNode('nPbr')
check('还原 alpha = 1', pbr.alpha === 1)
check('还原 transparencyMode = OPAQUE(0)', pbr.transparencyMode === 0)
check('还原 needDepthPrePass = false', pbr.needDepthPrePass === false)
check('还原 needAlphaBlending() = false', pbr.needAlphaBlending() === false)
check('还原 albedo 回到原色', pbr.albedoColor.equals(new Color3(1, 1, 1)))

/* ---------- 3. 0.05 vs 0.95 必须不一样（用户原话的回归） ---------- */
console.log('\n[3] 0.05 与 0.95 必须可分辨')
const alphaAt = (opacity) => {
  runtime.restoreNode('nPbr')
  runtime._cfg.set('nPbr', { ...cfg, transparent: { ...cfg.transparent, opacity } })
  runtime._applyNode('nPbr', entries.get('nPbr'))
  return pbr.alpha
}
const a005 = alphaAt(0.05)
const a095 = alphaAt(0.95)
check(`0.05→alpha ${a005}、0.95→alpha ${a095}，两者不同`, a005 === 0.05 && a095 === 0.95)
runtime.restoreNode('nPbr')

/* ---------- 4. Standard 几何体：alpha 通路本来就走得通，也不能被改坏 ---------- */
console.log('\n[4] Standard 几何体')
const stdCfg = { ...cfg, transparent: { ...cfg.transparent, opacity: 0.5 } }
runtime._cfg.set('nStd', stdCfg)
runtime._applyNode('nStd', entries.get('nStd'))
check('apply 后 alpha = 0.5', std.alpha === 0.5)
check('apply 后 needAlphaBlending() = true', std.needAlphaBlending() === true)
check('apply 后 transparencyMode 不动（legacy null 保持原样）', std.transparencyMode === null)
// 共享材质：另一个节点还原不能把第一个的效果也冲掉
runtime._cfg.set('nPlain', stdCfg)
runtime._applyNode('nPlain', entries.get('nPlain'))
check('共享材质两个节点同时生效，alpha 仍 0.5', std.alpha === 0.5)
runtime.restoreNode('nPlain')
check('共享材质：还原后应节点（非主人）不动，alpha 仍 0.5', std.alpha === 0.5)
runtime.restoreNode('nStd')
check('共享材质：主人最后还原，alpha 才归 1', std.alpha === 1)
// 反序：主人先还原时把归属移交给后者，效果同样不被冲掉
runtime._applyNode('nStd', entries.get('nStd'))
runtime._applyNode('nPlain', entries.get('nPlain'))
runtime.restoreNode('nStd')
check('共享材质：主人先还原 → 归属移交，alpha 仍 0.5', std.alpha === 0.5)
runtime.restoreNode('nPlain')
check('共享材质：移交后最终还原，alpha 归 1', std.alpha === 1)

/* ---------- 5. 轮廓光记账（注入假 layer，不碰 GPU） ---------- */
console.log('\n[5] 轮廓光选择集记账')
const fakeLayer = {
  added: [], clears: 0, outlineColor: null,
  addSelection(m) { this.added.push(...(Array.isArray(m) ? m : [m])) },
  clearSelection() { this.clears += 1; this.added = [] },
}
runtime._layer = fakeLayer
const outlineCfg = {
  ...cfg,
  transparent: { ...cfg.transparent, enabled: false },
  outline: { enabled: true, color: '#ff0000' },
}
runtime._cfg.set('nPbr', outlineCfg)
runtime._cfg.set('nStd', outlineCfg)
runtime._applyNode('nPbr', entries.get('nPbr'))
check('apply 后网格进了选择集', fakeLayer.added.length === 1 && fakeLayer.added[0] === boxPbr)
check('apply 后 outlineColor 是配置色', fakeLayer.outlineColor.equals(Color3.FromHexString('#ff0000')))
runtime._applyNode('nStd', entries.get('nStd'))
check('第二个节点也进选择集', fakeLayer.added.length === 2)
runtime.restoreNode('nPbr')
check('还原一个节点：clearSelection 一次', fakeLayer.clears === 1)
check('还原一个节点：剩下的节点被重新加回', fakeLayer.added.length === 1 && fakeLayer.added[0] === boxStd)
runtime.restoreNode('nStd')
check('全部还原：选择集空', fakeLayer.added.length === 0 && fakeLayer.clears === 2)

/* ---------- 6. 相机飞行 ---------- */
console.log('\n[6] 相机飞行')
const animCount = () => scene._activeAnimatables.length
const camCfg = { ...cfg, transparent: { ...cfg.transparent, enabled: false }, camera: { enabled: true, duration: 800, mode: 'auto', view: null } }
runtime._cfg.set('nPbr', camCfg)
camera.target.set(10, 10, 10) // 故意不在目标点
camera.radius = 50
const flew = runtime._flyTo('nPbr', entries.get('nPbr'), camCfg.camera)
check('自动框住：返回 true', flew !== false)
check('自动框住：target + radius 两条动画', animCount() === 2)
stopCameraFly(camera)
// 幂等：目标点 / 距离都和当前一致时不该再起动画（直接测 flyCameraTo，
// 不走 _flyTo 的 fake frame——headless 下相机不 update，getter 读的是
// 插值中的 target，故意错开这个干扰项）
check(
  '已在目标点：不再起动画（幂等）',
  flyCameraTo(camera, { target: camera.target.clone(), radius: camera.radius }) === false
  && animCount() === 0,
)
camera.target.set(10, 10, 10)
camera.radius = 50
const viewCfg = {
  ...camCfg,
  camera: {
    enabled: true, duration: 800, mode: 'custom',
    view: { alpha: 1.2, beta: 1.1, radius: 80, target: [1, 2, 3] },
  },
}
runtime._flyTo('nPbr', entries.get('nPbr'), viewCfg.camera)
check('指定机位：target + alpha + beta + radius 四条动画', animCount() === 4)
stopCameraFly(camera)
check('stopCameraFly 全停', animCount() === 0)

/* ---------- 7. 悬停 / 点击状态机 ---------- */
console.log('\n[7] 指针状态机')
const hoverCfg = { ...cfg, trigger: 'hover' }
runtime._cfg.set('nPbr', hoverCfg)
runtime._cfg.set('nStd', hoverCfg)
runtime._handlePointer({ type: PointerEventTypes.POINTERMOVE, pickInfo: { pickedMesh: boxPbr } })
check('悬停生效', runtime._hovered === 'nPbr' && pbr.alpha === 0.05)
runtime._handlePointer({ type: PointerEventTypes.POINTERMOVE, pickInfo: { pickedMesh: boxStd } })
check('移到另一个节点：旧的还原、新的生效', runtime._hovered === 'nStd' && pbr.alpha === 1 && std.alpha === 0.05)
runtime._handlePointer({ type: PointerEventTypes.POINTERMOVE, pickInfo: { pickedMesh: null } })
check('移到空白：还原', runtime._hovered === null && std.alpha === 1)
runtime._handlePointer({ type: PointerEventTypes.POINTERMOVE, pickInfo: { pickedMesh: boxPbr } })
runtime._handlePointer({ type: PointerEventTypes.POINTERDOWN, pickInfo: { pickedMesh: boxPbr } })
check('按下鼠标（开始 orbit）：悬停立即还原', runtime._hovered === null && pbr.alpha === 1)
runtime._handlePointer({ type: PointerEventTypes.POINTERUP, pickInfo: {} })

const clickCfg = { ...cfg, trigger: 'click' }
runtime._cfg.set('nPbr', clickCfg)
runtime._cfg.set('nStd', clickCfg)
runtime._handlePointer({ type: PointerEventTypes.POINTERTAP, pickInfo: { pickedMesh: boxPbr } })
check('点击生效', runtime._clicked === 'nPbr' && pbr.alpha === 0.05)
runtime._handlePointer({ type: PointerEventTypes.POINTERTAP, pickInfo: { pickedMesh: boxPbr } })
check('再点同一个：保持生效（不失焦）', runtime._clicked === 'nPbr' && pbr.alpha === 0.05)
runtime._handlePointer({ type: PointerEventTypes.POINTERTAP, pickInfo: { pickedMesh: boxStd } })
check('点别的节点：旧的还原、新的生效', runtime._clicked === 'nStd' && pbr.alpha === 1 && std.alpha === 0.05)
runtime._handlePointer({ type: PointerEventTypes.POINTERTAP, pickInfo: { pickedMesh: null } })
check('点空白：还原并失焦', runtime._clicked === null && std.alpha === 1)

runtime._handlePointer({ type: PointerEventTypes.POINTERTAP, pickInfo: { pickedMesh: boxPbr } })
check('再次点击可重新生效', pbr.alpha === 0.05)

/* ---------- 8. 预览开关 / 网格重建 / 删除 ---------- */
console.log('\n[8] 预览开关与生命周期')
runtime.setEnabled(false)
check('关预览：生效中的效果全部还原', pbr.alpha === 1 && runtime._clicked === null && runtime._hovered === null)
check('关预览：scene 移动拾取同步关掉', scene.constantlyUpdateMeshUnderPointer === false)
runtime.setEnabled(true)
check('开预览：移动拾取打开（hover 的地基）', scene.constantlyUpdateMeshUnderPointer === true)
runtime._handlePointer({ type: PointerEventTypes.POINTERTAP, pickInfo: { pickedMesh: boxPbr } })
runtime.onMeshReplaced('nPbr')
check('网格被重建（改了几何体参数）：效果作废', runtime._clicked === null && pbr.alpha === 1)
runtime._handlePointer({ type: PointerEventTypes.POINTERTAP, pickInfo: { pickedMesh: boxStd } })
runtime.clearNode('nStd')
check('删节点：效果与配置一起清', std.alpha === 1 && runtime._cfg.get('nStd') === undefined)

/* ---------- 汇总 ---------- */
console.log(`\n${fails.length ? '✗' : '✓'} ${passed} passed, ${fails.length} failed`)
if (fails.length) { console.log('失败项:', fails); process.exitCode = 1 }
