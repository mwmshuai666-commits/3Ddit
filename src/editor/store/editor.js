/**
 * 编辑器全局状态（Vue reactive）+ 动作
 *
 * 约定：所有对场景的修改都走这里的 action —— 同时修改 doc（可序列化的单一事实来源）
 * 和 engine（Babylon 表达）。doc 是纯 JSON，可直接写入 IndexedDB / 导出。
 */
import { reactive, watch } from 'vue'
import Dexie from 'dexie'
import { getEngine, createEngine } from '../core/engineHolder'
import { dataHub, dataHubPush } from '../core/dataHub'
import { evaluateNode } from '../core/binding'
import {
  GROUND_CATALOG,
  GROUND_SELECTION,
  PRIMITIVE_CATALOG,
  PIPE_SHAPE_PRESETS,
  createDefaultDocument,
  createNode,
  createModelNode,
  createHtmlNode,
  createWebNode,
  findCatalog,
  findGroundCatalog,
  genId,
  normalizeNodeData,
  normalizeNodeInteraction,
  normalizeSceneCamera,
  ENV_DEFAULT_PROPS,
  ENV_DOC_DEFAULT,
} from '../schema/sceneSchema'

class EditorDB extends Dexie {
  constructor() {
    super('TwinEditorDB')
    this.version(1).stores({
      scenes: '&key,savedAt',
    })
    this.version(2).stores({
      scenes: '&key,savedAt',
      // 素材库：id / 文件名 / 大小 / 入库时间 / blob
      assets: '&id,name,size,ts,blob',
    })
  }
}
const db = new EditorDB()
const SAVE_KEY = 'current'

/** 素材库列表（不含 blob，blob 用到时再按 id 取） */
export const assetLib = reactive([])

export const editor = reactive({
  doc: createDefaultDocument(),
  selectedId: null,
  gizmoMode: 'translate', // translate | rotate | scale
  loaded: false,
  saving: false,
  savedAt: null,
  /** 有没有还没落盘的改动（自动保存是延后的，期间顶栏铃铛亮个点） */
  dirty: false,
})

let saveTimer = null
let lastSavedAt = null

/* ============ 界面状态（面板开合 / 栏目展开 / 侧栏导航） ============ */

const LIB_SECTIONS = ['ground', 'primitive', 'light', 'effect', 'model', 'html', 'web', 'env']
const LIB_KEY = 'twinEditor.libSections'
const LEFT_KEY = 'twinEditor.leftPanelCollapsed'
const INSP_KEY = 'twinEditor.inspectorCollapsed'
/** 交互预览开关存「关闭」位（默认开着）：和左右栏的「存折叠态」一个方向，缺省即默认 */
const INTERACTION_OFF_KEY = 'twinEditor.interactionPreviewOff'
const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

function readBool(key, dflt) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? dflt : v === '1'
  } catch {
    return dflt // 隐私模式下 localStorage 会抛错，退回默认值
  }
}
function writeBool(key, v) {
  try {
    localStorage.setItem(key, v ? '1' : '0')
  } catch {
    /* 同上，存不进去不影响这次会话 */
  }
}

function readLibOpen() {
  const fallback = {
    ground: true, primitive: false, light: false, effect: false, model: false,
    html: false, web: false, env: false,
  }
  try {
    const saved = JSON.parse(localStorage.getItem(LIB_KEY) || 'null')
    if (!saved || typeof saved !== 'object') return fallback
    for (const key of LIB_SECTIONS) {
      fallback[key] = saved[key] === undefined ? fallback[key] : !!saved[key]
    }
  } catch {
    /* 存了个坏值就用默认的 */
  }
  return fallback
}

/**
 * 「哪些面板开着、展开到哪」。selectedId / gizmoMode 这类「在编辑什么」在 editor 里，
 * 这里只放 chrome 状态 —— 左右侧栏图标、顶栏导航、面板标题栏都要驱动同一份，
 * 所以它不能留在某个组件内部。
 */
export const ui = reactive({
  leftOpen: !readBool(LEFT_KEY, false),
  leftTab: 'library', // library | tree
  inspectorOpen: !readBool(INSP_KEY, false),
  libOpen: readLibOpen(),
  /** 最近一次「跳到某个栏目」的请求；序号自增，重复点同一项也要重新滚过去 */
  focus: { section: '', seq: 0 },
  /** 请求打开模型上传框（侧栏图标 / 视口浮动按钮） */
  uploadSeq: 0,
  /**
   * 交互预览开关（Inspector「交互」分区）。开着 = 编辑器里悬停 / 点击真实触发
   * 半透明 / 轮廓光 / 视角飞行（所见即所得）；关掉 = 只存档不触发，
   * 专心摆场景时不被半透明和镜头乱飞打扰。导出不受这个开关影响。
   */
  interactionPreview: !readBool(INTERACTION_OFF_KEY, false),
})

function persistLib() {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(ui.libOpen))
  } catch {
    /* 忽略 */
  }
}

export function toggleLibSection(key) {
  ui.libOpen[key] = !ui.libOpen[key]
  persistLib()
}

/** 有开着的就全收，全关上就全开 */
export function toggleAllLibSections() {
  const anyOpen = LIB_SECTIONS.some((k) => ui.libOpen[k])
  for (const key of LIB_SECTIONS) ui.libOpen[key] = !anyOpen
  persistLib()
}

/** 侧栏图标：展开左面板、切到搭建页、展开该栏目并滚到它 */
export function focusLibSection(section) {
  ui.leftOpen = true
  ui.leftTab = 'library'
  ui.libOpen[section] = true
  persistLib()
  ui.focus = { section, seq: ui.focus.seq + 1 }
}

/** 顶栏导航：只切页，不动栏目展开状态 */
export function showPanelTab(tab) {
  ui.leftOpen = true
  ui.leftTab = tab
}

export function toggleLeftPanel() {
  ui.leftOpen = !ui.leftOpen
  writeBool(LEFT_KEY, !ui.leftOpen)
}

export function toggleInspector() {
  ui.inspectorOpen = !ui.inspectorOpen
  writeBool(INSP_KEY, !ui.inspectorOpen)
}

/**
 * 交互预览开关：只影响编辑器里触不触发（半透明 / 轮廓光 / 视角飞行），
 * 文档里的 interaction 配置照常保存、照常导出。关掉时把已生效的效果收干净。
 */
export function toggleInteractionPreview() {
  ui.interactionPreview = !ui.interactionPreview
  writeBool(INTERACTION_OFF_KEY, !ui.interactionPreview)
  getEngine()?.setInteractionEnabled(ui.interactionPreview)
}

/** 打开模型上传那一栏并弹出文件框（侧栏图标 / 视口浮动按钮） */
export function requestModelUpload() {
  focusLibSection('model')
  ui.uploadSeq += 1
}

function markDirty() {
  if (!editor.loaded) return
  editor.dirty = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 800)
}

export async function saveNow() {
  clearTimeout(saveTimer)
  if (!editor.loaded) return
  editor.saving = true
  const record = { key: SAVE_KEY, savedAt: Date.now(), doc: JSON.parse(JSON.stringify(editor.doc)) }
  try {
    await db.scenes.put(record)
    lastSavedAt = record.savedAt
    editor.savedAt = new Date(record.savedAt)
    editor.dirty = false
  } finally {
    editor.saving = false
  }
}

async function loadSaved() {
  const record = await db.scenes.get(SAVE_KEY)
  if (record?.doc) {
    // 老文档没有 hidden / bindings / sources，读档时补齐（schema 的 normalizeNodeData）
    const doc = record.doc
    doc.sources = Array.isArray(doc.sources) ? doc.sources : []
    doc.nodes = (doc.nodes || []).map(normalizeNodeData)
    editor.doc = doc
    // 遗留死源清一遍：节点被删过 / 绑定解过又存了档的，读档不该再把 ws 拉起来
    // （只动文档；dataHub.start 在 initEditor 里随后按干净的定义跑）
    dropUnusedSources()
    editor.savedAt = record.savedAt ? new Date(record.savedAt) : null
    lastSavedAt = record.savedAt
    return true
  }
  return false
}

/** Viewport 挂载后调用：创建引擎并恢复上次场景 */
export async function initEditor(canvas) {
  const engine = createEngine(canvas, {
    onSelectionChange: (id) => {
      editor.selectedId = id
    },
    onTransform: (id, transform) => {
      const node = findNode(id)
      if (node) node.transform = transform
    },
    // 引擎读档时按 assetId 把 glb blob 还原成 File
    resolveModelFile: async (assetId) => {
      const asset = await db.assets.get(assetId)
      if (!asset) return null
      return new File([asset.blob], asset.name, { type: 'model/gltf-binary' })
    },
    // 环境贴图同理：hdr blob 还原成 File 交给 HDRCubeTexture
    resolveEnvFile: async (assetId) => {
      const asset = await db.assets.get(assetId)
      if (!asset || assetKind(asset) !== 'hdr') return null
      return new File([asset.blob], asset.name, { type: 'image/vnd.radiance' })
    },
  })
  // 交互预览开关：上次关着就关着进（只影响编辑器触发，不影响存档）
  engine.setInteractionEnabled(ui.interactionPreview)

  await refreshAssets()

  const hadSave = await loadSaved()
  if (!hadSave) editor.doc = createDefaultDocument()
  await engine.loadDocument(editor.doc)
  editor.loaded = true

  // 文档任意变化 → 800ms 后自动保存（整个场景 JSON 不大，全量存最稳）
  watch(
    () => editor.doc,
    () => markDirty(),
    { deep: true },
  )

  // 数据源定义变化（增 / 删 / 改 URL）→ 重启 dataHub；newScene / 读档换文档也会走到这儿
  watch(
    () => JSON.stringify(editor.doc.sources || []),
    () => dataHub.start(editor.doc, applyBindings),
  )

  // 数据接入启动：按 doc.sources 起轮询；先求值一次，让已有绑定立刻在场景里生效
  dataHub.start(editor.doc, applyBindings)
  applyBindings()

  // 切后台/关页面前尽量落盘（visibilitychange 下异步事务有机会跑完）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) saveNow()
  })
  window.addEventListener('beforeunload', () => {
    if (saveTimer) saveNow()
  })

  // 数据接入排障入口：控制台 __dataDebug.snapshot() 看源/绑定/数据，
  // __dataDebug.testInject(nodeId, 'color', '#f00') 绕过数据源验证引擎通路。
  // 不放 DEV 门里——排查问题时经常面对的就是构建产物，错过这门最耽误事。
  const dataDebug = {
    dataHub,
    applyBindings,
    snapshot() {
      return {
        sources: JSON.parse(JSON.stringify(editor.doc.sources || [])),
        values: dataHub.values,
        status: dataHub.status,
        online: (editor.doc.sources || []).map((s) => [s.id, dataHub.online(s.id)]),
        bindings: editor.doc.nodes.map((n) => [n.id, n.name, n.kind, n.bindings || []]),
      }
    },
    testInject(nodeId, key, value) {
      const engine = getEngine()
      if (!engine) return '引擎未就绪'
      engine.applyRuntimeValue(nodeId, key, value)
      return { nodeId, key, value }
    },
  }
  window.__dataDebug = dataDebug

  // 仅开发期暴露，方便冒烟测试/控制台操作
  if (import.meta.env.DEV) {
    window.__editorStore = {
      editor,
      assetLib,
      addFromCatalog,
      addModelInstance,
      addHtmlPanel,
      addWebPanel,
      uploadAsset,
      uploadEnvAsset,
      setEnvironmentAsset,
      updateEnvironmentProp,
      modelAssets,
      envAssets,
      getAssetRecords,
      getEngine,
      saveNow,
      PRIMITIVE_CATALOG,
      applyBindings,
      addDataSource,
      dataHub,
      dataHubPush,
      dataDebug,
      updateNodeInteraction,
      updateSceneCamera,
      captureCameraView,
      captureNodeCameraView,
      resetCameraView,
      toggleInteractionPreview,
    }
  }
}

export function findNode(id) {
  return editor.doc.nodes.find((n) => n.id === id)
}

/* ============ 添加 / 删除 ============ */

export function addFromCatalog(kind, catalogItem) {
  const engine = getEngine()
  if (!engine || !editor.loaded) return

  // 独占型节点（天气效果）：一份场景只放一份，重复点击直接选中已有的那个。
  // 这类节点自己改场景雾效 / 背景色，放两份会互相打架。
  if (catalogItem?.unique) {
    const exists = editor.doc.nodes.find(
      (n) => n.kind === kind && n.type === catalogItem.type,
    )
    if (exists) {
      selectNode(exists.id)
      return
    }
  }

  const node = createNode(kind, catalogItem)
  node.transform.position = engine.suggestPlacement(node)
  editor.doc.nodes.push(node)
  engine.addNode(node)
  selectNode(node.id)
}

/**
 * 左侧「HTML 元素导入」：把用户手写的 HTML 片段加进场景。
 * @param {string} source HTML 源码
 * @param {{width?:number, height?:number, mode?:'3d'|'billboard'}} size
 */
export function addHtmlPanel(source, size = {}) {
  const engine = getEngine()
  if (!engine || !editor.loaded) return null
  const node = createHtmlNode(source || '', size)
  node.transform.position = engine.suggestPlacement(node)
  editor.doc.nodes.push(node)
  engine.addNode(node)
  selectNode(node.id)
  return node.id
}

/**
 * 左侧「网址导入」：往场景里放一块真网页（DOM <iframe> 浮层）。
 * @param {string} url 网页地址
 * @param {{width?:number, height?:number, interactive?:boolean, mode?:'3d'|'billboard'}} size
 */
export function addWebPanel(url, size = {}) {
  const engine = getEngine()
  if (!engine || !editor.loaded) return null
  const node = createWebNode(url || '', size)
  node.transform.position = engine.suggestPlacement(node)
  editor.doc.nodes.push(node)
  engine.addNode(node)
  selectNode(node.id)
  return node.id
}

export function removeNode(id) {
  const idx = editor.doc.nodes.findIndex((n) => n.id === id)
  if (idx < 0) return
  editor.doc.nodes.splice(idx, 1)
  getEngine()?.removeNode(id)
  lastInjected.delete(id)
  // 节点没了：它引用的数据源若也没人再绑，ws / http 得收，不能还挂着重连
  gcSources()
  if (editor.selectedId === id) editor.selectedId = null
}

/* ============ 选择 / Gizmo ============ */

export function selectNode(id) {
  editor.selectedId = id
  getEngine()?.setSelected(id === GROUND_SELECTION ? null : id)
}

export function setGizmoMode(mode) {
  editor.gizmoMode = mode
  getEngine()?.setGizmoMode(mode)
}

export function frameSelected() {
  if (editor.selectedId && editor.selectedId !== GROUND_SELECTION) {
    getEngine()?.frameSelected(editor.selectedId)
  }
}

/**
 * 顶栏「首页」：取消选中，把镜头拉回整个场景。
 * 一个节点都没有时归位到地面的默认取景（见 EditorEngine.frameAll）。
 */
export function frameScene() {
  if (!editor.loaded) return
  selectNode(null)
  getEngine()?.frameAll()
}

/* ============ 属性编辑 ============ */

/** 手动显隐（SceneTree 眼睛）：写文档（可保存）+ 同步引擎。数据注入的 visible 会临时覆盖它 */
export function setNodeHidden(id, hidden) {
  const node = findNode(id)
  if (!node) return
  node.hidden = !!hidden
  getEngine()?.setNodeVisible(id, !hidden)
}

export function updateNodeProps(id, key, value) {
  const node = findNode(id)
  if (!node) return
  node.props[key] = value
  getEngine()?.updateProps(id, node.props)
}

export function updateNodeName(id, name) {
  const node = findNode(id)
  if (!node) return
  node.name = name
  getEngine()?.renameNode(id, name)
}

export function updateNodeTransform(id, part, axisIndex, value) {
  const node = findNode(id)
  if (!node || Number.isNaN(value)) return
  node.transform[part][axisIndex] = value
  getEngine()?.setNodeTransform(id, node.transform)
}

/**
 * 改节点的鼠标交互（Inspector「交互」分区）：写文档（可保存）+ 同步引擎。
 * patch 是部分更新（{ trigger } / { transparent: { enabled } } / …），
 * 嵌套对象按字段合，不整块替换——半透明白点了两下不该把颜色码丢回默认值。
 */
export function updateNodeInteraction(id, patch) {
  const node = findNode(id)
  if (!node) return
  const current = normalizeNodeInteraction(node)
  node.interaction = normalizeNodeInteraction({
    interaction: {
      trigger: patch.trigger !== undefined ? patch.trigger : current.trigger,
      transparent: { ...current.transparent, ...(patch.transparent || {}) },
      outline: { ...current.outline, ...(patch.outline || {}) },
      camera: {
        ...current.camera,
        ...(patch.camera || {}),
        // view 也按字段合：改一个角度不该把目标点 / 距离丢回默认（null → auto）
        view: patch.camera?.view
          ? { ...(current.camera.view || {}), ...patch.camera.view }
          : current.camera.view,
      },
    },
  })
  // 引擎侧立即换配置（旧效果先还原再登记）；
  // 生效时机交给事件：正在悬停 / 选中的节点要下一次触发才刷新，可预期
  getEngine()?.updateInteraction(id, node.interaction)
}

/**
 * 「用当前视角」（视角飞行 · 指定机位）：把引擎当前机位（度 → 弧度）录进该节点。
 * 切到「指定机位」还没有现成机位时，Inspector 会先调它灌一份，免得五个框全是空的。
 */
export function captureNodeCameraView(id) {
  const engine = getEngine()
  if (!engine) return
  const s = engine.getCameraState()
  updateNodeInteraction(id, {
    camera: {
      view: {
        alpha: s.alpha * DEG2RAD,
        beta: s.beta * DEG2RAD,
        radius: s.radius,
        target: s.target,
      },
    },
  })
}

/* ============ 折点（能量管道 / datav 特效共用） ============ */

const round1 = (v) => Math.round(v * 10) / 10
const AXES = ['x', 'y', 'z']

/** 保证节点有 >=2 个折点（旧文档 / 异常数据兜底） */
function pathPoints(node) {
  if (!node) return null
  if (!Array.isArray(node.props.points) || node.props.points.length < 2) {
    node.props.points = [
      [0, 2, -6],
      [0, 2, 6],
    ]
  }
  return node.props.points
}

/** 该节点可用的折点预置（管道用 PIPE_SHAPE_PRESETS，波纹墙用 WALL_SHAPE_PRESETS） */
function nodePresets(node) {
  return findCatalog(node.kind, node.type)?.pointConfig?.presets || PIPE_SHAPE_PRESETS
}

/** 折点整体替换（数组来自面板的深拷贝） */
export function updatePathPoints(id, points) {
  const node = findNode(id)
  if (!node) return
  node.props.points = points.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0])
  getEngine()?.updateProps(id, node.props)
}

/** 单个折点的单轴数值 */
export function updatePathPoint(id, index, axis, value) {
  const node = findNode(id)
  const points = pathPoints(node)
  if (!points || !(points[index] && AXES.includes(axis)) || !Number.isFinite(value)) return
  points[index][AXES.indexOf(axis)] = value
  getEngine()?.updateProps(id, node.props)
}

/** 追加折点：沿最后一段方向延伸 8 单位，保持趋势不跳变 */
export function addPathPoint(id) {
  const node = findNode(id)
  const points = pathPoints(node)
  if (!points) return
  const last = points[points.length - 1]
  const prev = points[points.length - 2] || [0, 0, 0]
  let dx = last[0] - prev[0]
  let dy = last[1] - prev[1]
  let dz = last[2] - prev[2]
  let len = Math.hypot(dx, dy, dz)
  if (len < 1e-4) {
    dx = 0
    dy = 0
    dz = 8
    len = 8
  }
  const step = 8 / len
  const p = [round1(last[0] + dx * step), round1(last[1] + dy * step), round1(last[2] + dz * step)]
  // 与上一点重合则不再追加
  if (points.some((q) => Math.abs(q[0] - p[0]) < 1e-3 && Math.abs(q[1] - p[1]) < 1e-3 && Math.abs(q[2] - p[2]) < 1e-3)) {
    return
  }
  points.push(p)
  getEngine()?.updateProps(id, node.props)
}

/** 删除折点（至少保留 2 个） */
export function removePathPoint(id, index) {
  const node = findNode(id)
  const points = pathPoints(node)
  if (!points || points.length <= 2) return
  points.splice(index, 1)
  getEngine()?.updateProps(id, node.props)
}

/** 上移 / 下移某个折点 */
export function movePathPoint(id, index, dir) {
  const node = findNode(id)
  const points = pathPoints(node)
  if (!points) return
  const to = index + dir
  if (to < 0 || to >= points.length) return
  const tmp = points[index]
  points[index] = points[to]
  points[to] = tmp
  getEngine()?.updateProps(id, node.props)
}

/** 套用预置折点配置 */
export function applyPathPreset(id, key) {
  const node = findNode(id)
  const points = pathPoints(node)
  if (!points) return
  const preset = nodePresets(node).find((p) => p.key === key)
  if (!preset) return
  node.props.points = preset.make()
  getEngine()?.updateProps(id, node.props)
}

/* ============ 数据接入（bindings） ============ */

/**
 * 联调用：绕过数据源直接往引擎灌一个值（绑定弹窗「试一下」/ __dataDebug.testInject）。
 * 场景有反应 → 引擎通路是好的，问题在数据侧；没反应 → 节点 id 或引擎分派不对。
 */
export function testInject(nodeId, key, value) {
  const engine = getEngine()
  if (!engine) return null
  engine.applyRuntimeValue(nodeId, key, value)
  return { nodeId, key, value }
}

/** nodeId → 上一次注入的 { key: value }，同值短路，别把引擎刷成每帧重绘 */
const lastInjected = new Map()

/**
 * 求值全部绑定并注入引擎。dataHub 每收到一条数据触发一次。
 *
 * 注意这条链路「三不」：不写 node.props、不碰几何字段、不触发 markDirty ——
 * 数据态是运行时叠加，刷新页面 / 导出场景都以静态 props 为准。
 */
export function applyBindings() {
  if (!editor.loaded) return
  for (const node of editor.doc.nodes) {
    if (!Array.isArray(node.bindings) || !node.bindings.length) continue
    const patch = evaluateNode(node, dataHub.values)
    if (!patch || !Object.keys(patch).length) continue
    const last = lastInjected.get(node.id) || {}
    for (const [key, value] of Object.entries(patch)) {
      if (last[key] === value) continue
      last[key] = value
      try {
        getEngine()?.applyRuntimeValue(node.id, key, value)
      } catch (err) {
        // 一条绑定出错不拖垮其余节点/字段；每个 key 只喊一次，别把控制台刷爆
        const tag = `${node.id}:${key}`
        if (!applyBindings._warned) applyBindings._warned = new Set()
        if (!applyBindings._warned.has(tag)) {
          applyBindings._warned.add(tag)
          console.warn(`[数据绑定] 注入失败 ${tag}`, err)
        }
      }
    }
    lastInjected.set(node.id, last)
  }
}

/** 新建数据源（Inspector 绑定弹窗里「＋新建数据源」）；增删由 watch 重启 dataHub */
export function addDataSource(def) {
  if (!Array.isArray(editor.doc.sources)) editor.doc.sources = []
  editor.doc.sources.push(def)
}

/** 删除数据源；引用它的绑定保留但不再有数据（求值侧自动跳过） */
export function removeDataSource(id) {
  if (!Array.isArray(editor.doc.sources)) return
  const idx = editor.doc.sources.findIndex((s) => s.id === id)
  if (idx >= 0) editor.doc.sources.splice(idx, 1)
}

/**
 * 摘掉「没有任何绑定引用」的数据源定义（只动文档，不断连接）。
 * @returns {number} 摘掉几条
 *
 * manual 源不摘：它没有连接开销，宿主页面 dataHubPush 随时可能往这个 id 里灌数据；
 * http / ws 是实打实的轮询 / 长连，没绑定还挂着就是白占（ws 断线还会一直重连）。
 */
function dropUnusedSources() {
  const sources = editor.doc.sources
  if (!Array.isArray(sources) || !sources.length) return 0

  const used = new Set()
  for (const node of editor.doc.nodes) {
    for (const b of node.bindings || []) {
      if (b?.source) used.add(b.source)
    }
  }

  const dead = sources.filter((s) => s?.type !== 'manual' && !used.has(s?.id))
  for (const s of dead) {
    const idx = sources.indexOf(s)
    if (idx >= 0) sources.splice(idx, 1)
  }
  return dead.length
}

/**
 * 回收没人用的数据源：删节点 / 解绑定之后调用。
 * 只摘文档不够——dataHub 里 ws runner 还挂着；但也不用在这儿直接 start()：
 * 摘定义会让 doc.sources 变化，initEditor 里那个 watch(JSON.stringify) 下一个 tick
 * 就 dataHub.start()（内部先 stop：关 socket、清重连 timer），连接当场断。
 */
function gcSources() {
  dropUnusedSources()
}

/**
 * 设 / 改 / 解 某个字段的绑定（Inspector 绑定弹窗保存）。
 * binding 传 null = 解绑。写完立即求值一次，不用等下一轮数据。
 */
export function setNodeBinding(id, key, binding) {
  const node = findNode(id)
  if (!node) return
  if (!Array.isArray(node.bindings)) node.bindings = []
  // 没有源的绑定是死绑定（求值侧第一行就会跳过），拒绝落盘
  if (binding && !binding.source) {
    console.warn('[数据绑定] 保存被拒绝：没有选择数据源', { id, key })
    return
  }
  const idx = node.bindings.findIndex((b) => b && b.key === key)
  if (!binding) {
    if (idx >= 0) node.bindings.splice(idx, 1)
  } else {
    const next = { ...binding, key }
    if (idx >= 0) node.bindings[idx] = next
    else node.bindings.push(next)
  }
  // 解绑可能让某个源瞬间没人引用：ws / http 一起收（manual 不收，见 dropUnusedSources）
  gcSources()
  // 立即生效 + 落盘（绑定配置是文档的一部分，要保存）
  applyBindings()
  markDirty()
}

/* ============ 场景级设置 ============ */

/** 现值（度口径）供面板回显 / 局部更新：文档存过按文档，没存过按引擎当前视角 */
function currentSceneCameraDeg() {
  const saved = normalizeSceneCamera(editor.doc.scene.camera)
  if (saved) {
    const round3 = (v) => Math.round(v * 1000) / 1000
    return {
      alpha: round3(saved.alpha * RAD2DEG),
      beta: round3(saved.beta * RAD2DEG),
      radius: saved.radius,
      target: saved.target,
    }
  }
  return getEngine()?.getCameraState() || null
}

/**
 * 改初始机位（Inspector「初始视角」分区）。patch 口径：alpha / beta 用「度」，
 * radius / target 原值；缺字段沿现值。写完立即生效（编辑器当场跳到新机位）+ 存档。
 */
export function updateSceneCamera(patch = {}) {
  const engine = getEngine()
  if (!engine) return
  const base = currentSceneCameraDeg()
  if (!base) return
  const next = {
    alpha: patch.alpha !== undefined ? Number(patch.alpha) : base.alpha,
    beta: patch.beta !== undefined ? Number(patch.beta) : base.beta,
    radius: patch.radius !== undefined ? Number(patch.radius) : base.radius,
    target: Array.isArray(patch.target) ? patch.target.map(Number) : base.target,
  }
  if ([next.alpha, next.beta, next.radius, ...next.target].some((v) => !Number.isFinite(v))) return
  const camera = normalizeSceneCamera({
    alpha: next.alpha * DEG2RAD,
    beta: next.beta * DEG2RAD,
    radius: next.radius,
    target: next.target,
  })
  if (!camera) return
  editor.doc.scene.camera = camera
  engine.setInitialCamera(camera)
}

/** 「用当前视角」：引擎现在看着的机位 → 初始机位 */
export function captureCameraView() {
  const engine = getEngine()
  if (!engine) return
  updateSceneCamera(engine.getCameraState())
}

/** 「恢复默认」：清掉初始机位，回到按地面大小自动取景 */
export function resetCameraView() {
  editor.doc.scene.camera = null
  getEngine()?.setInitialCamera(null)
}

export function setGroundType(type) {
  const catalog = findGroundCatalog(type)
  editor.doc.scene.ground = { type, props: { ...catalog.defaultProps } }
  getEngine()?.setGround(editor.doc.scene.ground)
}

export function updateGroundProp(key, value) {
  editor.doc.scene.ground.props[key] = value
  getEngine()?.setGround(editor.doc.scene.ground) // 参数化重建，代价小
}

export function updateBackground(value) {
  editor.doc.scene.background = value
  getEngine()?.setBackground(value)
}

export function newScene() {
  if (!window.confirm('新建场景将清空当前内容（已自动保存的场景会被覆盖），确定？')) return
  const fresh = createDefaultDocument()
  editor.doc = fresh
  editor.selectedId = null
  getEngine()?.loadDocument(fresh)
}

/* ============ 素材库（glb 模型 + hdr 环境） ============ */

/**
 * 素材分两类，同一张表里用 kind 区分：
 *   glb —— 模型，节点侧靠 props.assetId 引用
 *   hdr —— 环境贴图，场景侧靠 scene.environment.assetId 引用
 * 老库里没有 kind 字段，读出来统一当 glb（见 assetKind）。
 */
export function assetKind(record) {
  return record?.kind === 'hdr' ? 'hdr' : 'glb'
}

async function getAssetMeta(id) {
  return db.assets.get(id)
}

export async function refreshAssets() {
  const list = await db.assets.orderBy('ts').reverse().toArray()
  assetLib.splice(
    0,
    assetLib.length,
    ...list.map(({ blob, ...meta }) => meta), // 列表不带 blob
  )
}

/** 素材库里的 glb 模型（左侧「模型自定义」一栏） */
export function modelAssets() {
  return assetLib.filter((a) => assetKind(a) === 'glb')
}

/** 素材库里的 hdr 环境贴图（左侧「环境天空盒」一栏） */
export function envAssets() {
  return assetLib.filter((a) => assetKind(a) === 'hdr')
}

/** 上传 glb 入素材库，入库后立即在场景中添加一个实例 */
export async function uploadAsset(file) {
  if (!file) return
  if (!/\.glb$/i.test(file.name)) {
    window.alert('模型仅支持 .glb 格式（gltf 请先在 Blender 中导出为 glb）')
    return
  }
  const asset = {
    id: genId(),
    kind: 'glb',
    name: file.name,
    size: file.size,
    ts: Date.now(),
    blob: file,
  }
  await db.assets.put(asset)
  await refreshAssets()
  await addModelInstance(asset.id)
}

/** 上传 hdr 入素材库（只入库，场景用不用要用户点一下） */
export async function uploadEnvAsset(file) {
  if (!file) return
  if (!/\.hdr$/i.test(file.name)) {
    window.alert('环境贴图仅支持 .hdr 格式（RGBE / .hdr，Poly Haven 上有一堆）')
    return
  }
  const record = {
    id: genId(),
    kind: 'hdr',
    name: file.name,
    size: file.size,
    ts: Date.now(),
    blob: file,
  }
  await db.assets.put(record)
  await refreshAssets()
  return record
}

/** 从素材库添加一个模型实例到当前场景 */
export async function addModelInstance(assetId) {
  const engine = getEngine()
  if (!engine || !editor.loaded) return
  const asset = await getAssetMeta(assetId)
  if (!asset) return

  const node = createModelNode(asset)
  node.transform.position = engine.suggestPlacement(node)
  editor.doc.nodes.push(node) // 先入文档，保证撤销/保存顺序一致

  const file = new File([asset.blob], asset.name, { type: 'model/gltf-binary' })
  await engine.addModelNode(node, file, { dropToGround: true })
  selectNode(node.id)
}

/** 把某个 hdr 设成当前场景的环境（assetId 传 null = 恢复成无环境） */
export async function setEnvironmentAsset(assetId) {
  const engine = getEngine()
  if (!engine) return
  if (!assetId) {
    editor.doc.scene.environment = { ...ENV_DOC_DEFAULT, props: { ...ENV_DEFAULT_PROPS } }
    engine.setEnvironment(null)
    markDirty()
    return
  }
  const asset = await getAssetMeta(assetId)
  if (!asset) return
  editor.doc.scene.environment = {
    type: 'hdr',
    assetId: asset.id,
    assetName: asset.name,
    props: { ...ENV_DEFAULT_PROPS },
  }
  const file = new File([asset.blob], asset.name, { type: 'image/vnd.radiance' })
  engine.setEnvironment({ id: asset.id, name: asset.name, file })
  markDirty()
}

/** 改环境参数（强度 / 旋转 / 天空盒开关） */
export function updateEnvironmentProp(key, value) {
  const env = editor.doc.scene.environment
  if (!env || env.type !== 'hdr') return
  env.props = { ...ENV_DEFAULT_PROPS, ...env.props, [key]: value }
  getEngine()?.setEnvironmentProps(env.props)
  markDirty()
}

/** 删除素材（已放进场景的实例不受影响，但刷新后该节点将无法再加载） */
export async function deleteAsset(assetId) {
  const usedAsModel = editor.doc.nodes.some(
    (n) => n.kind === 'model' && n.props.assetId === assetId,
  )
  const usedAsEnv = editor.doc.scene?.environment?.assetId === assetId
  const tips = []
  if (usedAsModel) tips.push('该模型已在场景中使用，下次打开场景这些实例将无法加载')
  if (usedAsEnv) tips.push('它正是当前场景的环境贴图，删掉就回到无环境')
  const tip = tips.length
    ? `${tips.join('；')}。确定删除？`
    : '确定从素材库删除该素材？'
  if (!window.confirm(tip)) return
  if (usedAsEnv) await setEnvironmentAsset(null)
  await db.assets.delete(assetId)
  await refreshAssets()
}

/**
 * 取全部素材记录（含 blob）—— 导出场景时要把 glb 一起带走，列表界面只看元信息。
 * @returns {Promise<{id:string,name:string,size:number,ts:number,blob:Blob}[]>}
 */
export async function getAssetRecords() {
  return db.assets.orderBy('ts').toArray()
}

/* ============ 给 UI 用的小工具 ============ */

export function getSelectedNode() {
  return findNode(editor.selectedId)
}

export function getSelectedForm() {
  const node = getSelectedNode()
  if (!node) return null
  return findCatalog(node.kind, node.type)?.form || null
}

export { GROUND_CATALOG, GROUND_SELECTION }
