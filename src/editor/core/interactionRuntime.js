/**
 * InteractionRuntime —— 节点鼠标交互的运行时（点击 / 划过 → 半透明 / 外轮廓光 / 视角飞行）
 *
 * 挂在 EditorEngine 上，只依赖 Babylon 对象，不碰 Vue（与内核其余部分同一约定）。
 *
 * 触发语义（协议见 schema/sceneSchema.js 的 node.interaction）：
 *   hover —— 划过生效、移出还原（pointerdown 也立即还原：不允许 orbiting 途中黏一个效果）
 *   click —— 保持式：点一下生效并保持，点到别的节点 / 空白处（或删节点 / 改配置 /
 *            关预览）才还原；同节点再点保持效果，视角飞行照飞（重新取景）
 *
 * 三条红线（和内核里 dataHub 注入一样的克制）：
 *   - 只做「触发时叠加、还原时恢复」：材质改什么，快照里就存什么，绝不写坏基线；
 *   - 只认有网格的 kind（primitive / model / html / web）：pipe / effect 的材质归
 *     pipeBuilder / datav 组件管（look 状态机是它们的），light 没有网格；
 *   - 预览开关（setEnabled）只影响编辑器，不动文档字段。
 */

import { Color3, Material, PointerEventTypes, SelectionOutlineLayer, Vector3 } from '@babylonjs/core'
import { flyCameraTo, bindCameraFlyInterrupt } from './cameraFly'

/** 参与交互的 kind：都有网格；pipe/effect 材质不由引擎直管，light 没网格 */
const SUPPORTED_KINDS = new Set(['primitive', 'model', 'html', 'web'])

export default class InteractionRuntime {
  /**
   * @param {import('./EditorEngine').default} engine 编辑器内核（读 camera / scene / entries）
   */
  constructor(engine) {
    this.engine = engine
    this.scene = engine.scene
    /** 编辑器预览开关：false 时 pointer 分支整体短路（配置照常存档 / 导出） */
    this.enabled = true
    /** nodeId -> interaction（规范化后的配置） */
    this._cfg = new Map()
    /** nodeId -> ['transparent','outline'] 当前生效中的可还原效果 */
    this._live = new Map()
    /** nodeId -> [{ material }]：应用过半透明的材质引用（还原时据此归位） */
    this._snap = new Map()
    /** material -> 改之前的 { alpha, color, transparencyMode, depthPrePass }。
     *  按材质（不按节点）存：共享材质的多个节点只记一份真原值，
     *  最后一个引用它的节点还原时才归位 */
    this._matOrigin = new Map()
    /** nodeId -> mesh[]：挂在描边 layer 选择集里的网格（还原时重建选择集） */
    this._glow = new Map()
    /** 当前悬停生效的 nodeId（hover 触发） */
    this._hovered = null
    /** 当前点击生效的 nodeId（click 触发）：保持生效，点别处 / 空白处才还原 */
    this._clicked = null
    /** 按下鼠标（orbit / gizmo 拖拽）期间不做 hover 更新 */
    this._pointerDown = false
    /** SelectionOutlineLayer：按需懒创建，没有节点用轮廓光就不建 */
    this._layer = null

    this._onPointer = (info) => this._handlePointer(info)
    this.scene.onPointerObservable.add(this._onPointer)

    // 悬停的地基：Babylon 默认**不在 pointermove 上拾取**——sceneInputManager 里
    // `pickResult = scene._registeredActions > 0 || scene.constantlyUpdateMeshUnderPointer
    // ? this._pickMove(evt) : null`，本项目没注册 ActionManager，不开这个开关的话
    // POINTERMOVE 的 pickInfo.pickedMesh 永远是 null，悬停逻辑整个空转
    // （POINTERTAP 走的是 down/up 拾取，不受影响，所以点击一直是好的）。
    // 代价是每次移动多一次 pick，正是悬停要的东西。
    this._setPointerPicking(true)

    // 用户一输入就停飞：不与 ArcRotateCamera 自己的输入抢镜头
    this._unbindInterrupt = bindCameraFlyInterrupt(
      engine.camera,
      engine.engine.getRenderingCanvas(),
    )
  }

  /** 移动拾取开关：跟着预览开关走（关预览时省下每帧一次 pick 的开销） */
  _setPointerPicking(on) {
    if (this.scene) this.scene.constantlyUpdateMeshUnderPointer = on
  }

  /* ============ 配置（store / 引擎调用） ============ */

  /** 节点实例化时登记配置（此时网格可能还没异步就绪，事件时才拿 entry） */
  attach(nodeId, interaction) {
    if (!nodeId) return
    this._cfg.set(nodeId, interaction || null)
  }

  /** 面板改了交互配置：先还原旧效果，再登记新配置（正在悬停的不补应用，等下一次触发） */
  update(nodeId, interaction) {
    this.restoreNode(nodeId)
    // 改的就是当前点击保持中的节点：旧效果已还原，保持态一并清掉
    if (this._clicked === nodeId) this._clicked = null
    this.attach(nodeId, interaction)
  }

  /** 预览开关：关的时候把所有生效中的效果收干净 */
  setEnabled(flag) {
    this.enabled = !!flag
    this._setPointerPicking(this.enabled)
    if (!this.enabled) this.reset()
  }

  /** 整场重置：loadDocument / 预览关闭时调用。保留配置与描边 layer。 */
  reset() {
    for (const nodeId of [...this._live.keys()]) this.restoreNode(nodeId)
    this._hovered = null
    this._clicked = null
    this._pointerDown = false
    this._matOrigin.clear()
  }

  /** 节点被删除：清它的效果残留与配置 */
  clearNode(nodeId) {
    this.restoreNode(nodeId)
    this._cfg.delete(nodeId)
    if (this._hovered === nodeId) this._hovered = null
    if (this._clicked === nodeId) this._clicked = null
  }

  /**
   * 节点的网格被整体换掉（几何体改参数会重建 mesh）：已生效的效果作废——
   * 描边选择集 / 透明快照里引用的旧网格、旧材质已经或即将 dispose，
   * 挂着不摘会在渲染 layer 时报错。等下一次触发重新生效。
   */
  onMeshReplaced(nodeId) {
    this.restoreNode(nodeId)
    if (this._hovered === nodeId) this._hovered = null
    if (this._clicked === nodeId) this._clicked = null
  }

  dispose() {
    this.scene.onPointerObservable.remove(this._onPointer)
    this._unbindInterrupt?.()
    this._setPointerPicking(false)
    this.reset()
    this._layer?.dispose()
    this._layer = null
  }

  /* ============ 指针派发 ============ */

  _handlePointer(info) {
    if (!this.enabled) return
    switch (info.type) {
      case PointerEventTypes.POINTERMOVE:
        this._onMove(info.pickInfo)
        break
      case PointerEventTypes.POINTERDOWN:
        // 开始 orbit / 拖 gizmo：悬停效果立刻收，别在镜头途中黏一个半透明
        this._pointerDown = true
        if (this._hovered) {
          this.restoreNode(this._hovered)
          this._hovered = null
        }
        break
      case PointerEventTypes.POINTERUP:
        this._pointerDown = false
        break
      case PointerEventTypes.POINTERTAP: {
        const hit = this._hitEntry(info.pickInfo)
        if (hit) this._onTap(hit.id, hit.entry)
        // 点空白 / 点到不支持的节点 = 失焦：点击保持中的效果收回
        else if (this._clicked) {
          this.restoreNode(this._clicked)
          this._clicked = null
        }
        break
      }
      default:
        break
    }
  }

  _onMove(pickInfo) {
    if (this._pointerDown) return
    const hit = this._hitEntry(pickInfo)
    // 只把「hover 触发」的节点当悬停目标：划到 click / none 触发的节点（或空白）上
    // 都不该接管——否则点击保持的效果会被一次划走偷偷还原，_clicked 还与实际脱节
    const next = hit && this._cfg.get(hit.id)?.trigger === 'hover' ? hit.id : null
    if (next === this._hovered) return
    if (this._hovered) this.restoreNode(this._hovered)
    this._hovered = next
    if (next) this._applyNode(next, this.engine.entries.get(next))
  }

  _onTap(nodeId, entry) {
    const cfg = this._cfg.get(nodeId)
    if (cfg?.trigger !== 'click') return
    // 保持式：换节点 = 还原旧的、应用新的；同节点再点 = 保持效果，视角飞行照飞（重新取景）
    if (this._clicked === nodeId) {
      if (cfg.camera.enabled) this._flyTo(nodeId, entry, cfg.camera)
      return
    }
    if (this._clicked) this.restoreNode(this._clicked)
    this._clicked = nodeId
    this._applyNode(nodeId, entry)
  }

  /**
   * 拾取结果 → { id, entry }。只认引擎登记过、且 kind 在支持列表里的节点；
   * 点不中 / 不支持一律 null（上层按「还原」处理）。
   */
  _hitEntry(pickInfo) {
    const mesh = pickInfo?.pickedMesh
    if (!mesh) return null
    let node = mesh
    let id = null
    while (node) {
      if (node.metadata?.nodeId) {
        id = node.metadata.nodeId
        break
      }
      node = node.parent
    }
    if (!id) return null
    const entry = this.engine.entries?.get(id)
    if (!entry || !SUPPORTED_KINDS.has(entry.kind)) return null
    if (!this._cfg.get(id)) return null
    return { id, entry }
  }

  /* ============ 效果应用 / 还原 ============ */

  _applyNode(nodeId, entry) {
    const cfg = this._cfg.get(nodeId)
    if (!cfg || cfg.trigger === 'none') return
    if (!SUPPORTED_KINDS.has(entry.kind) || !this._meshesOf(entry).length) return

    const live = this._live.get(nodeId) || new Set()
    if (cfg.transparent.enabled && !live.has('transparent')) {
      this._applyTransparent(nodeId, entry, cfg.transparent)
      live.add('transparent')
    }
    if (cfg.outline.enabled && !live.has('outline')) {
      this._applyOutline(nodeId, entry, cfg.outline)
      live.add('outline')
    }
    if (live.size) this._live.set(nodeId, live)

    if (cfg.camera.enabled) this._flyTo(nodeId, entry, cfg.camera)
  }

  restoreNode(nodeId) {
    if (this._live.get(nodeId)?.has('transparent')) this._restoreTransparent(nodeId)
    if (this._live.get(nodeId)?.has('outline')) this._restoreOutline(nodeId)
    this._live.delete(nodeId)
  }

  /* ---- 半透明 ---- */

  /** entry 涉及的材质集合（模型多网格、面板单网格都走这里） */
  _materialsOf(entry) {
    const set = new Set()
    const push = (mesh) => {
      if (mesh?.material) set.add(mesh.material)
    }
    const meshes = this._meshesOf(entry)
    if (meshes.length) for (const m of meshes) push(m)
    else if (entry.object) push(entry.object)
    return [...set]
  }

  /**
   * entry 的网格清单：模型走 container.meshes（多网格），几何体 / 面板是
   * entry.object 单网格。加载中的空占位（meshes 空、object 为 null）返回 []。
   */
  _meshesOf(entry) {
    const list = (entry.meshes || []).filter((m) => m && !m.isDisposed?.())
    if (list.length) return list
    const obj = entry.object
    // getTotalIndices 只有 Mesh / InstancedMesh 有：顺带排掉 TransformNode、灯光
    if (obj && !obj.isDisposed?.() && typeof obj.getTotalIndices === 'function') return [obj]
    return []
  }

  /** PBR 走 albedoColor、Standard 走 diffuseColor；ShaderMaterial 之类只罩 alpha */
  _tintOf(material) {
    return material.albedoColor || material.diffuseColor || null
  }

  _applyTransparent(nodeId, entry, cfg) {
    const opacity = Math.min(1, Math.max(0.02, Number(cfg.opacity) || 0.35))
    const tint = Color3.FromHexString(cfg.color || '#00e5ff')
    const snapshot = []
    for (const material of this._materialsOf(entry)) {
      // 材质级原始值表：第一次被改时记录真原值，最后一个引用它的节点还原时归位。
      // 不按节点各存一份——共享材质（两个节点同一 material）时，后应用的节点
      // 会把「已经改过的值」当原值存下来，还原时就归不到位
      if (!this._matOrigin.has(material)) {
        const tintProp = this._tintOf(material)
        this._matOrigin.set(material, {
          alpha: material.alpha,
          color: tintProp ? tintProp.clone() : null,
          transparencyMode: material.transparencyMode,
          depthPrePass: material.needDepthPrePass,
        })
      }
      snapshot.push({ material })

      material.alpha = opacity
      // glb 的 PBR 材质被 glTFLoader 显式写成 OPAQUE(0)
      // （loaders/glTF/2.0/glTFLoader.pure.js 读 alphaMode，默认 OPAQUE）。
      // 那之后 Material.needAlphaBlending() 只认 transparencyMode、完全不看 alpha
      // （pbrBaseMaterial.pure.js）——不切模式的话 opacity 设 0.05 和 0.95
      // 渲染结果一模一样，都是全不透明。null（legacy / Standard）不用动，它认 alpha。
      const mode = material.transparencyMode
      if (
        opacity < 1
        && typeof mode === 'number'
        && mode !== Material.MATERIAL_ALPHABLEND
        && mode !== Material.MATERIAL_ALPHATESTANDBLEND
      ) {
        material.transparencyMode = Material.MATERIAL_ALPHABLEND
      }
      // 半透明多网格模型不做深度预Pass，会从正面直接看穿内部背面（糊成一团）；
      // 先写深度再混合，观感才是「通透的实体」
      if (opacity < 1) material.needDepthPrePass = true
      const currentTint = this._tintOf(material)
      if (currentTint) currentTint.copyFrom(tint)
    }
    this._snap.set(nodeId, snapshot)
  }

  /** 这个材质是否还被「别的活节点」的快照引用 */
  _isMaterialSnapshotted(exceptNodeId, material) {
    return this._materialSnapshots(exceptNodeId, material).length > 0
  }

  /** 别的活节点里引用这个材质的快照条目 */
  _materialSnapshots(exceptNodeId, material) {
    const out = []
    for (const [nodeId, snapshot] of this._snap) {
      if (nodeId === exceptNodeId) continue
      for (const entry of snapshot) {
        if (entry.material === material) out.push(entry)
      }
    }
    return out
  }

  _restoreTransparent(nodeId) {
    const snapshot = this._snap.get(nodeId)
    if (!snapshot) return
    // 先摘自己的账，再按「还有没有别人在用」决定哪些材质真要归位
    this._snap.delete(nodeId)
    for (const { material } of snapshot) {
      if (this._isMaterialSnapshotted(null, material)) continue
      const origin = this._matOrigin.get(material)
      if (!origin) continue // 没被改过（理论上是空操作，防御）
      material.alpha = origin.alpha
      material.transparencyMode = origin.transparencyMode
      material.needDepthPrePass = origin.depthPrePass === true
      if (origin.color) {
        const tintProp = this._tintOf(material)
        if (tintProp) tintProp.copyFrom(origin.color)
      }
      this._matOrigin.delete(material)
    }
  }

  /* ---- 外轮廓光（SelectionOutlineLayer） ---- */

  _ensureLayer() {
    if (this._layer) return this._layer
    // 用 SelectionOutlineLayer 而不是 HighlightLayer：后者 innerGlow 默认开着，
    // 会把高亮色涂满整个模型剪影内部（「整个被颜色盖住」的元凶）；而且它的
    // outer/inner 双 pass 对多网格 glb 经常把内部缝线也描出来。SelectionOutlineLayer
    // 的着色器是边缘梯度检测（Sobel），只在轮廓外沿着色——就是「轮廓外边缘的光」。
    this._layer = new SelectionOutlineLayer('interactionOutline', this.scene, {
      // 光滑度三件套（默认值全是「性能档」，出来就是锯齿边）：
      //   mainTextureRatio 1 —— mask 全分辨率。默认 0.5 时 Sobel 边缘检测跑在
      //     半配画质的剪影上，描边全是台阶；这是「不够光滑」的首犯
      //   mainTextureSamples 4 —— layer 自己的 RT 开 4x MSAA。Babylon 主画布有
      //     抗锯齿，但 layer 的 RT 默认 samples=1，剪影边缘照样台阶化
      //   outlineThickness 2 —— 描边粗细（texel）。全分辨率下 2 就是利落的一圈细线
      mainTextureRatio: 1,
      mainTextureSamples: 4,
      outlineThickness: 2,
    })
    return this._layer
  }

  _applyOutline(nodeId, entry, cfg) {
    const layer = this._ensureLayer()
    // 颜色是 layer 级的：同一时刻只该有一个节点的描边色生效（后触发的赢）。
    // 悬停节点 + 点击保持的节点同时描边时共用一个色——配置里本来也常设同一个色
    layer.outlineColor = Color3.FromHexString(cfg.color || '#ffd640')
    // 一组网格整体描边：模型由多个 mesh 组成时，接缝处不会出现内部线条
    const meshes = this._meshesOf(entry)
    if (!meshes.length) return
    layer.addSelection(meshes)
    this._glow.set(nodeId, meshes)
  }

  _restoreOutline(nodeId) {
    if (!this._glow.has(nodeId) || !this._layer) return
    this._glow.delete(nodeId)
    // 没有「摘一个网格」的公开 API：整组清掉，把还活着的节点重新加回去
    // （重建的代价只是往 selection 列表里 push，不涉及 GPU 资源重建；
    //  一个都不剩时 layer 自己停止渲染）
    this._layer.clearSelection()
    for (const meshes of this._glow.values()) {
      const alive = meshes.filter((m) => !m.isDisposed?.())
      if (alive.length) this._layer.addSelection(alive)
    }
  }

  /* ---- 视角飞行 ---- */

  _flyTo(nodeId, entry, camCfg) {
    const camera = this.engine.camera
    if (!camera) return
    const duration = Number(camCfg?.duration) || 1200

    // 指定机位：alpha / beta / radius / target 全听 view 的（弧度存文档）
    if (camCfg?.mode === 'custom' && camCfg.view) {
      const v = camCfg.view
      flyCameraTo(camera, {
        target: new Vector3(v.target[0], v.target[1], v.target[2]),
        alpha: v.alpha,
        beta: v.beta,
        radius: v.radius,
        duration,
      })
      return
    }

    // 自动框住：包围盒中心做目标点、对角线定距离（与 frameTargetOf 同一口径）
    const frame = this.engine.frameTargetOf?.(nodeId)
    if (!frame) return
    flyCameraTo(camera, { target: frame.target, radius: frame.radius, duration })
  }
}
