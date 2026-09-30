# 数字孪生场景编辑器 · 文档

一套把「3D 场景」当文档来编辑、存储、导出、播放的开源工具链。

```
┌──────────────────────┐         scene.json          ┌──────────────────────┐
│   3D 场景编辑器        │  ───────────────────────▶  │   3D 场景播放包        │
│   3Dbabyloncode       │   单文件HTML / ZIP / JSON   │   babylon-scene-player│
│   Vue3 + Babylon.js   │                            │   零依赖 ESM / IIFE   │
└──────────────────────┘                            └──────────────────────┘
   拖参数拼场景                                        任意页面一行代码跑起来
   存 IndexedDB                                        npm / Vue 组件 / script 标签
```

## 文档地图

| 想了解什么 | 看这里 |
| --- | --- |
| 这套东西是什么、两个工程怎么分工 | [架构总览](architecture.md) |
| 5 分钟跑通「编辑 → 导出 → 播放」 | [快速开始](quickstart.md) |
| 编辑器里每个功能怎么用 | [编辑器 · 能力地图](editor/README.md) → [功能详解](editor/features.md) |
| 点击 / 悬停让模型透明、发光、飞镜头 | [节点交互](editor/interactions.md) |
| 让场景随实时数据变化 | [数据绑定手册](binding-manual.md)（最详细的一份） |
| 在别人的项目里加载场景 | [播放包 · 接入选型](player/README.md) → [接入详解](player/integration.md) |
| API 参考 | [播放包 API](player/api.md) |
| scene.json 每个字段 | [场景文档协议](protocol.md) |
| 踩坑了 | [FAQ](faq.md) |

## 推荐阅读路径

**使用者**（只想把场景跑起来）：
快速开始 → 播放包接入选型 → 数据绑定手册

**场景编辑者**：
快速开始 → 编辑器能力地图 → 功能详解 → 节点交互 → 数据绑定手册

**二次开发者**（要嵌进自己的系统 / 贡献代码）：
架构总览 → 场景文档协议 → 播放包 API → 编辑器能力地图

## 两个工程

| 工程 | 目录 | 职责 | 产物 |
| --- | --- | --- | --- |
| 3D 场景编辑器 | `3Dbabyloncode/` | 可视化搭建场景：摆元素、配参数、配交互、配数据绑定，存 IndexedDB，导出 | `npm run dev` 的开发服务器；导出的 scene.json / ZIP / 单文件 HTML |
| 3D 场景播放包 | `babylon-scene-player/` | 把 scene.json 跑成 3D 场景：渲染、交互、数据注入 | npm 包 `babylon-scene-player`；`standalone.iife.js` 单文件包 |

两者的唯一契约是 **scene.json**（协议见 [protocol.md](protocol.md)）——文档是纯 JSON，
可以自己生成 / 改它，播放器不需要编辑器参与。

## 本地跑起来

```bash
# 编辑器
cd 3Dbabyloncode && npm install && npm run dev      # http://localhost:5173

# 播放包 demo（自带示例文档，含交互 + 数据注入演示）
cd babylon-scene-player && npm install && npm run demo   # http://localhost:5199
```
