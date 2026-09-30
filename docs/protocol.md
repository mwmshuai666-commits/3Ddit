---
title: 场景文档协议
description: scene.json 完整字段参考
---

# 场景文档协议（scene.json）

编辑器与播放包之间的**唯一契约**。纯 JSON，可手改、可 diff、可程序生成——
播放器不需要编辑器参与。

## 顶层结构

```jsonc
{
  "version": "0.1.0",
  "scene": {
    "background": "#05070d",
    "ground":    { "type": "grid", "props": { "size": 2000, "tile": 10, "color": "#0a1730", "lineColor": "#1e6bff" } },
    "environment": { "type": "hdr", "assetId": "env_1", "assetName": "studio.hdr",
                     "props": { "intensity": 1, "rotation": 0, "blur": 0, "skybox": true } },
    "camera": { "alpha": -1.4289, "beta": 1.28, "radius": 124, "target": [0, 5, 0] }   // 初始机位（弧度），可省
  },
  "sources": [ { "id": "src_m", "type": "manual" } ],      // 数据源，可省
  "nodes": [ /* 见下 */ ],
  "assets": [ { "id": "a_1", "name": "a.glb", "file": "models/a.glb" } ],  // 或 "data": "<base64>"
  "cameras": []                                            // 预留：机位书签 / 巡航
}
```

## 节点（nodes[]）

```jsonc
{
  "id": "n_x1",                       // 唯一 id（帧内引用都靠它）
  "name": "机床",                      // 场景树显示名
  "kind": "primitive | light | pipe | effect | model | html | web",
  "type": "box | hemispheric | energy | flexiblePipe | glb | html | ...",
  "parentId": null,                   // 预留：层级父子
  "transform": {
    "position": [0, 0, 0],
    "rotation": [0, 0, 0],            // 角度制，不是弧度
    "scaling": [1, 1, 1]
  },
  "props": {},                        // 类型参数（各类型属性表见编辑器 schema）
  "hidden": false,                    // 手动显隐基线
  "bindings": [ /* 数据绑定，见 binding-manual.md */ ],
  "interaction": { /* 鼠标交互，见 interactions.md */ }
}
```

### 各 kind 的要点

| kind | type 取值 | props 要点 |
| --- | --- | --- |
| `primitive` | box / sphere / cylinder / cone / plane / torus | 尺寸 + color |
| `light` | hemispheric / directional / point / spot | intensity / color / groundColor / range / angle / exponent |
| `pipe` | energy | color / radius / speed / repeat / casingOpacity / particles / dir / **points**（折点 [[x,y,z]…]） |
| `effect` | flexiblePipe / streamLine / arrowFlyLine / waveWall / weatherEffect | 各自表单字段；折点在 `points`（波纹墙是 [x,z]） |
| `model` | glb | **assetId** + assetName（指向 assets[]） |
| `html` | html | html（片段）/ width / height / mode:'3d'\|'billboard' |
| `web` | web | url / width / height / interactive / mode |

## scene.camera（初始机位）

| 字段 | 说明 |
| --- | --- |
| `alpha` | 水平角，弧度 |
| `beta` | 俯仰角，弧度 |
| `radius` | 相机到目标点的距离 |
| `target` | 视线瞄准点 `[x, y, z]` |

- 缺省 / null = 按地面大小自动取景
- `mountScene(el, doc, { camera })` 显式传的 options.camera 优先级更高（需给全套）
- 面板里按「度」编辑，存的是弧度

## node.interaction（鼠标交互）

```jsonc
"interaction": {
  "trigger": "none",                   // none | click | hover
  "transparent": { "enabled": false, "opacity": 0.35, "color": "#00e5ff" },
  "outline":     { "enabled": false, "color": "#ffd640" },
  "camera":      { "enabled": false, "duration": 1200, "mode": "auto", "view": null }
}
```

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `trigger` | none / click / hover | 触发方式；非法值按 none 兜底 |
| `transparent.enabled` | bool | 触发时半透明 |
| `transparent.opacity` | 0.05 ~ 1 | 不透明度；越接近 1 越实 |
| `transparent.color` | `#rrggbb` | 透明时的着色 |
| `outline.enabled` | bool | 触发时外轮廓光（只描外缘，不填色） |
| `outline.color` | `#rrggbb` | 轮廓光颜色 |
| `camera.enabled` | bool | 触发时相机飞行 |
| `camera.duration` | 200 ~ 5000 ms | 飞行时长 |
| `camera.mode` | auto / custom | auto=按包围盒框住；custom=按 view |
| `camera.view` | `{alpha,beta,radius,target}` | custom 模式的机位（弧度）；坏值退回 auto |

只对 `primitive` / `model` / `html` / `web` 生效。

## sources[] 与 bindings[]

见 [数据绑定手册](binding-manual.md) 第 6 节（完整字段表）。

## assets[]（资源引用）

```jsonc
{ "id": "a_1", "name": "a.glb", "file": "models/a.glb" }        // 外链模式
{ "id": "a_1", "name": "a.glb", "data": "<base64>" }             // 内嵌模式（单文件导出）
{ "id": "env_1", "name": "studio.hdr", "kind": "hdr", "file": "assets/env/studio.hdr" }
```

- `file` 相对路径解析基准：npm 用法 `options.assetBaseUrl`，默认相对当前页面
- `data` 是 base64（不带 `data:` 前缀），单文件导出用
- 节点侧：模型 `props.assetId` 指 `assets[].id`；环境贴图 `scene.environment.assetId` 同理
- **三套 id 命名空间互不相干**：`assets[].id`（文件）、`sources[].id`（数据）、
  `nodes[].id`（元素）——节点用 `props.assetId` 认领文件，用 `bindings[].source` 认领数据

## 版本兼容

- 所有新增字段都是可选的：老文档没有 `interaction` / `camera` / `sources` / `bindings`
  时，播放器按默认行为运行（不交互、自动取景、无数据）
- 字段损坏（类型不对、越界）按默认值兜底，不抛异常
- `version` 字段预留，当前 `0.1.0`
