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
  HDRCubeTexture,
  PointerEventTypes,
  UtilityLayerRenderer,
  PositionGizmo,
  RotationGizmo,
  ScaleGizmo,
} from '@babylonjs/core'
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic'
import { findCatalog } from '../schema/sceneSchema'
import { ENV_DEFAULT_PROPS } from '../schema/sceneSchema'
import {
  createPipeVisual,
  disposePipeVisual,
  updatePipeLook,
  pipeSignature,
  setPipeParticleHead,
  setPipeParticles,
} from './pipeBuilder'
import { createDigitalGround, disposeDigitalGround, updateDigitalGroundProps } from './digitalGround'
import { createHtmlPanel, createWebPanel } from './htmlPanel'

registerBuiltInLoaders() // glTF / glb / obj 等解析器注册到 SceneLoader

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
const EDGE_COLOR = new Color3(1, 0.84, 0.25)

/** HDR 环境：立方体边长。256 对天空盒够细，预滤波又不至于卡住浏览器 */
const ENV_SIZE = 256
/** 必须留 mipmap：天空盒模糊靠的是采样低级别 mip，没 mip 的话模糊度调了没反应 */
const ENV_NO_MIPMAP = false
const ENV_PREFILTER = true
/** 贴图加载超时（ms）：大 HDR + 软件渲染时会慢，但不能一直挂着 */
const ENV_TIMEOUT = 60000
/** 天空盒盒体尺寸：够大不大就行，反正是 infiniteDistance，永远碰不到 */
const SkyboxSize = 1000

const round3 = (v) => Math.round(v * 1000) / 1000

/**
 * 初始取景。以前 beta 取 π/2.8≈64°、半径 0.45×地面、视线盯在 y=1，
 * 相机比垂直视锥半角（默认焦距 0.8rad 时约 22.9°）还多俯了 20 多度，
 * 地平线被顶到画面外面 —— 一进场满屏都是地板，就是俗称的「头朝下」。
 * 现在把俯角压平、半径拉远、视点抬高一点：地平线落在画面中上部，
 * 地面只占下半幅。
 */
const INIT_BETA = Math.PI / 2.46 // 约 73°，从 +Y 轴算起；90° 才是完全平视
const INIT_RADIUS_RATIO = 0.62 // 初始机位半径 = 地面尺寸 × 这个
const INIT_TARGET_Y_RATIO = 0.025 // 视线瞄准点高度 = 地面尺寸 × 这个

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
    case 'html':
    case 'web':
      // HTML 面板的平面中心在 wrapper 原点，抬高半个高度才是「贴地挂着」
      return (Number(props.height) || 2.4) / 2
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
    this.envEntry = null
    this._selectedId = null
    this._gizmoMode = 'translate'
    this._disposed = false

    this.engine = new Engine(canvas, true, { antialias: true, alpha: false }, true)
    this.scene = new Scene(this.engine)
    // 网页面板的 <iframe> 浮层挂这儿：canvas 的父容器（.viewport，position:relative），
    // 浮层铺满它就和 canvas 完全重合
    this.overlayContainer = canvas?.parentElement || null
    // 这里以前写的是 scene.useLogarithmicDepth = true，Babylon 9 的 Scene 上没这个字段，
    // 赋值只是挂个没人读的属性，属于无效代码（已删）。对数深度现在是逐材质的
    // material.useLogarithmicDepth，要开就得给每个材质都开，本项目不需要。

    this._initCamera()
    this._initGizmos()
    this._initPicking()

    // 灯光每帧从 wrapper 朝向同步方向；能量管道每帧滚流动光带
    const up = Vector3.Up()
    const down = Vector3.Down()
    const tmpDir = Vector3.Zero()
    this.scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(0.1, this.engine.getDeltaTime() / 1000)

      // 数字科技地板：扩散波时钟（速度系数在 digitalGround 里乘，改速度即时生效）
      if (this.groundEntry?.setTime) {
        this._groundSeconds += dt
        this.groundEntry.setTime(this._groundSeconds)
      }

      for (const entry of this.entries.values()) {
        if (entry.kind === 'light') {
          if (entry.type === 'point') continue
          const base = entry.type === 'hemispheric' ? up : down
          Vector3.TransformNormalToRef(base, entry.wrapper.getWorldMatrix(), tmpDir)
          tmpDir.normalize()
          entry.object.direction.copyFrom(tmpDir)
        } else if (entry.kind === 'pipe' && entry.visual?.flowTexture) {
          const v = entry.visual
          v.flowOffset -= (entry.speed || 0) * dt
          v.flowTexture.uOffset = v.flowOffset
          // 管内粒子：发射点沿弧长匀速前进，粒子原地滞留淡出 → 一串流光
          if (v.particles) {
            v.flowHead += (entry.particleSpeed || 0) * dt
            setPipeParticleHead(v, v.flowHead, entry.wrapper.getWorldMatrix())
          }
        }
      }
    })

    // Gizmo 拖拽松手 → 回写 transform
    canvas.addEventListener('pointerup', this._onCanvasPointerUp)

    this.engine.runRenderLoop(() => {
      if (!this._disposed && this.scene.activeCamera) this.scene.render()
    })
    window.addEventListener('resize', this._onResize)

    // 侧栏折叠/展开会改变画布 CSS 尺寸，Babylon 不监听 ResizeObserver，这里补上
    this._resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(this._onResize) : null
    this._resizeObserver?.observe(canvas)

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
      INIT_BETA,
      40,
      // 文档还没加载、地面尺寸未知，先按默认 200 的地面给个取景点
      new Vector3(0, INIT_TARGET_Y_RATIO * 200, 0),
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
    const pending = doc.nodes.map(async (node) => {
      if (node.kind === 'model') {
        const file = await this.cb.resolveModelFile?.(node.props.assetId)
        if (file) await this.addModelNode(node, file, { dropToGround: false })
        else this._addEmptyModel(node)
      } else {
        this._instantiate(node)
      }
    })
    // 环境贴图一起加载：HDR 预滤波要几秒，别把它插在中间串行等
    pending.push(this._restoreEnvironment(doc.scene.environment))
    await Promise.all(pending)

    // 相机取景：按地面大小给一个合理的初始视角（俯角别压太低，见 INIT_BETA 注释）
    const size = doc.scene.ground.props.size || 200
    this.camera.alpha = -Math.PI / 2
    this.camera.beta = INIT_BETA
    this.camera.radius = Math.max(20, size * INIT_RADIUS_RATIO)
    this.camera.target.set(0, Math.max(1, size * INIT_TARGET_Y_RATIO), 0)
  }

  /* ============ 地面 ============ */

  setGround(ground) {
    // 数字科技地板：参数变化只改着色器 uniform，别把四张贴图反复重建
    if (this.groundEntry?.setTime && ground.type === 'digital') {
      updateDigitalGroundProps(this.groundEntry, ground.props)
      return
    }
    this._disposeGround()
    this._buildGround(ground)
  }

  setBackground(hex) {
    this.scene.clearColor = Color3.FromHexString(hex).toColor4(1)
  }

  _buildGround(ground) {
    const { type, props } = ground

    // 数字科技地板：圆盘 + 着色器，和平面地板完全不同的实现
    if (type === 'digital') {
      this.groundEntry = createDigitalGround(this.scene, props)
      this._groundSeconds = 0
      this.groundEntry.setTime(0)
      return
    }

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
    this.groundEntry = { mesh, material: mat, textures: [mat.diffuseTexture] }
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
    if (this.groundEntry.setTime) {
      // 数字科技地板：材质是 ShaderMaterial，贴图归它自己管
      disposeDigitalGround(this.groundEntry)
    } else {
      const { mesh, material, textures } = this.groundEntry
      mesh.dispose()
      material?.dispose()
      for (const t of textures || []) t?.dispose()
    }
    this.groundEntry = null
    this._groundSeconds = 0
  }

  /* ============ 环境（HDR 天空盒 / IBL） ============ */

  /**
   * 换 / 关全局环境。source 传 null = 回到无环境（背景只剩 clearColor 纯色）。
   *
   * HDR 走 blob objectURL → HDRCubeTexture：用 URL 而不是 base64，
   * 因为 HDR 动不动几 MB，塞进内存字符串再解码纯属浪费（glb 那边同理）。
   *
   * @param {{id:string,name:string,file:Blob}|null} source
   * @returns {Promise<boolean>} 是否加载成功（false 时场景保持原样）
   */
  async setEnvironment(source) {
    const props = source?.props
    if (!source?.file) {
      this._disposeEnvironment()
      return false
    }

    const url = URL.createObjectURL(source.file)
    const texture = await loadHdrTexture(url, this.scene, source.name)
    if (!texture || this._disposed) {
      texture?.dispose()
      URL.revokeObjectURL(url)
      if (texture) console.error('[EditorEngine] 引擎已释放，放弃环境贴图', source.name)
      return false
    }

    // 成功了再拆旧的，避免换一张失败把原来那套也弄丢了
    this._disposeEnvironment()
    this.envEntry = { texture, url, props: { ...ENV_DEFAULT_PROPS, ...(props || {}) } }
    this._applyEnvironment(this.envEntry.props)
    return true
  }

  /** 改环境参数：强度 / 旋转 / 模糊 / 天空盒开关。强度、旋转、开关都是即时生效；
    模糊要重建天空盒材质，所以只有这一项真的拆东西 */
  setEnvironmentProps(props) {
    if (!this.envEntry) return
    this.envEntry.props = { ...ENV_DEFAULT_PROPS, ...this.envEntry.props, ...(props || {}) }
    this._applyEnvironment(this.envEntry.props)
  }

  _applyEnvironment(props) {
    const entry = this.envEntry
    if (!entry) return
    const { texture } = entry

    // 旋转CubeTexture 的 rotationY 就行——scene.environmentRotationY 在 Babylon 里不存在
    texture.rotationY = ((Number(props.rotation) || 0) * Math.PI) / 180

    if (props.skybox === false) {
      if (entry.skybox) {
        entry.skybox.dispose()
        entry.skybox = null
      }
      this.scene.environmentTexture = null
      this.scene.environmentIntensity = 1
      return
    }

    // 模糊度只影响天空盒，不影响环境光照
    const blur = Math.max(0, Math.min(1, Number(props.blur) || 0))
    if (entry.blurApplied !== blur) {
      entry.skybox?.dispose()
      entry.skybox = null
      entry.blurApplied = blur
    }

    if (!entry.skybox) {
      // createDefaultSkybox 传 pbr=true 才有模糊：它内部是 PBRMaterial，
      // microSurface = 1 - blur 决定采样哪一级 mip。自带 isPickable=false /
      // infiniteDistance / ignoreCameraMaxZ，不会挡住点选
      entry.skybox = this.scene.createDefaultSkybox(texture, true, SkyboxSize, blur, false)
    }
    entry.skybox.setEnabled(true)
    this.scene.environmentTexture = texture
    // environmentIntensity 只压 IBL（间接光），天空盒本身多亮不受它影响
    this.scene.environmentIntensity = Math.max(0, Number(props.intensity) || 1)
  }

  _disposeEnvironment() {
    const entry = this.envEntry
    this.envEntry = null
    entry?.skybox?.dispose()
    entry?.texture?.dispose()
    if (entry?.url) URL.revokeObjectURL(entry.url)
  }

  /** 读档：按 scene.environment 还原环境（素材被删了就安静地回到无环境） */
  async _restoreEnvironment(env) {
    if (!env || env.type !== 'hdr' || !env.assetId) {
      this._disposeEnvironment()
      return
    }
    const file = await this.cb.resolveEnvFile?.(env.assetId)
    if (!file) {
      this._disposeEnvironment()
      return
    }
    const ok = await this.setEnvironment({
      id: env.assetId,
      name: env.assetName || '',
      file,
      props: env.props,
    })
    if (!ok) this._disposeEnvironment()
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

  /** 把容器根节点从 wrapper 摘回场景根：addModelNode 挂过来时容器的层级就不完整了 */
  _detachContainerRoots(container) {
    for (const root of container.rootNodes) root.parent = null
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
    } else if (node.kind === 'pipe') {
      entry.visual = this._createPipe(node)
      entry.object = entry.visual?.tube || null
      entry.material = entry.visual?.flowMaterial || null
      entry.speed = Number(node.props.speed) || 0
      entry.particleSpeed = Number(node.props.particleSpeed) || 0
      entry.sig = pipeSignature(node.props)
      if (entry.visual?.tube) entry.visual.tube.parent = wrapper
      if (entry.visual?.casing) entry.visual.casing.parent = wrapper
    } else if (node.kind === 'effect') {
      // 网格由 DatavEffect.vue 挂载的 babylon-datav 组件创建，
      // 就绪后通过 attachEffectMesh 回填 entry.object
      entry.effectMesh = findCatalog(node.kind, node.type)?.meshName || null
    } else if (node.kind === 'html') {
      // HTML 面板：createHtmlPanel 内部异步栅格化，这里先把网格建出来，
      // 内容画好之前是一块透明的（editor / player 两条路径都一样）
      entry.panel = createHtmlPanel(this.scene, node.props)
      entry.object = entry.panel.mesh
      entry.material = entry.panel.material
      entry.object.parent = wrapper
      entry.object.metadata = { nodeId: node.id }
    } else if (node.kind === 'web') {
      // 网页面板：平面只负责画外框，内容是盖在 canvas 上的真 <iframe>，
      // 挂载点用 canvas 的父元素（.viewport 是 position:relative，正好严丝合缝）
      entry.panel = createWebPanel(this.scene, node.props, this.overlayContainer || null)
      entry.object = entry.panel.mesh
      entry.material = entry.panel.material
      entry.object.parent = wrapper
      entry.object.metadata = { nodeId: node.id }
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

  /** 能量管道：内芯 + 外壳 + 流动贴图（几何参数见 pipeBuilder） */
  _createPipe(node) {
    return createPipeVisual(this.scene, node)
  }

  /** 折点/管径等几何参数变化：整体重建，并保留光带滚动相位 / 粒子进度 */
  _rebuildPipe(entry, nodeId, props) {
    const wasSelected = this._selectedId === nodeId
    const phase = entry.visual?.flowOffset || 0
    const head = entry.visual?.flowHead || 0

    disposePipeVisual(entry.visual)
    entry.visual = this._createPipe({ id: nodeId, props })
    entry.sig = pipeSignature(props)
    if (!entry.visual?.tube) return

    entry.visual.flowOffset = phase
    entry.visual.flowHead = head
    entry.visual.tube.parent = entry.wrapper
    entry.visual.tube.metadata = { nodeId }
    if (entry.visual.casing) entry.visual.casing.parent = entry.wrapper
    entry.object = entry.visual.tube
    entry.material = entry.visual.flowMaterial

    if (wasSelected) this._setPipeHighlight(entry.visual, true)
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

  /**
   * 名称只存在于文档里（网格名统一用 nodeId 生成，读档/点选都不依赖 name），
   * 但 store 会调这个方法，这里留个空实现避免调用不存在的函数报错。
   */
  renameNode() {}

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
    } else if (entry.kind === 'pipe') {
      const sig = pipeSignature(props)
      if (sig !== entry.sig) {
        // 折点或几何参数变化 → 重建（CreateTube 的 instance 更新要求路径点数一致）
        this._rebuildPipe(entry, nodeId, props)
      } else {
        updatePipeLook(entry.visual, props)
      }
      // 粒子开关 / 颜色 / 大小随时能改；速度只在每帧读，记在 entry 上
      setPipeParticles(this.scene, { id: nodeId, props }, entry.visual)
      entry.speed = Number(props.speed) || 0
      entry.particleSpeed = Number(props.particleSpeed) || 0
    } else if (entry.kind === 'effect') {
      this._applyEffectProps()
    } else if (entry.kind === 'html' || entry.kind === 'web') {
      // update 内部会判断「尺寸 / 朝向 / 内容有没有真变」，重复调用不重画
      entry.panel?.update(props)
    }
  }

  /**
   * DatavEffect.vue 认领到网格后回调：把组件创建的网格挂到节点 wrapper 下，
   * 之后 wrapper 的 transform / gizmo / 点选 / 聚焦全部自动生效。
   */
  attachEffectMesh(nodeId, mesh) {
    const entry = this.entries.get(nodeId)
    if (!entry || !mesh) return
    mesh.parent = entry.wrapper
    entry.object = mesh
    entry.material = mesh.material
    if (this._selectedId === nodeId) this._setEffectHighlight(entry, true)
  }

  /**
   * 特效节点：props 变化由组件自己的 watch 处理（内部会 rebuild），
   * 引擎这边什么都不用做。
   */
  _applyEffectProps() {}

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
        // 不先摘回来，removeAllFromScene 的层级自检会刷
        // "Node __root__ has a parent that is not in the container"
        this._detachContainerRoots(entry.container)
        entry.container.removeAllFromScene()
        entry.container.dispose()
      }
    } else if (entry.kind === 'pipe') {
      disposePipeVisual(entry.visual)
    } else if (entry.kind === 'effect') {
      // 网格由 Vue 组件卸载时释放；这里只解除选中态的包围盒
      if (entry.object) entry.object.showBoundingBox = false
      entry.object?.dispose()
    } else if (entry.kind === 'html' || entry.kind === 'web') {
      entry.panel?.dispose()
      entry.object = null
      entry.material = null
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
    } else if ((entry.kind === 'html' || entry.kind === 'web') && entry.object) {
      // 面板描边会被 DynamicTexture 的透明区域吃掉一部分，但足够看出选中
      this._setMeshHighlight(entry.object, on)
    } else if (entry.kind === 'pipe' && entry.visual) {
      this._setPipeHighlight(entry.visual, on)
    } else if (entry.kind === 'effect') {
      this._setEffectHighlight(entry, on)
    } else if (entry.kind === 'model') {
      this._setModelHighlight(entry, on)
    }
  }

  /**
   * 管道选中态：点亮外壳（半透明玻璃罩）而不是描边 ——
   * 管壁是 ribbon，开 edgesRendering 会把整条管道糊成一团。
   * （Babylon 9 的 renderOverlay 已不再参与渲染，只能自己改材质。）
   */
  _setPipeHighlight(visual, on) {
    const casing = visual?.casing
    if (!casing) return
    const mat = visual.casingMaterial
    if (on) {
      mat.emissiveColor = EDGE_COLOR.scale(0.55)
      mat.alpha = Math.min(0.95, (visual.casingAlpha || 0.2) + 0.28)
    } else {
      mat.emissiveColor = visual.tint.scale(0.05)
      mat.alpha = visual.casingAlpha
    }
  }

  /** 特效选中态：包围盒（组件材质由自己管，不适合直接改） */
  _setEffectHighlight(entry, on) {
    const mesh = entry.object
    if (!mesh || mesh.isDisposed()) return
    mesh.showBoundingBox = on
    if (on) {
      const box = this.scene.getBoundingBoxRenderer?.()
      if (box) {
        box.frontColor = EDGE_COLOR
        box.backColor = EDGE_COLOR
        box.showBackLines = false
      }
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
    if (entry.kind === 'primitive' || entry.kind === 'html' || entry.kind === 'web') {
      bounds = entry.object.getHierarchyBoundingVectors?.()
    } else if (entry.kind === 'pipe' && entry.visual?.tube) {
      bounds = entry.visual.tube.getHierarchyBoundingVectors?.()
    } else if (entry.kind === 'effect' && entry.object && !entry.object.isDisposed()) {
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
    this._resizeObserver?.disconnect()
    this._resizeObserver = null
    this.engine.getRenderingCanvas()?.removeEventListener('pointerup', this._onCanvasPointerUp)
    this._disposeEnvironment()
    this.engine.stopRenderLoop()
    this.scene.dispose()
    this.engine.dispose()
  }
}

/**
 * 建 HDRCubeTexture 并等它加载 + 预滤波完，失败返回 null。
 *
 * 两个坑都踩过：
 *  - HDRCubeTexture 没有 onErrorObservable，错误只能从构造函数的 onError 回调拿；
 *  - 命中缓存时 onLoad 也是 SetImmediate 触发的，不能构造完直接读 isReady()。
 * 所以留了个超时兜底：谁都不回调就只问一次状态，绝不无限挂着。
 *
 * @param {string} url hdr 地址（blob objectURL 或普通 URL）
 * @param {import('@babylonjs/core').Scene} scene
 * @param {string} name 出错时好知道是哪张图
 * @returns {Promise<import('@babylonjs/core').HDRCubeTexture|null>}
 */
function loadHdrTexture(url, scene, name) {
  return new Promise((resolve) => {
    let settled = false
    let timer = null
    let tex = null
    const done = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
    try {
      tex = new HDRCubeTexture(
        url,
        scene,
        ENV_SIZE,
        ENV_NO_MIPMAP,
        true, // generateHarmonics
        false, // gammaSpace：HDR 数据本身就是线性辐射度
        ENV_PREFILTER,
        () => done(tex),
        (msg, exc) => {
          console.error('[EditorEngine] HDR 解析失败：', name, msg, exc)
          done(null)
        },
      )
    } catch (err) {
      console.error('[EditorEngine] HDR 创建失败：', name, err)
      done(null)
      return
    }
    timer = setTimeout(() => done(tex?.isReady() ? tex : null), ENV_TIMEOUT)
  })
}
