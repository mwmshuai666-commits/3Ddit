---
title: 快速开始
description: 5 分钟跑通「编辑 → 导出 → 播放」
---

# 快速开始

## 1. 启动编辑器

```bash
cd 3Dbabyloncode
npm install
npm run dev          # http://localhost:5173
```

打开后是一个默认场景：科技网格地面 + 一盏半球环境光。不需要登录就能编辑/保存。

## 2. 30 秒搭一个小场景

1. 左侧「搭建 → 基础几何体」点**立方体** —— 场景里出现一个蓝色方块（已被选中，黄色描边）
2. 左侧「模型自定义」上传一个 `.glb` —— 点一下就进场景
3. 鼠标操作：**左键拖动旋转 · 右键拖动平移 · 滚轮缩放 · 点击物体选择**
4. 快捷键：`W` 移动 · `E` 旋转 · `R` 缩放 · `F` 聚焦 · `Delete` 删除

右侧「属性」面板改参数（颜色、尺寸、位置…），所有改动 **800ms 后自动存进浏览器
IndexedDB**——刷新不丢。

## 3. 配一个交互（可选）

选中立方体 →「交互」分区：

- 触发方式选 **鼠标划过** → 勾 **半透明** → 设不透明度和颜色
- 鼠标划过场景里的方块：变半透明，移开恢复

## 4. 导出

右上角「导出」，三种产物：

| 产物 | 内容 | 用在哪 |
| --- | --- | --- |
| **单文件 HTML** | 播放器 + Babylon + 模型 + 环境全部 base64 内联 | 双击就能看；iframe 嵌任何项目 |
| **完整包 ZIP** | `scene.json` + `models/` + `assets/` + 接入 README | 在自己项目里长期维护这份场景 |
| **场景 JSON** | 只要文档 | 接自己的构建流程 |

> 导出需要登录（后端 `babylon-twin-server`），编辑/摆放/保存不拦。
> 没起后端时可以用「完整包 ZIP / 场景 JSON」之外的方式验证——或者直接看第 5 步用编辑器
> `public/` 里的现成文件。

## 5. 播放

**方式 A：npm 包（推荐）**

```bash
npm i ../babylon-scene-player @babylonjs/core @babylonjs/loaders
```

```html
<div id="app" style="width:100vw;height:100vh"></div>
<script type="module">
  import { mountScene, fetchScene } from 'babylon-scene-player'
  const { doc, assetBaseUrl } = await fetchScene('./scene.json')  // ZIP 解压后的目录
  const player = mountScene(document.querySelector('#app'), doc, { assetBaseUrl })
</script>
```

**方式 B：Vue 项目（一个组件）**

```vue
<script setup>
import { ScenePlayer } from 'babylon-scene-player/vue'
const live = ref({ run: 1, temp: 92 })   // 业务数据，改了自动推
</script>
<template><ScenePlayer :doc="'/scene.json'" :data="live" /></template>
```

**方式 C：单文件 HTML** —— 双击打开的瞬间就在跑了；要推数据用
`window.twinData.push('源id', 数据)`。

## 6. 让场景随数据变（manual 源最小闭环）

scene.json 里加：

```jsonc
"sources": [{ "id": "src_m", "type": "manual" }],
// 节点里加：
"bindings": [{ "key": "visible", "source": "src_m", "field": "run", "map": "direct" }]
```

然后推数据：npm 用法 `pushData('src_m', { run: 0 })`；单文件 HTML
`window.twinData.push('src_m', { run: 0 })` —— 元素立刻隐藏。

完整教学（三种源 / 三种映射 / 全部可绑 key / 排查手册）见
[数据绑定手册](binding-manual.md)。

## 7. 跑播放包自带的 demo

```bash
cd babylon-scene-player
npm run demo        # http://localhost:5199
```

demo 文档内置了悬停半透明、点击轮廓光 + 相机飞行、数据注入变色三个验收点，
打开页面左下角有检查清单。
