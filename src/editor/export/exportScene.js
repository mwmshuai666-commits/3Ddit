/**
 * 导出编排：工具栏「导出」菜单的三个入口。
 *
 *   导出场景 JSON   scene.json —— 模型外链，放进项目里维护 / 二次开发
 *   导出单文件 HTML scene.html —— 模型与 Babylon 全部内嵌，双击 / iframe 即用
 *   导出完整包 ZIP  scene.zip  —— 上面两种的「目录版」+ 接入 README
 *
 * 三个入口都只读状态、不写场景，导出失败不影响编辑器。
 */

import { editor, getAssetRecords } from '../store/editor'
import {
  buildExportDoc,
  download,
  fetchGroundTextureDataUrls,
  loadPlayerBundle,
  playerBundleHasGroundTextures,
  stamp,
} from './sceneExport.js'
import { buildStandaloneHtml } from './standaloneHtml.js'
import { buildSceneBundleZip } from './bundleZip.js'

const MB = 1024 * 1024

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}

function report(warnings) {
  return warnings.length ? warnings.join('；') : ''
}

/** 收集当前文档 + 素材（含 blob） */
async function collect(mode) {
  const assets = await getAssetRecords()
  return buildExportDoc(editor.doc, { mode, assets })
}

/* ---------------- 三种导出 ---------------- */

/** 场景 JSON：模型用相对路径（models/xxx.glb），配 assets 目录一起搬 */
export async function exportSceneJson() {
  const { doc, assets, missing, warnings } = await collect('files')
  const json = JSON.stringify(doc, null, 2)
  download(new Blob([json], { type: 'application/json' }), stamp('json'))
  return {
    message: `scene.json 已导出（${humanSize(json.length)}）`
      + (assets.length ? `，含 ${assets.length} 个资源引用` : ''),
    warning: report(warnings.concat(missing.length ? ['模型文件需随 models/ 目录一起拷贝（完整包 ZIP 已带好）'] : [])),
  }
}

/** 单文件 HTML：场景 + 模型 + 播放器全部内嵌，离线可用 */
export async function exportSceneHtml() {
  const playerBundle = await loadPlayerBundle()
  const { doc, assets, missing, warnings } = await collect('embedded')
  // 库 1.1 起播放器包里就有四张数字地板贴图了，只有旧构建才需要自己再嵌一遍
  const groundTextures = (await playerBundleHasGroundTextures(playerBundle))
    ? []
    : await fetchGroundTextureDataUrls()
  const html = buildStandaloneHtml({ doc, playerBundle, groundTextures })
  download(new Blob([html], { type: 'text/html' }), stamp('html'))

  const embedded = assets.reduce((n, a) => n + (a.data?.length || 0), 0)
  return {
    message: `scene.html 已导出（${humanSize(html.length)}，模型已内嵌）`,
    warning: report(
      warnings.concat(
        embedded > 60 * MB ? ['内嵌模型较大，部分浏览器打开大文件会偏慢'] : [],
      ),
    ),
  }
}

/** 完整包 ZIP：scene.json + models/ + assets/utils/ + README */
export async function exportSceneZip() {
  const { doc, pack, missing, warnings } = await collect('files')
  const blob = await buildSceneBundleZip({ doc, assets: pack, missing })
  download(blob, stamp('zip'))
  return {
    message: `scene.zip 已导出（${humanSize(blob.size)}，含 ${pack.length} 个资源文件）`,
    warning: report(warnings),
  }
}

export const EXPORTERS = {
  json: exportSceneJson,
  html: exportSceneHtml,
  zip: exportSceneZip,
}
