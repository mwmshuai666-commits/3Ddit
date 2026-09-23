/**
 * EditorEngine —— 与 Vue 解耦的 Babylon 编辑器内核
 *
 * 职责：
 *  - Engine / Scene / ArcRotateCamera 初始化
 *  - 底板地面、参数化几何体、灯光的实例化与销毁
 *  - 点选、Gizmo（移动/旋转/缩放）、选中描边
 *  - Gizmo 拖拽结束把 transform 回写给 store
 *  - 文档（场景 JSON）的整体加载/重建
 *
 * 通信方式：构造时传入 callbacks（onSelectionChange / onTransform），
 * Vue 侧只通过公开方法操作内核，不直接碰 Babylon 对象。
 */

import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  Color3,
  TransformNode,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  SpotLight,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Texture,
  PointerEventTypes,
  UtilityLayerRenderer,
  PositionGizmo,
  RotationGizmo,
  ScaleGizmo,
} from '@babylonjs/core'
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic'

registerBuiltInLoaders() // glTF / glb / obj 等解析器注册到 SceneLoader

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
const EDGE_COLOR = new Color3(1, 0.84, 0.25)

const round3 = (v) => Math.round(v * 1000) / 1000

/** 几何体落位时相对地面的 y 偏移（让底部贴着地面） */
function groundOffsetY(type, props) {
  switch (type) {
    case 'box':
    case 'plane':
    case 'cylinder':
    case 'cone':
      return props.height / 2
    case 'sphere':
      return props.diameter / 2
    case 'torus':
      return props.thickness
    default:
      return 0
  }
}

export default class EditorEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onSelectionChange?:(id:string|null)=>void, onTransform?:(id:string,t:object)=>void}} callbacks
   */
  constructor(canvas, callbacks = {}) {
    this.cb = callbacks
    this.entries = new Map() // nodeId -> { wrapper, object, material, kind, type }
    this.groundEntry = null
    this._selectedId = null
    this._gizmoMode = 'translate'
    this._disposed = false

    this.engine = new Engine(canvas, true, { antialias: true, alpha: false }, true)
    this.scene = new Scene(this.engine)
    this.scene.useLogarithmicDepth = true

    this._initCamera()
    this._initGizmos()
    this._initPicking()

    // 有方向属性的灯光（平行光/聚光/半球）每帧从 wrapper 朝向同步方向
    const up = Vector3.Up()
    const down = Vector3.Down()
    const tmpDir = Vector3.Zero()
    this.scene.onBeforeRenderObservable.add(() => {
      for (const entry of this.entries.values()) {
        if (entry.kind !== 'light' || entry.type === 'point') continue
        const base = entry.type === 'hemispheric' ? up : down
        Vector3.TransformNormalToRef(base, entry.wrapper.getWorldMatrix(), tmpDir)
        tmpDir.normalize()
        entry.object.direction.copyFrom(tmpDir)
      }
    })

    // Gizmo 拖拽松手 → 回写 transform
    canvas.addEventListener('pointerup', this._onCanvasPointerUp)

    this.engine.runRenderLoop(() => {
      if (!this._disposed && this.scene.activeCamera) this.scene.render()
    })
    window.addEventListener('resize', this._onResize)

    // 仅开发期暴露，方便 CDP / 控制台冒烟调试
    if (import.meta.env.DEV) {
      window.__editorEngine = this
    }
  }

  /* ============ 初始化 ============ */

  _initCamera() {
    this.camera = new ArcRotateCamera(
      'editorCamera',
      -Math.PI / 2,
      Math.PI / 3.2,
      40,
      new Vector3(0, 1, 0),
      this.scene,
    )
    this.camera.minZ = 0.1
    this.camera.lowerRadiusLimit = 1
    this.camera.upperRadiusLimit = 2000
    this.camera.lowerBetaLimit = 0.02
    this.camera.upperBetaLimit = Math.PI / 2 - 0.02 // 不允许钻到地面以下
    this.camera.wheelDeltaPercentage = 0.01
    this.camera.pinchDeltaPercentage = 0.01
    this.camera.attachControl(this.engine.getRenderingCanvas(), true)
  }

  _initGizmos() {
    this.utilLayer = new UtilityLayerRenderer(this.scene)
    this.utilLayer.shouldRender = true

    this.gizmos = {
      translate: new PositionGizmo(this.utilLayer),
      rotate: new RotationGizmo(this.utilLayer),
      scale: new ScaleGizmo(this.utilLayer),
    }
    this._syncGizmos()
  }

  _initPicking() {
    this.scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERTAP) return
      const pick = info.pickInfo
      if (pick && pick.hit && pick.pickedMesh) {
        let node = pick.pickedMesh
        let id = null
        while (node) {
          if (node.metadata && node.metadata.nodeId) {
            id = node.metadata.nodeId
            break
          }
          node = node.parent
        }
        // 点到地面/空白 → 取消选择
        this.setSelected(id)
      } else {
        this.setSelected(null)
      }
    })
  }

  _onCanvasPointerUp = () => {
    if (this._selectedId) this._emitTransform(this._selectedId)
  }

  _onResize = () => this.engine.resize()

  /* ============ 文档加载 ============ */

  async loadDocument(doc) {
    // 清空旧内容
    for (const id of [...this.entries.keys()]) this._disposeEntry(id)
    this.setSelected(null)
    this._buildGround(doc.scene.ground)
    this.scene.clearColor = Color3.FromHexString(doc.scene.background || '#05070d').toColor4(1)

    // 模型节点异步加载（blob 由 store 层从素材库解析），互不阻塞
    await Promise.all(
      doc.nodes.map(async (node) => {
        if (node.kind === 'model') {
          const file = await this.cb.resolveModelFile?.(node.props.assetId)
          if (file) await this.addModelNode(node, file, { dropToGround: false })
          else this._addEmptyModel(node)
        } else {
          this._instantiate(node)
        }
      }),
    )

    // 相机取景：按地面大小给一个合理的初始视角
    const size = doc.scene.ground.props.size || 200
    this.camera.alpha = -Math.PI / 2
    this.camera.beta = Math.PI / 3.2
    this.camera.radius = Math.max(20, size * 0.45)
    this.camera.target.set(0, 1, 0)
  }

  /* ============ 地面 ============ */

  setGround(ground) {
    this._disposeGround()
    this._buildGround(ground)
  }

  setBackground(hex) {
    this.scene.clearColor = Color3.FromHexString(hex).toColor4(1)
  }

  _buildGround(ground) {
    const { type, props } = ground
    const size = props.size || 200
    const mesh = MeshBuilder.CreateGround(
      'editorGround',
      { width: size, height: size },
      this.scene,
    )
    mesh.metadata = { isGround: true }

    const mat = new StandardMaterial('groundMat', this.scene)
    mat.specularColor = new Color3(0, 0, 0)

    if (type === 'solid') {
      mat.diffuseColor = Color3.FromHexString(props.color || '#1c2635')
    } else {
      const isServerRoom = type === 'serverRoom'
      const tex = this._createGridTexture(
        props.color || '#0a1730',
        props.lineColor || '#1e6bff',
        isServerRoom,
      )
      const repeat = size / (props.tile || 10)
      tex.uScale = repeat
      tex.vScale = repeat
      mat.diffuseTexture = tex
      mat.emissiveTexture = tex
      mat.emissiveColor = new Color3(0.35, 0.35, 0.35)
    }

    mesh.material = mat
    this.groundEntry = { mesh, material: mat }
  }

  _createGridTexture(bg, line, serverRoom) {
    const px = 256
    const tex = new DynamicTexture('groundGrid', px, this.scene, false)
    tex.wrapU = Texture.WRAP_ADDRESSMODE
    tex.wrapV = Texture.WRAP_ADDRESSMODE
    const ctx = tex.getContext()

    ctx.fillStyle = bg
    ctx.fillRect(0, 0, px, px)

    if (serverRoom) {
      // 防静电地板：外圈边框 + 内圈承重板线 + 四角支脚点
      ctx.strokeStyle = line
      ctx.lineWidth = 6
      ctx.strokeRect(3, 3, px - 6, px - 6)
      ctx.globalAlpha = 0.45
      ctx.lineWidth = 2
      ctx.strokeRect(px * 0.18, px * 0.18, px * 0.64, px * 0.64)
      ctx.globalAlpha = 1
      ctx.fillStyle = line
      const d = 12
      ;[16, px - 16 - d].forEach((x) => {
        ;[16, px - 16 - d].forEach((y) => ctx.fillRect(x, y, d, d))
      })
    } else {
      // 科技网格：主边框 + 微弱中线
      ctx.strokeStyle = line
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, px - 4, px - 4)
      ctx.globalAlpha = 0.25
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px / 2, 0)
      ctx.lineTo(px / 2, px)
      ctx.moveTo(0, px / 2)
      ctx.lineTo(px, px / 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    tex.update()
    return tex
  }

  _disposeGround() {
    if (!this.groundEntry) return
    const { mesh, material } = this.groundEntry
    const tex = material.diffuseTexture
    mesh.dispose()
    material.dispose()
    tex?.dispose()
    this.groundEntry = null
  }

  /* ============ 节点实例化 ============ */

  addNode(node) {
    this._instantiate(node)
  }

  /** 素材缺失/加载失败时的占位：保留节点，场景树/删除仍可用 */
  _addEmptyModel(node) {
    const wrapper = new TransformNode(`w_${node.id}`, this.scene)
    wrapper.metadata = { nodeId: node.id }
    this._applyTransform(wrapper, node.transform)
    this.entries.set(node.id, {
      wrapper,
      object: null,
      material: null,
      kind: 'model',
      type: 'glb',
      meshes: [],
      container: null,
      loaded: false,
    })
  }

  /**
   * 异步加载 glb 模型并挂到节点 wrapper 下
   * @param {object} node 场景节点
   * @param {File} file glb 文件
   * @param {{dropToGround?: boolean}} opts 新拖入的模型按包围盒自动落到 y=0；读档时不重落
   */
  async addModelNode(node, file, { dropToGround = true } = {}) {
    // 已存在（如重复调用）先占位重建
    if (!this.entries.has(node.id)) this._addEmptyModel(node)
    const entry = this.entries.get(node.id)
    entry.loading = true

    let container
    try {
      container = await LoadAssetContainerAsync(file, this.scene)
    } catch (err) {
      console.error(`[EditorEngine] 模型加载失败：${node.props.assetName}`, err)
      entry.loading = false
      return
    }
    if (entry.cancelled || this._disposed) {
      container.dispose()
      return
    }

    container.addAllToScene()
    entry.container = container

    // 根节点挂到 wrapper；所有子网格打 nodeId 供点选/高亮
    for (const root of container.rootNodes) root.parent = entry.wrapper
    for (const mesh of container.meshes) {
      mesh.metadata = { ...(mesh.metadata || {}), nodeId: node.id }
    }
    entry.meshes = container.meshes

    this.scene.updateTransformMatrix(true, true)

    if (dropToGround) {
      // 包围盒最低点贴地：wrapper.position.y -= 局部最低点
      let minY = Infinity
      for (const mesh of container.meshes) {
        if (mesh.getTotalIndices?.() === 0 && !mesh.hasBoundingInfo) continue
        const min = mesh.getHierarchyBoundingVectors?.(true).min
        if (min) minY = Math.min(minY, min.y - entry.wrapper.position.y)
      }
      if (Number.isFinite(minY) && Math.abs(minY) > 1e-4) {
        entry.wrapper.position.y -= minY
        this._emitTransform(node.id)
      }
    }

    entry.loading = false
    entry.loaded = true

    if (this._selectedId === node.id) this._setModelHighlight(entry, true)
  }

  isModelLoaded(nodeId) {
    return !!this.entries.get(nodeId)?.loaded
  }

  _instantiate(node) {
    const wrapper = new TransformNode(`w_${node.id}`, this.scene)
    wrapper.metadata = { nodeId: node.id }

    const entry = { wrapper, object: null, material: null, kind: node.kind, type: node.type }

    if (node.kind === 'primitive') {
      entry.object = this._createPrimitiveMesh(node)
      entry.material = entry.object.material
      entry.object.parent = wrapper
      entry.object.metadata = { nodeId: node.id }
    } else if (node.kind === 'light') {
      entry.object = this._createLight(node)
      entry.object.parent = wrapper
    }

    this._applyTransform(wrapper, node.transform)
    this.entries.set(node.id, entry)
  }

  _createPrimitiveMesh(node) {
    const { type, props } = node
    const name = `m_${node.id}`
    let mesh
    switch (type) {
      case 'box':
        mesh = MeshBuilder.CreateBox(
          name,
          { width: props.width, height: props.height, depth: props.depth },
          this.scene,
        )
        break
      case 'sphere':
        mesh = MeshBuilder.CreateSphere(
          name,
          { diameter: props.diameter, segments: props.segments },
          this.scene,
        )
        break
      case 'cylinder':
        mesh = MeshBuilder.CreateCylinder(
          name,
          { height: props.height, diameter: props.diameter, tessellation: props.tessellation },
          this.scene,
        )
        break
      case 'cone':
        mesh = MeshBuilder.CreateCylinder(
          name,
          {
            height: props.height,
            diameterTop: 0,
            diameterBottom: props.diameter,
            tessellation: props.tessellation,
          },
          this.scene,
        )
        break
      case 'plane':
        mesh = MeshBuilder.CreatePlane(name, { width: props.width, height: props.height }, this.scene)
        break
      case 'torus':
        mesh = MeshBuilder.CreateTorus(
          name,
          { diameter: props.diameter, thickness: props.thickness, tessellation: 48 },
          this.scene,
        )
        break
      default:
        mesh = MeshBuilder.CreateBox(name, { size: 1 }, this.scene)
    }

    const mat = new StandardMaterial(`mat_${node.id}`, this.scene)
    mat.diffuseColor = Color3.FromHexString(props.color || '#5b8def')
    if (type === 'plane') mat.backFaceCulling = false
    mesh.material = mat
    return mesh
  }

  _createLight(node) {
    const { type, props } = node
    const name = `l_${node.id}`
    const color = Color3.FromHexString(props.color || '#ffffff')
    let light
    switch (type) {
      case 'hemispheric': {
        light = new HemisphericLight(name, Vector3.Up(), this.scene)
        light.groundColor = Color3.FromHexString(props.groundColor || '#3a4a6b')
        break
      }
      case 'directional':
        light = new DirectionalLight(name, Vector3.Down(), this.scene)
        break
      case 'point':
        light = new PointLight(name, Vector3.Zero(), this.scene)
        light.range = props.range ?? 50
        break
      case 'spot':
        light = new SpotLight(
          name,
          Vector3.Zero(),
          Vector3.Down(),
          (props.angle ?? 35) * DEG2RAD,
          props.exponent ?? 2,
          this.scene,
        )
        light.range = props.range ?? 50
        break
      default:
        light = new HemisphericLight(name, Vector3.Up(), this.scene)
    }
    light.intensity = props.intensity ?? 1
    light.diffuse = color
    return light
  }

  /* ============ 属性变更 ============ */

  updateProps(nodeId, props) {
    const entry = this.entries.get(nodeId)
    if (!entry) return

    if (entry.kind === 'primitive') {
      // 参数化几何体：直接重建网格（数量级小，简单可靠）
      const wasSelected = this._selectedId === nodeId
      const node = { type: entry.type, props, id: nodeId }
      const oldMesh = entry.object
      const newMesh = this._createPrimitiveMesh(node)
      newMesh.parent = entry.wrapper
      newMesh.metadata = { nodeId: nodeId }
      oldMesh.dispose()
      entry.object = newMesh
      entry.material = newMesh.material
      if (wasSelected) this._setMeshHighlight(newMesh, true)
    } else if (entry.kind === 'light') {
      this._applyLightProps(entry.object, entry.type, props)
    }
  }

  _applyLightProps(light, type, props) {
    if (props.intensity !== undefined) light.intensity = props.intensity
    if (props.color !== undefined) light.diffuse = Color3.FromHexString(props.color)
    if (type === 'hemispheric' && props.groundColor !== undefined) {
      light.groundColor = Color3.FromHexString(props.groundColor)
    }
    if ((type === 'point' || type === 'spot') && props.range !== undefined) {
      light.range = props.range
    }
    if (type === 'spot') {
      if (props.angle !== undefined) light.angle = props.angle * DEG2RAD
      if (props.exponent !== undefined) light.exponent = props.exponent
    }
  }

  removeNode(nodeId) {
    if (this._selectedId === nodeId) this.setSelected(null)
    this._disposeEntry(nodeId)
  }

  _disposeEntry(nodeId) {
    const entry = this.entries.get(nodeId)
    if (!entry) return
    if (entry.kind === 'model') {
      // 加载过程中删除：标记取消，异步回来后由 addModelNode 自行释放
      if (entry.loading) entry.cancelled = true
      if (entry.container) {
        entry.container.removeAllFromScene()
        entry.container.dispose()
      }
    } else {
      entry.object?.dispose()
      if (entry.kind === 'primitive') entry.material?.dispose()
    }
    entry.wrapper.dispose()
    this.entries.delete(nodeId)
  }

  /* ============ Transform ============ */

  _applyTransform(wrapper, t) {
    wrapper.position.set(t.position[0], t.position[1], t.position[2])
    // 旋转 Gizmo 会写入 rotationQuaternion；不清空的话面板修改 rotation 不生效
    wrapper.rotationQuaternion = null
    wrapper.rotation.set(
      t.rotation[0] * DEG2RAD,
      t.rotation[1] * DEG2RAD,
      t.rotation[2] * DEG2RAD,
    )
    wrapper.scaling.set(t.scaling[0], t.scaling[1], t.scaling[2])
  }

  /** 面板数值修改 transform */
  setNodeTransform(nodeId, transform) {
    const entry = this.entries.get(nodeId)
    if (entry) this._applyTransform(entry.wrapper, transform)
  }

  _emitTransform(nodeId) {
    const entry = this.entries.get(nodeId)
    if (!entry) return
    const { wrapper } = entry

    const rot = wrapper.rotationQuaternion
      ? wrapper.rotationQuaternion.toEulerAngles()
      : wrapper.rotation

    this.cb.onTransform?.(nodeId, {
      position: [round3(wrapper.position.x), round3(wrapper.position.y), round3(wrapper.position.z)],
      rotation: [round3(rot.x * RAD2DEG), round3(rot.y * RAD2DEG), round3(rot.z * RAD2DEG)],
      scaling: [round3(wrapper.scaling.x), round3(wrapper.scaling.y), round3(wrapper.scaling.z)],
    })
  }

  /** 新节点建议落位：当前相机目标点附近，y 让物体落在地面上 */
  suggestPlacement(node) {
    const t = this.camera.target
    const jitter = () => (Math.random() - 0.5) * 4
    return [
      round3(t.x + jitter()),
      groundOffsetY(node.type, node.props),
      round3(t.z + jitter()),
    ]
  }

  /* ============ 选择 / Gizmo ============ */

  setSelected(id) {
    if (this._selectedId === id) return
    const prev = this.entries.get(this._selectedId)
    if (prev) this._setEntryHighlight(prev, false)

    this._selectedId = id
    const entry = this.entries.get(id)
    if (entry) this._setEntryHighlight(entry, true)
    this._syncGizmos()

    this.cb.onSelectionChange?.(id)
  }

  _setEntryHighlight(entry, on) {
    if (entry.kind === 'primitive' && entry.object) {
      this._setMeshHighlight(entry.object, on)
    } else if (entry.kind === 'model') {
      this._setModelHighlight(entry, on)
    }
  }

  _setModelHighlight(entry, on) {
    for (const mesh of entry.meshes) this._setMeshHighlight(mesh, on)
  }

  _setMeshHighlight(mesh, on) {
    if (on) {
      mesh.enableEdgesRendering(0.99)
      mesh.edgesWidth = 2
      mesh.edgesColor = EDGE_COLOR.toColor4(1)
    } else {
      mesh.disableEdgesRendering()
    }
  }

  setGizmoMode(mode) {
    this._gizmoMode = mode
    this._syncGizmos()
  }

  /**
   * Babylon 9 的 Gizmo 没有 setEnabled：attachedNode 为 null 即禁用。
   * 因此只有当前模式对应的 Gizmo 挂到选中节点上。
   */
  _syncGizmos() {
    const entry = this.entries.get(this._selectedId)
    Object.entries(this.gizmos).forEach(([key, g]) => {
      const target = key === this._gizmoMode && entry ? entry.wrapper : null
      if (g.attachedNode !== target) g.attachedNode = target
    })
  }

  /** 镜头飞到选中物 */
  frameSelected(nodeId) {
    const entry = this.entries.get(nodeId)
    if (!entry) return
    const p = entry.wrapper.absolutePosition
    this.camera.target.set(p.x, Math.max(p.y, 1), p.z)

    let bounds = null
    if (entry.kind === 'primitive') {
      bounds = entry.object.getHierarchyBoundingVectors?.()
    } else if (entry.kind === 'model' && entry.meshes.length) {
      // 多网格合并世界包围盒
      let min = null
      let max = null
      for (const mesh of entry.meshes) {
        const b = mesh.getHierarchyBoundingVectors?.(true)
        if (!b) continue
        min = min ? Vector3.Minimize(min, b.min) : b.min.clone()
        max = max ? Vector3.Maximize(max, b.max) : b.max.clone()
      }
      bounds = min && max ? { min, max } : null
    }
    if (bounds) {
      const size = Vector3.Distance(bounds.max, bounds.min)
      this.camera.radius = Math.max(3, Math.min(size * 2.2, this.camera.radius))
    }
  }

  /* ============ 生命周期 ============ */

  dispose() {
    this._disposed = true
    window.removeEventListener('resize', this._onResize)
    this.engine.getRenderingCanvas()?.removeEventListener('pointerup', this._onCanvasPointerUp)
    this.engine.stopRenderLoop()
    this.scene.dispose()
    this.engine.dispose()
  }
}
