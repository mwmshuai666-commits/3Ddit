# 节点交互配置：点击 / 悬停 → 半透明 · 外轮廓光 · 相机飞行

## 目标（来自需求）

给场景里的元素（重点是添加进来的模型）配置一套交互，在编辑器里即时预览：

| 触发方式 | 效果（可组合，各自可设颜色） |
| --- | --- |
| 鼠标点击 / 鼠标划过 / 不交互 | ① 纹理变半透明（不透明度 + 透明颜色）② 出现外轮廓的光（颜色）③ 视角飞行——相机用 babylon-datav 同款缓动飞到元素上 |

## 设计总览

交互配置是**节点级数据**（像 `hidden` / `bindings` 一样挂在 node 上，不塞进 `props`——
`props` 是类型自带参数，交互是所有类型通用的横切能力）。编辑器引擎负责跑运行时，
文档自动保存，导出时随文档走（播放器是否执行见「范围边界」）。

```jsonc
// scene.nodes[i].interaction
{
  "trigger": "none",        // 'none' | 'click' | 'hover'
  "transparent": { "enabled": false, "opacity": 0.35, "color": "#00e5ff" },
  "outline":     { "enabled": false, "color": "#ffd640" },
  "camera":      { "enabled": false, "duration": 1200 }
}
```

语义：
- `hover`：划过生效、移出还原（作用于材质/描边的状态当场恢复，不是永久改文档）。
- `click`：三种效果都是「切换」式——点击生效，再点还原；相机飞行是每次点击都飞一次
  （一次性的，不存在还原）。
- 三种效果可任意组合（例：点击 = 变透明 + 亮轮廓 + 飞过去）。

## 改动清单

### 1. `src/editor/schema/sceneSchema.js` —— 协议
- 新增 `INTERACTION_DEFAULT` + `normalizeNodeInteraction(node)`：老文档 / 外部 JSON 没有
  该字段时兜底成「不交互」，与现有 `hidden` / `bindings` 的 normalize 同一套路。
- 接进 `withDataFields`（新建节点带上默认值）和 `normalizeNodeData`（读档补齐），
  `createModelNode` / `createNode` / `createHtmlNode` / `createWebNode` 自动覆盖。
- 头注的协议说明里补一段 interaction。

### 2. `src/editor/core/cameraFly.js`（新）—— 相机飞行
对齐 `babylon-datav/src/core/SceneManager.js` 的 `flyCameraTo`（CubicEase、
EASEINOUT、默认 1200ms / 60fps），但有一处**刻意不同**：ArcRotateCamera 每帧会用
alpha/beta/radius/target 重算 position，直接动画 `position` 会被覆盖（包里的实现有
这个缺陷，结尾还要 setPosition + rebuildAnglesAndRadius 补救）。这里改为动画相机真正
消费的两个量：`target`（Vector3 属性，setter 走 setTarget）+ `radius`（普通字段）。
- `flyCameraTo(camera, { target, radius, duration })`，起手动画 + 结束即终值（无需回写）。
- 用户一输入（pointerdown / wheel）立即停动画 `camera.animations = []`，不跟用户抢镜头。

### 3. `src/editor/core/interactionRuntime.js`（新）—— 交互运行时
由 EditorEngine 持有，只依赖 Babylon 对象，不碰 Vue。
- **事件**：`scene.onPointerObservable` —— POINTERMOVE 驱动 hover，POINTERTAP 驱动
  click；拾取沿用引擎现有逻辑（沿 parent 链找 `metadata.nodeId`）。
- **参与类型**：`primitive` / `model` / `html` / `web`（有网格的）。`pipe` / `effect`
  材质归 pipeBuilder / datav 组件管（有自己的 look 状态机），`light` 没有网格，都不接。
- **半透明**：对 entry 涉及到的每个材质做快照 `{ alpha, color }`，写入目标值；
  还原时按快照恢复。颜色兼容两种材质：`PBRMaterial.albedoColor`（glb 常见）与
  `StandardMaterial.diffuseColor`（几何体），运行时判型。
- **外轮廓光**：按需懒创建一个场景级 `HighlightLayer`（Engine 默认带 stencil，
  HighlightLayer 的前提满足）；`addMesh(mesh, color)` / `removeMesh`；引擎 dispose 时
  连同 layer 一起释放。与选中描边（edgesRendering）互不干扰。
- **状态与还原**：每个节点记 `active` 集合 + 材质快照；还原时机：移出悬停、配置变更、
  节点删除、loadDocument 重载、预览开关关闭。
- **预览开关**：`setEnabled(flag)`；关掉时引擎完全不跑拾取外的交互分支。

### 4. `src/editor/core/EditorEngine.js` —— 接线
- 构造时 `this.interactions = new InteractionRuntime(this)`；`dispose()` 里释放。
- `_instantiate` / `addModelNode` / `_addEmptyModel` 里读 `node.interaction` 落到
  `entry.interaction`（模型异步加载后天然就绪，事件时读 entry 即可）。
- 新公开方法 `updateInteraction(nodeId, interaction)`：先还原旧状态再应用新配置。
- `loadDocument` 开头 `resetInteractions()`；`_disposeEntry` 里清该节点残留。

### 5. `src/editor/store/editor.js` —— action
- `updateNodeInteraction(id, patch)`：normalize 后写 `node.interaction` + 调引擎
  `updateInteraction`（走文档 = 可保存/可导出，与 updateNodeProps 同一模式）。
- `ui.interactionPreview`（localStorage 持久化，和左/右栏开合同款）→ 引擎开关。
- 交互字段不接 dataHub 绑定（触发是用户输入，无数据语义；bindings 白名单本来也不含它）。

### 6. `src/editor/components/Inspector.vue` —— 「交互」分区
选中任意节点时出现（复用现有 `insp-section` / `form-row` 样式，不加新 CSS 体系）：
- 触发方式：无 / 点击 / 划过
- ☑ 半透明 → 不透明度（0.05–1）+ 透明颜色
- ☑ 外轮廓光 → 轮廓颜色
- ☑ 视角飞行 → 飞行时长（ms）
- ☑ 编辑器预览（关掉后编辑时不再触发，导出不受影响）
- `pipe` / `effect` / `light` 节点显示一行说明「该类型暂不支持交互」。

### 7. `README.md`
补一小节「节点交互」，说明协议字段与三条链路（配置在文档 / 编辑器即时预览 / 导出随行）。

## 范围边界（本次不做，先说清）

- **播放器侧不在这轮**：`babylon-scene-player` 是隔壁工程，导出文档会带上
  `interaction` 字段，但现版本播放器会忽略它；要「导出后也生效」需在那份副本里放同款
  `interactionRuntime.js` + `cameraFly.js` 再 build + `npm run sync:player`（可作为
  第二步单独做，量不大，但涉及跨工程重建）。**需要的话确认一声，我再排进去。**
- 不做批量多选配置、不做交互的数据绑定。
- 不做 hover 光标样式（pointer cursor）这种锦上添花。

## 验证

1. `npm run build`（语法/导入冒烟；项目无单测框架，其余靠手动清单）。
2. `npm run dev` 手动验收：
   - 加几何体 / 上传 glb → 「交互」分区出现，改各开关颜色即时生效；
   - hover + 半透明：划过即按颜色变半透明、移出立刻还原；模型（PBR 材质）同样生效；
   - click + 外轮廓光：点击亮起、再点熄灭；选中描边与轮廓同屏不糊；
   - click + 视角飞行：相机平滑飞向元素并框住；飞行途中拖动 / 滚轮立即接管不打架；
   - 关闭某个效果开关 / 删节点 / 切预览开关，无残留透明或残留高亮；
   - 保存后刷新页面（IndexedDB 读档），交互配置仍在；老场景无该字段时按「不交互」兜底；
   - 导出「场景 JSON」里能看到每个节点的 `interaction` 字段。
3. 控制台无报错（尤其 HighlightLayer 的 stencil 前提与 PBR/Standard 双材质路径）。

## （追加需求）初始视角：进场时机位可配置

需求："有一个地方设置一开始进去的时候的视角角度"。

- 协议：`scene.camera = { alpha, beta, radius, target:[x,y,z] }`（弧度，与 Babylon 口径
  一致；Inspector 里按「度」编辑，边界处换算——和 rotation 的度制约定保持一贯）。
  缺省 = 现在这套按地面大小自动取景的逻辑，老文档零改动。
- 引擎：`loadDocument` 有 `scene.camera` 就用它（`_homeView` 也以它为准），没有就退回
  默认取景；新方法 `setInitialCamera(cam|null)`（立即生效，null=恢复默认）与
  `getCameraState()`（当前 alpha°/beta°/radius/target 三位小数，供面板回显）。
- Inspector「初始视角」分区（未选中节点时的场景设置区）：水平角 / 俯仰角 / 距离 /
  目标点 XYZ 五个数值框 + 「用当前视角」「恢复默认」两个按钮。
- store：`updateSceneCamera(patch)` / `captureCameraView()` / `resetCameraView()`。
- 导出单文件 HTML：把 `doc.scene.camera` 透传进 `__SCENE_OPTIONS__.camera` —— 播放器
  SceneRuntime 本来就收 `options.camera`（mountScene 原样透传），导出即生效，
  不需要动隔壁播放器工程（`camera` 缺省时选项省略，播放器走自己的默认）。

## （追加需求 2）视角飞行可指定机位

在「视角飞行」效果上加一档控制：除了**自动框住物体**（现状），可切到**指定机位**——
存一套 `{ alpha, beta, radius, target }`（弧度，口径同 scene.camera），面板里按度编辑，
「用当前视角」一键把当前机位录进该节点。飞行时若是指定机位，alpha / beta / radius /
target 全部参与动画（alpha 走最短旋转路径，不会绕远转一整圈）；缺省仍是自动框住。

## 风险与注意



- 材质快照按引用存：同一材质被多节点共享时理论上会互相覆盖——本工程里 glb 每次加载
  独立实例、几何体一节点一材质，实际不共享；实现里仍做「只存第一次快照」的防御。
- 半透明 + HighlightLayer 同时开会先看到轮廓光再看到玻璃体，属预期观感。
- `hover` 拾取每个 pointermove 一次 pick，开销与现状的点选同量级，可接受。
