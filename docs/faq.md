# FAQ

## 编辑器

**Q：刷新页面场景还在吗？**
在。编辑中 800ms 防抖自动存 IndexedDB（含 glb/hdr 素材库）。换浏览器 / 清缓存会丢——
长期用请用「导出」。

**Q：为什么导出要登录？**
导出产物是可分发资产，走独立后端 `babylon-twin-server` 鉴权。编辑、摆放、保存不拦。

**Q：上传的模型支持什么格式？**
仅 `.glb`（glTF 二进制）。`.gltf` / `.obj` / `.fbx` 请先在 Blender 里转 glb。

**Q：HTML 面板里我的 `<script>` / 外链字体不生效？**
HTML 面板走 SVG foreignObject 栅格化，浏览器处于画图沙箱：行内样式/文字/表格/简单布局
可以，脚本、外链字体、canvas、视频不行。需要真网页用「网页面板」（iframe）。

**Q：往远拉镜头，地面/远处像被一道线切掉？**
两种可能：① 相机裁剪面——已放大到 radius 10000 / maxZ 30000，正常场景碰不到；
② **地板自身的边界**——底板是有限大的（默认 ±1000），放大「底板参数 → 尺寸」铺满视野。
想要边缘溶进背景可以加背景同色雾。

**Q：能量管道的速度/粒子大小能绑数据吗？**
不能。引擎只注入 look 级字段（颜色/浓度/段数/粒子开关/流向/显隐），
几何和每帧读取的字段没接线。可绑 key 全表见数据绑定手册第 5 节。

**Q：模型颜色能绑数据吗？**
`visible` 可以；`color` 对 glb 多材质尚未接线（ primitives/灯光/管道可以）。

## 交互

**Q：鼠标划过没反应？**
大概率是 Babylon 默认不在 pointermove 上拾取。运行时已开
`scene.constantlyUpdateMeshUnderPointer`；若你自建内核，记得开这个开关。

**Q：点击/划过在编辑器里好的，导出后没反应？**
八成是播放包旧了（加载文档时没给网格打 `metadata.nodeId`）。升级播放包即可
（1.0.2+ 已修）。自检：`__scenePlayer.runtime.interactions._cfg.size` 大于 0 说明配置在。

**Q：外轮廓光是把整个模型糊满了？**
旧代码用了 `HighlightLayer`（innerGlow 默认开，涂满剪影内部）。现在用
`SelectionOutlineLayer`（Sobel 边缘检测，只描外缘）。还觉得糊就把
`mainTextureRatio` 确认是 1。见 [节点交互](editor/interactions.md)。

**Q：轮廓边缘有锯齿？**
layer 的 RT 默认半分辨率且无 MSAA。三件套：`mainTextureRatio: 1`、
`mainTextureSamples: 4`、`outlineThickness: 2`。

**Q：不透明度设 0.05 和 0.95 没区别？**
glTF 的 PBR 被 loader 显式写成 `transparencyMode = OPAQUE`，那之后 `alpha` 被无视。
必须切 `MATERIAL_ALPHABLEND` 再设 alpha（运行时已处理）。

## 播放包

**Q：场景不显示 / 白屏？**
① Console 报错；② Babylon 是否 ^9（peer）；③ WebGL 是否可用（`about:gpu`）。

**Q：模型变成占位方块？**
`assets[].file` 路径解析不上：检查 `assetBaseUrl`、文件是否在、或 `resolveAsset`
返回了 null。导出时素材被删也会只留占位（导出提示里会列）。

**Q：`file://` 双击打开能看吗？**
单文件 HTML 能（全资源内联）。npm 用 `fetchScene`/URL 字符串不行（浏览器安全策略），
需要起静态服务。

**Q：数据推了没反应？**
按序查：在线点灰不灰（源离没离线）→ `field` 路径和数据包形状对不对 → `key` 是不是
可绑字段 → `map` 选对没（颜色要 threshold）。完整排查表见数据绑定手册第 9 节。

**Q：删了绑定节点，WebSocket 还在一直重连？**
旧版问题。现在删节点/解绑后**没有任何绑定引用的 http/ws 源会自动关停**并从文档摘掉；
播放包启动时也会兜底清一遍。升级即可。

**Q：一份场景能在多个页面同时用吗？**
可以，各自 `mountScene` 独立实例。注意同页面多实例 = 多份 Babylon 场景，按需 dispose。

**Q：打包体积？**
ESM 库产物不含 Babylon（peer，走消费者的那份）；standalone.iife.js 约 8MB
（Babylon 全内联，gzip 后 ~2MB），单文件导出专用。

**Q：TS 项目有类型吗？**
有，`src/index.d.ts`（SceneDocument / SceneNode / ScenePlayerOptions / NodeInteraction /
SceneCameraView 等）。Vue 子路径的类型来自 .vue 本身。

## 本地开发

**Q：两个工程改了同源文件怎么同步？**
`interactionRuntime.js` / `cameraFly.js` / `binding.js` / `dataHub.js` /
`pipeBuilder.js` / `digitalGround.js` / `htmlPanel.js` 两边各一份，头注标了同源。
改一边的行为，另一边要同步改。

**Q：改了播放包，编辑器导出还是旧的？**
编辑器导出内联的是 `public/player/standalone.iife.js`——必须
`cd babylon-scene-player && npm run build` 再 `cd 3Dbabyloncode && npm run sync:player`。

**Q：本地 tgz 升级后不生效？**
`npm install file:xxx.tgz --save --force`，或删掉 node_modules 里那个包再装。
package-lock.json 会钉住旧 integrity。

**Q：有测试吗？**
编辑器侧有一批无头回归（Node + Babylon NullEngine）：

```bash
npm run smoke:schema    # 协议归一化
npm run smoke:runtime   # 交互运行时 44 条断言
npm run smoke:binding   # JSON 数据绑定求值
npm run smoke:export    # 导出不剥字段
npm run smoke:hit       # 播放器命中链路（打标 → 拾取 → 半透明）
npm run smoke:data      # data 选项（轮询/报错/停止）
```

UI 层没有自动化测试，靠 demo 页（播放包 `npm run demo`，页面左下角有验收清单）。
