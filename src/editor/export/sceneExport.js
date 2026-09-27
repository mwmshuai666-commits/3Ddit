/**
 * 场景导出的公共层：把编辑器里的场景文档 + 素材库里的 glb 整理成「能搬走」的形态。
 *
 * 编辑器内部只有一份纯 JSON（editor.doc），模型以 blob 存在素材库、场景节点只存
 * assetId 引用。要搬到别的项目，就得把这份引用补全：
 *
 *   mode: 'files'    → assets: [{ id, name, file: 'models/xx.glb' }]，模型单独放文件
 *   mode: 'embedded' → assets: [{ id, name, data: '<base64>' }]，模型内嵌进 JSON
 *
 * 两种形态播放器都能吃（见 babylon-scene-player 的 README「场景文档协议」）。
 */

import { GROUND_TEXTURE_FILES } from '../core/digitalGround.js'
import { normalizeEnvironment } from '../schema/sceneSchema'

/** 播放器全局包：由 scripts/sync-player.mjs 从 ../babylon-scene-player/dist 拷来 */
export const PLAYER_BUNDLE_URL = `${import.meta.env.BASE_URL}player/standalone.iife.js`

/** 数字科技地板的四张贴图（编辑器放在 public/utils 下，导出时要一起带走） */
export const GROUND_TEXTURE_URLS = GROUND_TEXTURE_FILES.map(
  (f) => `${import.meta.env.BASE_URL}utils/${f}`,
)

/**
 * 文件名净化：去掉路径分隔符和控制字符，重名时加序号。
 * glb 是从用户硬盘选进来的，名字里出现 /、\、.. 都不奇怪。
 */
export function safeFileName(name, used = new Set()) {
  const base = String(name || 'model.glb')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '_')
    .trim() || 'model.glb'
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  let i = 2
  let candidate = `${stem}-${i}${ext}`
  while (used.has(candidate)) {
    i += 1
    candidate = `${stem}-${i}${ext}`
  }
  used.add(candidate)
  return candidate
}

/**
 * 生成导出用文档
 * @param {object} doc 编辑器当前文档
 * @param {{mode:'files'|'embedded', assets?:{id:string,name:string,blob:Blob}[]}} opts
 *        assets 是素材库全量记录（glb + hdr 都在里面）
 * @returns {Promise<{doc:object, assets:object[], pack:object[], missing:string[], warnings:string[]}>}
 */
export async function buildExportDoc(doc, { mode = 'files', assets = [] } = {}) {
  const byId = new Map(assets.map((a) => [a.id, a]))
  const used = new Set()
  const out = []
  const assetIndex = []
  const missing = []
  const warnings = []

  const exported = JSON.parse(JSON.stringify(doc))
  exported.exportedAt = new Date().toISOString()
  exported.generator = '数字孪生场景编辑器'

  for (const node of exported.nodes || []) {
    if (node.kind !== 'model') continue
    const record = byId.get(node.props?.assetId)
    if (!record) {
      missing.push(node.props?.assetName || node.name || node.id)
      continue
    }
    const entry = {
      id: record.id,
      name: record.name,
      size: record.blob?.size ?? record.size ?? 0,
    }
    if (mode === 'embedded') {
      entry.data = await blobToBase64(record.blob, record.name)
    } else {
      entry.file = `models/${safeFileName(record.name, used)}`
    }
    out.push(entry)
    assetIndex.push(assets.indexOf(record))
  }

  // 环境贴图（hdr）：和模型同一套规则带走 —— 内嵌进 JSON 或单独放 assets/env/
  const env = normalizeEnvironment(exported)
  if (env && env.type === 'hdr' && env.assetId) {
    const record = byId.get(env.assetId)
    if (record?.blob) {
      const entry = {
        id: record.id,
        name: record.name,
        size: record.blob.size,
        kind: 'hdr',
      }
      if (mode === 'embedded') {
        entry.data = await blobToBase64(record.blob, record.name)
      } else {
        entry.file = `assets/env/${safeFileName(record.name, used)}`
      }
      out.push(entry)
      assetIndex.push(assets.indexOf(record))
    } else {
      warnings.push('环境贴图素材已从素材库删除，导出的场景将回到无环境')
      delete exported.scene.environment
    }
  }

  if (missing.length) {
    warnings.push(
      `${missing.length} 个模型实例的素材已从素材库删除，导出文档里只有占位：${missing.join('、')}`,
    )
  }
  exported.assets = out
  // pack 给 zip 用：带上 blob，但不进 scene.json（Blob 序列化只会变成 {}）
  const pack = out.map((entry, i) => ({ ...entry, blob: assets[assetIndex[i]].blob }))
  return { doc: exported, assets: out, pack, missing, warnings }
}

/** Blob → base64（不带 data: 前缀） */
export function blobToBase64(blob, name = 'model.glb') {
  return new Promise((resolve, reject) => {
    if (!blob) {
      reject(new Error(`${name} 没有可导出的数据`))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error || new Error(`${name} 读取失败`))
    reader.readAsDataURL(blob)
  })
}

/** fetch 一个小文件并转成完整 dataURL（带 `data:image/png;base64,` 前缀） */
export async function fetchAsDataUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const blob = await res.blob()
  const base64 = await blobToBase64(blob, url)
  return `data:${blob.type || 'image/png'};base64,${base64}`
}

export async function fetchAsBytes(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** 单文件导出用：数字地板四张贴图转成 dataURL，让 HTML 不依赖任何外部文件 */
export async function fetchGroundTextureDataUrls() {
  const urls = await Promise.all(
    GROUND_TEXTURE_URLS.map((url) => fetchAsDataUrl(url).catch(() => null)),
  )
  if (urls.some((u) => !u)) {
    throw new Error('数字地板贴图没找到（public/utils/digitalGround1~4.png）')
  }
  return urls
}

/**
 * 播放器包里是否已经带上了数字地板四张贴图。
 *
 * 库 1.1 起把四张图 base64 内置进了产物（src/groundTextures.js），内联播放器时它们
 * 已经在里面了，单文件 HTML 再嵌一遍纯属浪费 470KB。判断办法很土但很直接：
 * 拿第一张贴图的 base64 开头一小段，看它在不在产物里。
 * 只有用着旧构建（sync-player 拷的是老 dist）时才需要自己补。
 */
export async function playerBundleHasGroundTextures(bundleText) {
  try {
    const res = await fetch(GROUND_TEXTURE_URLS[0])
    if (!res.ok) return false
    const head = (await blobToBase64(await res.blob(), 'digitalGround1.png')).slice(0, 64)
    return Boolean(head) && bundleText.includes(head)
  } catch {
    return false
  }
}

/** 触发浏览器下载 */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** 播放器包是否就绪（scripts/sync-player.mjs 没跑过时这里会给提示） */
export async function loadPlayerBundle() {
  const res = await fetch(PLAYER_BUNDLE_URL)
  if (!res.ok) {
    throw new Error(
      '播放器包缺失：请先在 ../babylon-scene-player 里 npm install && npm run build，' +
        '再在编辑器里运行 npm run sync:player（dev/build 前会自动执行）',
    )
  }
  return res.text()
}

/** 时间戳文件名：scene-2026-09-24-1805.json */
export function stamp(ext, prefix = 'scene') {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}.${ext}`
}
