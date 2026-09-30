---
title: 接入详解
description: npm 包集成：装包、文档来源、数据接入、Vue / React / 原生接入
---

# 集成详解（npm 包）

> 选型表见 [播放包总览](README.md)。这份讲每种形态的完整参数和坑。

## 1. 装包

```bash
npm i babylon-scene-player @babylonjs/core @babylonjs/loaders
```

- Babylon 是 **peerDependencies**：消费项目通常已有一份，不重复打包；版本要 ^9
- Vue 组件子路径额外需要 `vue@^3`

## 2. 文档从哪来

三种来源，`mountScene` 都吃：

| 来源 | 写法 | 注意 |
| --- | --- | --- |
| 打包进项目 | `import doc from './scene.json'` | Vite/webpack 都会内联 JSON；文档随代码走，版本可 diff |
| 运行时拉 URL | `mountScene(el, '/scene.json')` | 播放器自己 fetch；`file://` 打开会被浏览器拦 |
| 后端接口返回 | `const doc = await (await fetch(url)).json()` | 最灵活，可做多场景切换 |

**模型文件**：`assets[].file` 是相对路径，基准由 `assetBaseUrl` 决定：

```js
// 场景和模型都在 public/ 下：scene.json 里写 "models/a.glb"，页面同域 → 默认就够
mountScene(el, doc)

// 模型在 CDN
mountScene(el, doc, { assetBaseUrl: 'https://cdn.example.com/twin/' })

// 模型走后端鉴权接口
mountScene(el, doc, {
  resolveAsset: async (assetId, node) => {
    const res = await fetch(`/api/assets/${assetId}`, { headers: auth })
    return res.blob()                       // URL / File / Blob 都行
  },
})
```

**数字科技地板**的四张贴图：默认用库里内置的 base64；要换自己的：

```js
mountScene(el, doc, { textureBaseUrl: '/assets/utils/' })   // 指向放着四张 png 的目录
```

## 3. 数据接入（四种形态按需选）

```js
// a) manual + 宿主推送（最常用）
import { mountScene, pushData } from 'babylon-scene-player'
const player = mountScene(el, doc)
pushData('src_m', { temp: 92 })

// b) data 选项：按源 id 给取数方式（播放器管轮询）
const player = mountScene(el, doc, {
  data: {
    src_1: () => fetch('/api/realtime').then(r => r.json()),          // Promise → 2s 轮询
    src_2: { intervalMs: 5000, load: async () => (await fetch('/api/slow')).json() },
    src_3: { run: 1 },                                                // 对象 → 立即一次
  },
})

// c) http/ws 写在 JSON 里（播放器自己跑，注意 CORS）
//    "sources": [{ "id": "src_1", "type": "http", "url": "...", "intervalMs": 2000 }]

// d) 裸 dataHub（要自己掌控节奏时）
import { dataHub } from 'babylon-scene-player'
dataHub.start(doc, () => { /* 自己求值注入 */ })
```

映射规则（`map`）和全部可绑 key 见 [数据绑定手册](../binding-manual.md)。

## 4. Vue 3 项目

```vue
<script setup>
import { ref } from 'vue'
import { ScenePlayer } from 'babylon-scene-player/vue'
import doc from './scene.json'

const live = ref({ run: 1, temp: 92 })

// 接业务数据
const ws = new WebSocket('wss://your-server/stream')
ws.onmessage = (e) => { live.value = JSON.parse(e.data) }
</script>

<template>
  <ScenePlayer :doc="doc" :data="live" @ready="p => console.log('场景就绪', p)" />
</template>
```

- `data` 键对上源 id 各推各的；单源时整个对象直接推（不用包一层 id）
- 键对不上且源不止一个 → Console 告警并跳过（唯一的坑，不静默）
- 路由切换 / 组件销毁 → 自动 dispose（含停轮询）
- 要用 CSS 撑满：给组件父容器或直接 `<ScenePlayer style="width:100vw;height:100vh" … />`

## 5. React / 原生项目

```jsx
import { useEffect, useRef } from 'react'
import { mountScene, pushData } from 'babylon-scene-player'

export function Twin({ doc, data }) {
  const host = useRef(null)
  const playerRef = useRef(null)

  useEffect(() => {
    playerRef.current = mountScene(host.current, doc)
    return () => playerRef.current?.dispose()
  }, [doc])

  useEffect(() => {                       // data 变化 → 推
    if (playerRef.current) pushData('src_m', data)
  }, [data])

  return <div ref={host} style={{ width: '100vw', height: '100vh' }} />
}
```

## 6. 单文件 HTML（不接 npm）

编辑器导出的 `scene-*.html` 双击即用。嵌进自己的页面：

```html
<iframe src="./scene-20260930.html" style="width:100%;height:100%;border:0" />
```

宿主页面与场景通信（同源时可用 `contentWindow`，跨域用 postMessage 到内部页面）：

```js
// 单文件内部（导出时可在「注入脚本」里带）
window.twinData.push('src_m', { run: 1 })
```

## 7. 卸载 checklist

- npm 库：`player.dispose()`（停渲染循环、停轮询、释放场景和 canvas）
- Vue 组件 / 上面两个 useEffect 的 cleanup 都已代劳
- **单文件 HTML**：关页面即可

## 8. 本地打包发给对方

```bash
cd babylon-scene-player
npm run build          # dist/index.js（ESM）+ dist/standalone.iife.js（单文件）
npm pack               # babylon-scene-player-x.y.z.tgz
```

对方收到 tgz 后：

```bash
npm install <路径>/babylon-scene-player-x.y.z.tgz @babylonjs/core @babylonjs/loaders
```

> 升级本地 tgz 后必须显式重装：`npm install file:xxx.tgz --save --force`——
> 同名覆盖 npm 会认为 "up to date" 而不更新。
