# 数字孪生场景编辑器

Vue 3 + Babylon.js 的数字孪生场景**编辑器**：拖参数拼场景，存进浏览器 IndexedDB，然后一键导出成
「别的项目能直接用」的产物。

- 编辑：场景树 / 属性面板 / Gizmo 变换 / 底板切换 / 快捷键
- 存储：场景文档自动存 IndexedDB（Dexie），模型以 blob 存在素材库里
- 导出：工具栏「导出」→ 单文件 HTML / 完整包 ZIP / 场景 JSON
- 播放：独立 npm 库 [`babylon-scene-player`](../babylon-scene-player)，负责把导出的场景跑起来

## 跑起来

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run dev` / `npm run build` 前会自动执行 `scripts/sync-player.mjs`（predev / prebuild），
把播放器库的产物拷到 `public/player/`。没拷也不影响编辑，只是「导出单文件 HTML」会提示缺文件。

## 能摆进去的东西

| 分类 | 内容 |
| --- | --- |
| 底板 | 科技网格 / 纯色平面 / 机房防静电地板 / 数字科技地板（圆形扩散波纹） |
| 几何体 | 立方体、球体、圆柱体、圆锥体、平面、圆环 |
| 管道 | 能量管道、柔性管道、流光线管道（折线模板：直线、上扬、S 弯、阶梯、环形、螺旋、矩形、L 形、六边形） |
| 特效 | 贝塞尔飞线、围墙波纹、雨 / 雪 / 雾 / 雷电 |
| 灯光 | 半球环境光、平行光、点光源、聚光灯 |
| 模型 | glb（从硬盘选进来，存素材库） |

快捷键：`W` 移动 · `E` 旋转 · `R` 缩放 · `F` 聚焦 · `Delete` 删除

## 导出

右上角「导出」按钮，三个入口的区别就是**资源怎么带走**：

| 产物 | 内容 | 用在哪 |
| --- | --- | --- |
| **单文件 HTML** | 播放器 + Babylon + glb 模型 + 数字地板贴图全部 base64 内联，一个 `.html` | 双击就能看；`<iframe>` 嵌进任何技术栈（React / Vue / 原生 / 后端模板）都不挑环境，不需要 npm、不需要服务器、不联网 |
| **完整包 ZIP** | `scene.json` + `models/*.glb` + `assets/utils/*.png` + 接入 README | 要在项目里长期维护这份场景：多个场景共用一批 `models/`，能手改 JSON 再加载 |
| **场景 JSON** | 只要文档（`assets[].file` 相对路径） | 接自己的构建流程 / 自己拷模型文件 |

模型在编辑器里是 IndexedDB 里的 blob，场景节点只存 `assetId` 引用；导出时会把引用补全
（内嵌 base64 或单独文件）。如果素材已被删掉，导出文档里对应实例只剩占位，并在提示里列出。

### 单文件 HTML 的内部结构

产物就是个普通网页，`window.__scenePlayer` 暴露给控制台：

```html
<!-- 内嵌了三样东西 -->
<script>/* babylon-scene-player 的 standalone 构建，Babylon 已打进去 */</script>
<script>
  window.__SCENE_DOC__     = { /* 场景 JSON，模型是 base64 */ }
  window.__SCENE_OPTIONS__ = { groundTextures: [/* 四张贴图的 dataURL */], onError(){} }
  window.BabylonScenePlayer.mount(document.getElementById('app'), window.__SCENE_DOC__, window.__SCENE_OPTIONS__)
</script>
```

## 在别的项目里用（npm 库）

播放内核在**独立的另一个工程**里，不是编辑器的一部分：

```
../babylon-scene-player     # npm 库 babylon-scene-player
```

```bash
npm i ../babylon-scene-player @babylonjs/core @babylonjs/loaders
```

```html
<div id="app" style="width:100vw;height:100vh"></div>
<script type="module">
  import { mountScene, fetchScene } from 'babylon-scene-player'

  // 完整包 ZIP 解压后就是这个目录结构
  const { doc, assetBaseUrl } = await fetchScene('./scene.json')

  const player = mountScene(document.querySelector('#app'), doc, {
    assetBaseUrl,
    textureBaseUrl: './assets/utils/', // 数字地板四张贴图
  })
  // player.scene / player.engine / player.camera / player.runtime 都拿得到，接拾取和 UI 都行
</script>
```

组件里记得在卸载时 `player.dispose()`。TS 项目自带类型。
库的完整 API、选项表和文档协议见 [`../babylon-scene-player/README.md`](../babylon-scene-player)。

也可以给库自带一份播放器包，自己起服务：`npm run demo`（`http://localhost:5199/demo.html`）。

## 两个工程的关系

```
babylon-scene-player（播放内核，npm 库）
   ├── src/pipeBuilder.js / digitalGround.js / textures.js   编辑器同名文件的播放侧副本
   ├── src/effects.js                                        四个特效的命令式实现（编辑器里锁在 .vue 里）
   └── dist/standalone.iife.js ──sync-player.mjs──▶ 3Dbabyloncode/public/player/
                                                            └─ 导出单文件 HTML 时原样内联
```

改播放效果的流程：**先改 `../babylon-scene-player`，`npm run build`，再在编辑器里
`npm run sync:player`**。编辑器故意不依赖这个库来编辑场景（编辑器要 Gizmo、要 Vue），
两边目前各存一份渲染实现；真要让编辑器直接依赖播放库，得先做一次引擎层重构，现阶段没做。

## 场景文档协议

导出产物与播放器之间的唯一契约，就是 `src/editor/schema/sceneSchema.js` 定义的纯 JSON：

```jsonc
{
  "version": "0.1.0",
  "scene": { "background": "#05070d", "ground": { "type": "digital", "props": {} } },
  "nodes": [
    {
      "id": "n_x1", "name": "能量管道",
      "kind": "primitive | light | pipe | effect | model",
      "type": "box | hemispheric | energy | arrowFlyLine | glb | ...",
      "transform": { "position": [0,0,0], "rotation": [0,0,0], "scaling": [1,1,1] }, // 角度制
      "props": {}                // 类型相关参数，折点在 props.points（波纹墙是 [x,z]）
    }
  ],
  "assets": [ { "id": "a_1", "name": "a.glb", "file": "models/a.glb" } ]  // 或 "data": "<base64>"
}
```

文档是纯 JSON，可以自己生成 / 改它，播放器不需要编辑器参与。

## 目录

```
src/editor/store/editor.js       编辑器状态 + Dexie 持久化
src/editor/core/EditorEngine.js  Babylon 引擎、Gizmo、渲染组约定
src/editor/schema/sceneSchema.js 场景文档协议 + 各类型的属性表（Inspector 按它自动生成表单）
src/editor/components/           工具栏 / 场景树 / 属性面板 / 视口 / 导出菜单
src/editor/export/               导出链路（见下）
scripts/sync-player.mjs          把播放器产物拷进 public/player/
```

```
src/editor/export/sceneExport.js      公共层：补全模型引用、base64、文件名净化、下载
src/editor/export/standaloneHtml.js   单文件 HTML 组装
src/editor/export/bundleZip.js        完整包 ZIP（含生成的 README）
src/editor/export/miniZip.js          手写 zip（store 模式，UTF-8 文件名）
src/editor/export/exportScene.js      三个导出入口
```
