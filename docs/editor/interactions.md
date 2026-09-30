# 节点交互（点击 / 悬停 → 半透明 · 外轮廓光 · 视角飞行）

给场景里的元素配鼠标行为。**编辑器里即时预览，导出后播放器同样生效**
（两边运行同一份 `interactionRuntime.js`）。

## 一、配一个交互

选中节点 → 属性面板「**交互**」分区：

| 配置 | 取值 | 行为 |
| --- | --- | --- |
| **触发方式** | 不交互 / 鼠标点击 / 鼠标划过 | 什么操作触发的开关 |
| **半透明** | 开关 + 不透明度(0.05~1) + 透明颜色 | 触发时材质变半透明并着色 |
| **外轮廓光** | 开关 + 颜色 | 触发时沿轮廓外缘亮一圈光 |
| **视角飞行** | 开关 + 飞行时长(ms) + 方式 | 触发时相机飞过去 |
| **视角飞行 · 方式** | 自动框住物体 / 指定机位 | 自动 = 按包围盒；指定机位 = 一套 alpha/俯仰角/距离/目标点 |
| **编辑器预览** | 开关 | 关掉只影响编辑器触发（专心摆场景时用），存档导出不受影响 |

「指定机位」的目标点五个框 +「用当前视角」一键把当前机位录进这个节点。

## 二、行为语义

| 触发 | 效果生效 | 效果还原 |
| --- | --- | --- |
| **鼠标划过** | 指针进入元素 | 指针移出（或按住鼠标开始转视角时立即还原） |
| **鼠标点击** | 点一下 | 点到别的节点 / 空白处；同节点再点保持并重新取景一次 |

三种效果可任意组合（例：点击 = 变透明 + 亮轮廓 + 飞过去）。
半透明和轮廓光都是「**触发时叠加、失焦时恢复**」，不动文档里的静态参数。

## 三、支持范围

| 元素类型 | 半透明 | 轮廓光 | 视角飞行 |
| --- | --- | --- | --- |
| glb 模型 | ✅ | ✅ | ✅ |
| 基础几何体 | ✅ | ✅ | ✅ |
| HTML / 网页面板 | ✅ | ✅ | ✅ |
| 能量管道 / 特效 | ✗（材质归各自模块管） | ✗ | ✗ |
| 灯光 | ✗（没有网格） | ✗ | ✗ |

## 四、实现要点（二次开发参考）

```
指针事件 → 拾取 → 沿 mesh.metadata.nodeId 找到节点 → 查 node.interaction → 应用/还原
```

### 1. 悬停的地基：`scene.constantlyUpdateMeshUnderPointer`

Babylon 默认**不在 pointermove 上拾取**（没注册 ActionManager 时 `pickResult` 直接是
null），悬停逻辑会整个空转。运行时启动时必须打开这个开关——这是「划过没反应」
类问题的第一排查点。

### 2. 命中的前提：`mesh.metadata.nodeId`

拾取后要沿 parent 链找节点归属。**加载文档时必须给每个网格打这个标**
（编辑器 `addModelNode` / 播放器 `_addNode` 都有）——漏了打标，导出的场景里交互
全部选不中。

### 3. 半透明：glTF 的 PBR 有个坑

glTFLoader 会按 `alphaMode`（默认 OPAQUE）把 `transparencyMode` 显式写成
`MATERIAL_OPAQUE`——**这之后 `needAlphaBlending()` 只认模式、完全不看 `alpha`**，
设 0.05 和设 0.95 渲染结果一模一样。所以应用半透明时必须：

```js
material.transparencyMode = Material.MATERIAL_ALPHABLEND  // 切混合模式
material.alpha = opacity                                   // 再设透明度
material.needDepthPrePass = true                           // 半透明多网格防“看穿”
```

还原时三项一起快照还原（含原模式）。

### 4. 轮廓光：用 SelectionOutlineLayer，不要用 HighlightLayer

- `HighlightLayer` 的 `innerGlow` 默认 true，会把高亮色**涂满整个模型剪影内部**
  （观感就是“整改填满”），且多网格模型会把内部缝线也描出来
- `SelectionOutlineLayer` 的着色器是**边缘梯度检测（Sobel）**，只在轮廓外沿着色；
  一组网格作为整体描边，接缝不出内线

光滑度三件套（默认值全是“性能档”，出来就是锯齿边）：

```js
new SelectionOutlineLayer(name, scene, {
  mainTextureRatio: 1,     // mask 全分辨率（默认 0.5 → Sobel 跑在半配画质上 → 台阶边）
  mainTextureSamples: 4,   // layer 自己的 RT 开 4x MSAA（主画布有抗锯齿，layer RT 默认没有）
  outlineThickness: 2,
})
```

### 5. 视角飞行：动画 target/alpha/beta/radius，不要动 position

ArcRotateCamera 每帧用 `alpha/beta/radius/target` 重算 position，直接动画
`position` 会被当场覆盖。`alpha` 走最短旋转路径（±π 内），不会掉头转一整圈。
用户一输入（pointerdown / wheel）立即停飞，不跟用户抢镜头。

```js
Animation.CreateAndStartAnimation(name, camera, 'target', 60, frames, from, to,
  ANIMATIONLOOPMODE_CONSTANT, cubicEaseEaseInOut)
```

## 五、场景文档里的样子

```jsonc
{
  "id": "n_x1", "kind": "model", "type": "glb",
  "interaction": {
    "trigger": "hover",                                  // none | click | hover
    "transparent": { "enabled": true, "opacity": 0.6, "color": "#00ffee" },
    "outline":     { "enabled": false, "color": "#ffd640" },
    "camera":      { "enabled": true, "duration": 1200, "mode": "auto",
                     "view": null }                       // custom 时给 {alpha,beta,radius,target}
  }
}
```

字段缺省 / 损坏一律按「不交互」兜底，老文档零感知。完整字段表见
[场景文档协议](../protocol.md)。
