---
title: 播放包 API 参考
description: mountScene / fetchScene / pushData / SceneRuntime 等 API 文档
---

# 播放包 API 参考

## 导出一览

```js
import {
  mountScene, fetchScene, pushData, createScenePlayer,
  SceneRuntime, dataHub, dataHubPush,
  EFFECT_TYPES, EFFECT_META, createEffect, mapEffectPoints,
  GROUND_TEXTURE_FILES, DEFAULT_TEXTURE_BASE,
} from 'babylon-scene-player'
// Vue 子路径：import { ScenePlayer } from 'babylon-scene-player/vue'
```

默认导出就是 `mountScene`。

## mountScene(container, doc, options) → ScenePlayerHandle

最省事的接入：给一个容器，播放器自己建 canvas、载入场景。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `container` | HTMLElement | 挂载点（会撑满它） |
| `doc` | object \| string | 场景 JSON；**字符串 = URL，播放器自己 fetch**（不用再搭 fetchScene） |
| `options` | object | 见下 |

**options**：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `assetBaseUrl` | `''` | 文档里 `assets[].file` 相对路径的前缀 |
| `textureBaseUrl` | 内置 base64 | 数字科技地板四张贴图的目录 |
| `groundTextures` | — | 直接给四个贴图 URL，覆盖内置 |
| `resolveAsset` | — | 自己决定素材来源：`(assetId, node) => Promise&lt;File\|Blob\|string&gt;\|File\|Blob\|string`（模型传 node，环境贴图传 `{id,name,kind:'hdr'}`） |
| `camera` | — | 初始机位（弧度，需给全套）；优先级高于文档 `scene.camera` |
| `data` | — | 数据接入省事形态：按源 id 给 对象 / 函数 / `{intervalMs, load}`，详见 [数据绑定手册](../binding-manual.md) §7.4 |
| `dataPollMs` | 2000 | 轮询默认间隔 |
| `onReady` | `(doc) => {}` | 场景建完回调 |
| `onError` | `(err) => {}` | 单个资源加载失败等非致命错误 |

**返回句柄**：

| 字段 | 说明 |
| --- | --- |
| `runtime` | SceneRuntime 实例（内核） |
| `scene` / `engine` | Babylon 对象 |
| `canvas` | 播放器自建的 canvas |
| `ready` | Promise&lt;SceneDocument&gt;——场景（含异步模型）全部就绪 |
| `pushData(id, payload)` | manual 源数据注入 |
| `dispose()` | 停渲染、停轮询、释放场景 |

## fetchScene(url, options) → Promise&lt;{doc, assetBaseUrl}&gt;

远端/本地 scene.json → 文档对象，并推算出 `assetBaseUrl`（默认取 JSON 自己的位置）。
完整包 ZIP 解压后 `scene.json` 和 `models/` 放一起就能直接跑。

## pushData(sourceId, payload)

往 manual 源灌一条数据，绑定立即求值刷场景。文档没就绪时调用也行（值会缓存）。
`player.pushData` 与模块级 `pushData` 等价。

## createScenePlayer(canvas, doc, options) → SceneRuntime

自己管 canvas 时用这个：拿内核 + `scene` / `engine`，方便接拾取、接 UI、接数据。

## SceneRuntime（内核）

| 成员 | 说明 |
| --- | --- |
| `loadDocument(doc)` | 载入/重载场景（可重复调用，先清空再重建） |
| `entries` | Map&lt;nodeId, entry&gt;——节点 → 运行时对象 |
| `camera` | ArcRotateCamera |
| `interactions` | InteractionRuntime（`_cfg` 是登记过的交互配置） |
| ` frameTargetOf(nodeId)` | 算「框住这个节点」的取景点 |
| `applyRuntimeValue(nodeId, key, value)` | 手动注入一个值（等价数据绑定末端） |
| `setNodeVisible(nodeId, visible)` | 显隐 |
| `dispose()` | 释放全部 |

## dataHub（底层，一般不用直接碰）

`values`（各源最新 payload）、`status`（各源在线状态）、`start(doc, onTick)`、
`stop()`、`push(id, payload)`、`online(id)`。

## Vue 组件（babylon-scene-player/vue）

```vue
<ScenePlayer :doc="docOrUrl" :data="liveData" :options="{ assetBaseUrl: '/' }" />
```

| prop | 类型 | 说明 |
| --- | --- | --- |
| `doc` | Object \| String | 场景 JSON 或 URL（字符串时组件自己 fetch） |
| `data` | Object | 业务数据：键对上源 id 各推各的；单源时可整个对象直接推 |
| `options` | Object | 透传给 mountScene |

事件：`ready(player)` / `error(err)`。具名和默认 import 都支持。

## 常见排错

| 现象 | 先看 |
| --- | --- |
| 场景不显示 | Console 报错；Babylon 版本是否 ^9（peer） |
| 模型是占位 | `assets[].file` 路径 + `assetBaseUrl`；或 `resolveAsset` 返回 null |
| 交互没反应 | `__scenePlayer.runtime.interactions._cfg.size` 是否为 0（文档里没配） |
| 数据没反应 | `runtime._doc.nodes.filter(n => n.bindings?.length)` 看绑定在不在 |
| 数字地板花屏 | `textureBaseUrl` 是否指到四张 png |
