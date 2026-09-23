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
  createDefaultDocument,
  createNode,
  createModelNode,
  findCatalog,
  findGroundCatalog,
  genId,
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
      uploadAsset,
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
  const node = createNode(kind, catalogItem)
  node.transform.position = engine.suggestPlacement(node)
  editor.doc.nodes.push(node)
  engine.addNode(node)
  selectNode(node.id)
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

/* ============ 素材库（glb） ============ */

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

/** 上传 glb 入素材库，入库后立即在场景中添加一个实例 */
export async function uploadAsset(file) {
  if (!file) return
  if (!/\.glb$/i.test(file.name)) {
    window.alert('目前仅支持 .glb 格式（gltf 请先在 Blender 中导出为 glb）')
    return
  }
  const asset = {
    id: genId(),
    name: file.name,
    size: file.size,
    ts: Date.now(),
    blob: file,
  }
  await db.assets.put(asset)
  await refreshAssets()
  await addModelInstance(asset.id)
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

/** 删除素材（已放进场景的实例不受影响，但刷新后该节点将无法再加载） */
export async function deleteAsset(assetId) {
  const used = editor.doc.nodes.some(
    (n) => n.kind === 'model' && n.props.assetId === assetId,
  )
  const tip = used
    ? '该模型已在场景中使用：删除素材后，下次打开场景这些实例将无法加载。确定删除？'
    : '确定从素材库删除该模型？'
  if (!window.confirm(tip)) return
  await db.assets.delete(assetId)
  await refreshAssets()
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
