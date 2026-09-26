/**
 * 完整包（zip）导出
 *
 * 产物一个 .zip，解出来是这样：
 *
 *   scene.json                 场景文档（models/ 为相对路径，见 README）
 *   models/*.glb               场景用到的模型
 *   assets/utils/*.png         数字科技地板四张贴图
 *   README.md                  接入说明（三步跑起来）
 *
 * 适合要「在项目里维护这份场景」的情况：多个场景可以共用同一批 models/，
 * 也能手工改 scene.json 后重新加载。
 */

import { createZipBlob } from './miniZip.js'
import { fetchAsBytes } from './sceneExport.js'
import { GROUND_TEXTURE_URLS } from './sceneExport.js'

function bundleReadme({ doc, assets, missing }) {
  const lines = [
    '# 数字孪生场景包',
    '',
    `由「数字孪生场景编辑器」导出：${doc.exportedAt || ''}`,
    '',
    '## 内容',
    '',
    '| 文件 | 说明 |',
    '| --- | --- |',
    '| `scene.json` | 场景文档（纯 JSON，可手工编辑） |',
    `| \`models/\` | ${assets.length} 个 glb 模型 |`,
    '| `assets/utils/` | 数字科技地板四张贴图 |',
    '',
    '## 跑起来（需要 Babylon 播放器）',
    '',
    '播放器是独立 npm 库 `babylon-scene-player`：',
    '',
    '```bash',
    'npm i babylon-scene-player @babylonjs/core @babylonjs/loaders',
    '```',
    '',
    '```html',
    '<div id="app" style="width:100vw;height:100vh"></div>',
    '<script type="module">',
    "  import { mountScene, fetchScene } from 'babylon-scene-player'",
    '',
    '  // scene.json 与 models/ 放在一起，路径按 JSON 的位置自动解析',
    "  const { doc, assetBaseUrl } = await fetchScene('./scene.json')",
    "  mountScene(document.querySelector('#app'), doc, {",
    "    assetBaseUrl,",
    "    textureBaseUrl: './assets/utils/', // 数字地板贴图",
    '  })',
    '</script>',
    '',
    '因为要 fetch 本地 JSON，得起一个静态服务器（不能直接双击 html）：',
    '',
    '```bash',
    'npx serve .        # 或者 python -m http.server',
    '```',
    '',
    '## 没有 Babylon 环境？',
    '',
    '编辑器里还可以「导出单文件 HTML」：产物自带播放器和全部资源，',
    '双击或 `<iframe>` 就能用，不需要 npm、不需要服务器。',
    '',
    '## 场景文档',
    '',
    '节点结构（`scene.json` 的 `nodes[]`）：',
    '',
    '```jsonc',
    '{',
    '  "id": "n_xx",',
    '  "name": "能量管道",',
    '  "kind": "primitive | light | pipe | effect | model",',
    '  "type": "box | hemispheric | energy | flexiblePipe | glb | ...",',
    '  "transform": {',
    '    "position": [0, 0, 0],',
    '    "rotation": [0, 0, 0],   // 角度制，不是弧度',
    '    "scaling": [1, 1, 1]',
    '  },',
    '  "props": {}                // 类型相关参数（折点在 props.points）',
    '}',
    '```',
    '',
    '模型节点靠 `props.assetId` 关联 `assets[]` 里的条目，播放器按 `file` 字段',
    '拼出 `models/xxx.glb` 加载。删掉某个节点 / 改 transform 都可以直接改 JSON。',
    '',
  ]
  if (missing.length) {
    lines.push(
      '',
      '> ⚠ 导出时有 ' + missing.length + ' 个模型实例的素材已从素材库删除，',
      '> 这些实例在播放器里只有占位（不会阻塞其它内容）：' + missing.join('、'),
    )
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * @param {{doc:object, assets:{id:string,name:string,blob:Blob,file?:string}[], missing?:string[]}} input
 * @returns {Promise<Blob>} zip
 */
export async function buildSceneBundleZip({ doc, assets, missing = [] }) {
  const files = [{ name: 'scene.json', data: JSON.stringify(doc, null, 2) }]

  for (const asset of assets) {
    if (!asset?.blob) continue
    files.push({
      name: asset.file || `models/${asset.name}`,
      data: new Uint8Array(await asset.blob.arrayBuffer()),
    })
  }

  // 数字地板贴图：与编辑器 public/utils 保持一致
  const textures = await Promise.all(
    GROUND_TEXTURE_URLS.map((url, i) =>
      fetchAsBytes(url).then((data) => ({ name: `assets/utils/digitalGround${i + 1}.png`, data })),
    ),
  )
  files.push(...textures)

  files.push({ name: 'README.md', data: bundleReadme({ doc, assets, missing }) })
  return createZipBlob(files)
}
