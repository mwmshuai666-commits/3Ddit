# 数字孪生场景编辑器

Vue 3 + Babylon.js 的数字孪生场景**编辑器**：拖参数拼场景，存进浏览器 IndexedDB，然后一键导出成
「别的项目能直接用」的产物。

> 📚 **完整文档在 [`docs/`](docs/README.md)**（架构 / 快速开始 / 编辑器功能 / 节点交互 /
> 数据绑定手册 / 播放包接入 / 协议参考 / FAQ）——本文档是编辑器自身的说明。

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

左侧「搭建」是七个可折叠栏目（收/展状态记在 localStorage 里）：

| 栏目 | 内容 |
| --- | --- |
| 场景底板 | 科技网格 / 纯色平面 / 机房防静电地板 / 数字科技地板（圆形扩散波纹） |
| 基础几何体 | 立方体、球体、圆柱体、圆锥体、平面、圆环 |
| 灯光 | 半球环境光、平行光、点光源、聚光灯 |
| 特效组件 | 能量管道、柔性管道、流光线、贝塞尔飞线、围墙波纹、雨 / 雪 / 雾 / 雷电 |
| 模型自定义 | glb 上传 + 复用（点一下就放进场景） |
| HTML 元素导入 | 手写一段 HTML，变成场景里的一块面板（可选「始终朝你」） |
| 环境天空盒 | 上传 `.hdr`，天空盒 + 全局环境光照；强度 / 旋转 / 天空盒模糊 / 天空盒开关 |

HTML 栏靠 SVG foreignObject 栅格化（写之前会自动把 `<br>`、`&nbsp;` 这类 HTML 特有的写法
转成 XML 能吃的等价物），所以行内样式、文字、表格、简单 flex 布局都照原样，
但 `<script>`、外链图片字体、canvas / 视频不生效（渲染失败会自动退化成纯文本，内容不丢）。
导入后随时能在右侧属性面板里改 HTML / 宽高 / 朝向。

快捷键：`W` 移动 · `E` 旋转 · `R` 缩放 · `F` 聚焦 · `Delete` 删除

## 节点交互（点击 / 划过 → 半透明 · 外轮廓光 · 视角飞行）

选中任意节点 → 属性面板「交互」分区，给这个元素配一套鼠标行为：

| 配置 | 说明 |
| --- | --- |
| 触发方式 | 不交互 / 鼠标点击 / 鼠标划过 |
| 半透明 | 触发时把材质改成半透明：不透明度 + 透明颜色（glb 的 PBR 与几何体的 Standard 材质都吃） |
| 外轮廓光 | 触发时沿网格亮一圈描边光（HighlightLayer），颜色可设 |
| 视角飞行 | 触发时相机用 babylon-datav 同款 CubicEase 缓动飞过去：默认按包围盒**自动框住**，也可切**指定机位**——存一套 水平角/俯仰角/距离/目标点（面板按度编辑，「用当前视角」一键录入；alpha 走最短旋转方向） |

- 划过 = 进生效、出还原；点击后保持生效，点到别的节点 / 空白处（或删节点 / 改配置）才还原，
  点同一个节点会重新取景一次；视角飞行跟随每次生效的点击。
- 编辑器里即时预览；分区底部的「编辑器预览」关掉后只影响编辑器触发，存档和导出照旧。
- 现支持几何体 / 模型 / HTML / 网页面板；管道、特效、灯光的材质不由引擎直管，暂不接入。
- 配置存在节点的 `interaction` 字段里，随场景文档保存，导出单文件 HTML / ZIP / JSON 一起带走。

## 初始视角

未选中任何节点（或选中底板）时，属性面板「初始视角」分区设置进入场景时的机位：
水平角 / 俯仰角 / 距离 / 目标点五个数值框；「用当前视角」把当前机位存下来，
「恢复默认」回到按地面大小自动取景。机位存在 `scene.camera`（弧度），读档和
导出都认——单文件 HTML 会把它透传成播放器的 `options.camera`，进场就是设定的角度；
不设这个字段则沿用「按地面大小自动取景」的老行为。

## 导出

右上角「导出」按钮，三个入口的区别就是**资源怎么带走**：

| 产物 | 内容 | 用在哪 |
| --- | --- | --- |
| **单文件 HTML** | 播放器 + Babylon + glb 模型 + hdr 环境全部 base64 内联，一个 `.html` | 双击就能看；`<iframe>` 嵌进任何技术栈（React / Vue / 原生 / 后端模板）都不挑环境，不需要 npm、不需要服务器、不联网 |
| **完整包 ZIP** | `scene.json` + `models/*.glb` + `assets/env/*.hdr` + `assets/utils/*.png` + 接入 README | 要在项目里长期维护这份场景：多个场景共用一批 `models/`，能手改 JSON 再加载 |
| **场景 JSON** | 只要文档（`assets[].file` 相对路径） | 接自己的构建流程 / 自己拷模型文件 |

模型在编辑器里是 IndexedDB 里的 blob，场景节点只存 `assetId` 引用；导出时会把引用补全
（内嵌 base64 或单独文件）。环境贴图同理，按 `scene.environment.assetId` 走同一套规则。
如果素材已被删掉，导出文档里对应实例只剩占位，并在提示里列出。

## 数据接入（颜色 / 显隐 / 流向随数据实时变）

选中节点 → 属性面板里可绑的字段（颜色 / 数值 / 开关 / 下拉）行尾有一个小按钮，点它打开绑定弹窗：

- **数据源**：`＋` 新建，类型三选一 —— `http` 轮询（填 URL + 间隔）、`ws` WebSocket 长连（断线自动重连）、`manual`（宿主页面 JS 注入，`dataHub.push('源id', 数据)`）
- **取值路径**：数据包里的字段（支持 `data.value` 这种嵌套）
- **映射**：`透传` / `区间线性` / `阈值阶梯`（阈值表 + 「低于首档」的值，弹窗里实时预览当前数据会注入什么）
- 显隐和流向是运行时字段：显隐在「数据接入」区绑定（输出 0/1）；流向在能量管道的「流向」下拉（手动正向/反向，也可绑 `direction`）

场景树里：绑了数据的节点名前有**在线点**（绿=在跑 / 灰=离线）；每行悬停出现**眼睛**可手动隐藏（手动是基线，数据注入会临时覆盖）。

绑定只改显示效果，**不动几何**；数据不进 props、不触发自动保存。`sources` / `bindings` 写进场景文档，
导出后播放器（v1.1+）同样生效——单文件 HTML 里用 `window.twinData.push('源id', 数据)` 注入，
模块用法见 [babylon-scene-player README](../babylon-scene-player/README.md#数据接入sources--bindings)。

删除节点 / 解除绑定后，**没有任何节点再引用的 http / ws 源会自动关停**（socket 关闭、不再重连），
并从文档里摘掉，不会一直空连；`manual` 源不摘（没有连接开销，宿主注入随时可能往这个 id 推数据）。
读档时也会先清一遍遗留死源。

> 📖 **完整教学见 [`docs/binding-manual.md`](docs/binding-manual.md)**：三种数据源参数、三种映射怎么选、可绑字段清单、
> JSON 协议逐字段参考、导出去别处用的推送代码、排查 checklist。

### 导出需要登录

**只有导出要登录**，编辑、摆放、保存、换底板一律不拦。

后端是独立的 Go 工程 [`../babylon-twin-server`](../babylon-twin-server)（Gin + GORM + SQLite）。
没登录就点导出，会弹登录框；**登录成功后自动接着跑刚才点的那一项**，不用再点一次。

前端通过 Vite 代理访问后端，`VITE_API_BASE` 决定接口基地址：

```bash
cp .env.example .env.local     # 默认 /api/v1，开发走代理，一般不用改
```

令牌是后端签发的随机串，存在 localStorage，通过 `Authorization: Bearer <token>` 带上。
会话有效期 7 天，登出即失效；中途 token 过期时再导出一次会自动弹回登录框。

启动后端的最小步骤（细节见后端 README）：

```bash
cd ../babylon-twin-server
BT_AUTH_ADMIN_PASSWORD='设一个够长的口令' go run ./cmd/server    # 首次会自动建 admin 账号
```

数字科技地板那四张贴图不用管：播放库里内置了一份，导出的产物直接就是编辑器里看到的效果；
`assets/utils/` 里那四张是备选，想换皮就自己改图，加载时传 `textureBaseUrl` 即可。

### 单文件 HTML 的内部结构

产物就是个普通网页，`window.__scenePlayer` 暴露给控制台：

```html
<!-- 内嵌了三样东西 -->
<script>/* babylon-scene-player 的 standalone 构建，Babylon 已打进去 */</script>
<script>
  window.__SCENE_DOC__     = { /* 场景 JSON，模型与环境贴图都是 base64 */ }
  window.__SCENE_OPTIONS__ = { onError(){} }  // groundTextures 只有用着旧播放器构建时才需要
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
   ├── src/pipeBuilder.js / digitalGround.js / htmlPanel.js / textures.js   编辑器同名文件的播放侧副本
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
  "scene": {
    "background": "#05070d",
    "ground": { "type": "digital", "props": {} },
    "environment": { "type": "hdr", "assetId": "env_1", "assetName": "studio.hdr",
                     "props": { "intensity": 1, "rotation": 0, "blur": 0, "skybox": true } }
  },
  "nodes": [
    {
      "id": "n_x1", "name": "能量管道",
      "kind": "primitive | light | pipe | effect | model | html",
      "type": "box | hemispheric | energy | arrowFlyLine | glb | html | ...",
      "transform": { "position": [0,0,0], "rotation": [0,0,0], "scaling": [1,1,1] }, // 角度制
      "props": {}                // 类型相关参数，折点在 props.points（波纹墙是 [x,z]）
      // interaction: 鼠标交互（可选，缺省 = 不交互）——
      //   { trigger: 'click'|'hover', transparent: { enabled, opacity, color },
      //     outline: { enabled, color },
      //     camera: { enabled, duration, mode: 'auto'|'custom', view } }
    }
  ],
  // html 节点：props = { html, width, height, mode: '3d' | 'billboard' }
  "assets": [ { "id": "a_1", "name": "a.glb", "file": "models/a.glb" } ]  // 或 "data": "<base64>"
}
```

文档是纯 JSON，可以自己生成 / 改它，播放器不需要编辑器参与。

## 目录

```
src/editor/store/editor.js       编辑器状态 + Dexie 持久化（含素材库：glb / hdr）
src/editor/core/EditorEngine.js  Babylon 引擎、Gizmo、渲染组约定
src/editor/core/htmlPanel.js     HTML 面板渲染（SVG foreignObject → DynamicTexture）
src/editor/core/interactionRuntime.js 鼠标交互运行时：点击 / 划过 → 半透明 / 外轮廓光 / 视角飞行
src/editor/core/cameraFly.js     相机缓动飞行（对齐 babylon-datav SceneManager.flyCameraTo 的缓动）
src/editor/schema/sceneSchema.js 场景文档协议 + 各类型的属性表（Inspector 按它自动生成表单）
src/editor/components/           工具栏 / 场景树 / 属性面板 / 视口 / 导出菜单
src/editor/components/icons.js   内联 SVG 图标表（24×24、1.6px 描边、跟字色走）
src/editor/styles/swatches.css   地面材质预览漆（色值故意不走 token，见文件内说明）
src/api/ + src/store/auth.js     登录态（浏览器 → Vite 代理 → 后端）
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
