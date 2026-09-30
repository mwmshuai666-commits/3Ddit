---
title: 播放包总览
description: babylon-scene-player 四种接入形态与安装方式
---

# 3D 场景播放包 · 总览

`babylon-scene-player` 把一份 `scene.json` 跑成 3D 场景。**零框架依赖**
（Babylon 走 peerDependencies，Vue 是 optional peer），可以以四种形态进任何项目。

## 接入选型（先看这张表）

| 你的场景 | 用哪种 | 代码量 |
| --- | --- | --- |
| Vue 3 项目，数据是响应式状态 | **Vue 组件** `babylon-scene-player/vue` | 3 行 |
| Vue 3 项目，要完全自己控制 | npm 库 + `data` 选项 | 5 行 |
| React / 原生 / 后端模板 | npm 库 `mountScene` | 5 行 |
| 不接 npm，就要个能跑的页面 | **单文件 HTML**（编辑器导出） | 0 行 |
| 场景文档要运行时动态拉 | npm 库 + URL 字符串 / `fetchScene` | 5 行 |

## 四种形态

### 1. Vue 组件（最省事）

```vue
<script setup>
import { ScenePlayer } from 'babylon-scene-player/vue'
import doc from './scene.json'             // 也可以传 '/scene.json' 字符串
const live = ref({ run: 1, temp: 92 })     // 业务数据，改了自动推
</script>

<template><ScenePlayer :doc="doc" :data="live" /></template>
```

- `data` 键对上文档 `sources[].id` 就各推各的；只有一个源时整个对象直接推给它
- 生命周期全包：卸载自动 `dispose`
- 需要 `vue@^3`（optional peer，非 Vue 项目不会被强制装）

### 2. npm 库 + `data` 选项

```js
import { mountScene } from 'babylon-scene-player'

const player = mountScene(el, doc, {
  assetBaseUrl: '/',                       // 模型相对路径前缀
  data: {
    src_1: () => fetch('/api/realtime', { headers: auth }).then(r => r.json()),  // Promise → 轮询
    src_2: { intervalMs: 5000, load: async () => (await fetch('/api/slow')).json() },
    src_3: { run: 1 },                     // 对象 → 立即推一次
  },
})
```

### 3. npm 库 · 经典用法

```js
import { mountScene, fetchScene, pushData } from 'babylon-scene-player'

const { doc, assetBaseUrl } = await fetchScene('./scene.json')   // 完整包 ZIP 解压后的目录
const player = mountScene(el, doc, { assetBaseUrl })
pushData('src_m', { temp: 92 })          // manual 源注入
player.dispose()                          // 卸载
```

### 4. 单文件 HTML

编辑器「导出 → 单文件 HTML」的产物：播放器 + Babylon + 模型 + 环境全部 base64 内联，
双击就能看，`<iframe>` 嵌任何栈都不挑环境：

```html
<script>
  var player = window.BabylonScenePlayer.mount(document.getElementById('app'), sceneJson)
  window.twinData.push('src_m', { run: 0 })   // 数据注入
</script>
```

## 播放器跑起来后有什么

| 能力 | 说明 | 详见 |
| --- | --- | --- |
| 场景渲染 | 底板 / 几何体 / 灯光 / 管道 / 特效 / glb / HTML 面板 / 天空盒 | [协议](../protocol.md) |
| 节点交互 | 悬停/点击 → 半透明 / 外轮廓光 / 视角飞行 | [节点交互](../editor/interactions.md) |
| 初始机位 | `scene.camera` 或 `options.camera` | [协议](../protocol.md) |
| 数据接入 | http/ws/manual 三源 + 绑定求值注入 | [数据绑定手册](../binding-manual.md) |
| 运行时句柄 | `player.runtime / scene / engine / canvas / ready / pushData / dispose` | [API](api.md) |

## 安装

```bash
npm i babylon-scene-player
npm i @babylonjs/core @babylonjs/loaders     # peer 依赖，必须
```

Vue 组件子路径额外需要 `vue@^3`。本地打包分发：

```bash
cd ../babylon-scene-player && npm run build && npm pack
# 目标项目：npm install <路径>/babylon-scene-player-x.y.z.tgz
```

> 本地 file: 依赖重装必须显式：`npm install file:xxx.tgz --save --force`
> （同名覆盖后 npm 会说 up to date 但不更新）。

## 下一步

- 四种形态的完整参数 → [接入详解](integration.md)
- API / options / 返回值逐项 → [API 参考](api.md)
- 数据注入的完整玩法 → [数据绑定手册](../binding-manual.md)
