/**
 * 编辑器全局状态（Vue reactive）+ 动作
 *
 * 约定：所有对场景的修改都走这里的 action —— 同时修改 doc（可序列化的单一事实来源）
 * 和 engine（Babylon 表达）。doc 是纯 JSON，可直接写入 IndexedDB / 导出。
 */
import { reactive, watch } from 'vue'
import Dexie from 'dexie'
import { getEngine, createEngine } from '../core/engineHolder'
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
})

let saveTimer = null
let lastSavedAt = null

function markDirty() {
  if (!editor.loaded) return
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
  } finally {
    editor.saving = false
  }
}

async function loadSaved() {
  const record = await db.scenes.get(SAVE_KEY)
  if (record?.doc) {
    editor.doc = record.doc
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

  // 切后台/关页面前尽量落盘（visibilitychange 下异步事务有机会跑完）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) saveNow()
  })
  window.addEventListener('beforeunload', () => {
    if (saveTimer) saveNow()
  })

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

/* ============ 属性编辑 ============ */

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

/* ============ 场景级设置 ============ */

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
