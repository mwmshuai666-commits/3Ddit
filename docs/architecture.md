# 架构总览

## 一句话

**编辑器产出文档，播放包消费文档**——两者通过网络里唯一的一份 `scene.json` 解耦，
可以各自独立演进、独立开源、独立部署。

## 系统全景

```
        ┌─────────────────────────────────────────────────────────┐
        │                       编辑器（Vue 3）                     │
        │                                                          │
        │  LeftPanel ──┐   ┌──────────────┐   ┌─────────────────┐  │
        │  搭建/场景树  ├──▶│  editor store │──▶│  EditorEngine   │  │
        │              ┌──▶│  (doc + Dexie)│   │  (Babylon 内核)  │  │
        │  Inspector ──┘   └──────┬───────┘   └────────┬────────┘  │
        │  属性/交互/绑定          │ 深监听自动保存        │ 渲染      │
        └──────────────────────────┼────────────────────┼──────────┘
                                   │                     │
                            IndexedDB 自动保存             │
                                   │                     │
                        点击「导出」  │                     │
                                   ▼                     ▼
        ┌─────────────────────────────────────────────────────────┐
        │                      scene.json（协议）                   │
        │  scene / nodes[] / assets[] / sources[] / node.interaction │
        └───────────────────────────┬─────────────────────────────┘
                                    │  三种产物形态
              ┌─────────────────────┼──────────────────────┐
              ▼                     ▼                      ▼
      ┌──────────────┐      ┌──────────────┐        ┌──────────────┐
      │  单文件 HTML   │      │  完整包 ZIP   │        │  场景 JSON    │
      │  双击/iframe  │      │  json+models │        │  接自己流程   │
      └──────┬───────┘      └──────┬───────┘        └──────┬───────┘
             └─────────────────────┼──────────────────────┘
                                   ▼
        ┌─────────────────────────────────────────────────────────┐
        │                 播放包（零框架依赖 ESM）                   │
        │                                                          │
        │   mountScene(container, doc, options)                   │
        │     └─▶ SceneRuntime ──┬── InteractionRuntime（悬停/点击） │
        │                        ├── dataHub（http/ws/manual）      │
        │                        └── binding 求值器（数据 → 显示）    │
        └─────────────────────────────────────────────────────────┘
```

## 职责边界（为什么分两个工程）

| | 编辑器 | 播放包 |
| --- | --- | --- |
| 核心类 | `EditorEngine` | `SceneRuntime` |
| 依赖 | Vue 3 + Babylon + Dexie | 仅 Babylon（Vue 是 optional peer） |
| 交互 | Gizmo 变换、点选、选中描边、配置面板 | **运行**交互（悬停/点击效果）、无编辑态 |
| 产物 | 文档 + 导出文件 | 一个能跑的 player 对象 |
| 体积约束 | 开发期工具，不敏感 | 要进别人项目，尽量小（Babylon 走 peer） |
| 状态 | 有（文档是单一事实来源） | 无（文档只读，渲染是它的输出） |

**同源代码**：两个工程各存一份渲染/求值实现（`pipeBuilder.js`、`digitalGround.js`、
`htmlPanel.js`、`binding.js`、`interactionRuntime.js`、`cameraFly.js`），头注都标了
「与另一边同源，改一边记得同步」。播放器侧多了 DEV 期不存在的运行时（dataHub 实拉、
交互命中打标），编辑器侧多了编辑态（Gizmo、回写）。

## 数据流

### 1. 配置流（人 → 场景）

```
用户的点击/输入 → store action → editor.doc（可序列化 JSON，单一事实来源）
                                   ├─▶ EditorEngine（同步 Babylon 表达）
                                   └─▶ IndexedDB（800ms 防抖自动保存）
```

红线：**所有对场景的修改都走 store action**；doc 是纯 JSON，引擎只是它的投影。

### 2. 数据流（外部数据 → 显示）

```
http 轮询 / ws 长连 / 宿主 pushData
        │
        ▼
     dataHub（values 缓存 + 在线判定）
        │  每收到一条数据触发求值
        ▼
     binding 求值器（逐节点、逐绑定：取 field → map 换算 → 规整）
        │
        ▼
     applyRuntimeValue(nodeId, key, value)  ──▶ 引擎热更（只改 look，不碰几何）
```

红线：**只做 look 级热更**（颜色/显隐/流向/浓度…），永不写回 `props`、永不碰几何字段
（一改就要重建管道，数据一跳就卡死）。

### 3. 交互流（指针 → 效果）

```
pointer 事件（POINTERMOVE / POINTERTAP）
   │  Babylon 需开 constantlyUpdateMeshUnderPointer 才有 move 拾取
   ▼
拾取 → 沿 mesh.metadata.nodeId 找节点   ── 编辑器/播放器加载时都会打这个标
   ▼
InteractionRuntime：查 node.interaction
   ├─ transparent：材质快照 → 改 alpha/着色（PBR 切 ALPHABLEND+深度预Pass）→ 还原
   ├─ outline：SelectionOutlineLayer（Sobel 边缘检测，只描外缘）
   └─ camera：flyCameraTo（CubicEase，animate target/alpha/beta/radius）
```

## 目录结构

```
3Dbabyloncode/                      # 编辑器
├── src/editor/
│   ├── core/
│   │   ├── EditorEngine.js         # Babylon 内核：实例化、Gizmo、点选、环境、取景
│   │   ├── interactionRuntime.js   # 节点交互运行时（与播放包同源）
│   │   ├── cameraFly.js            # 相机缓动飞行（与播放包同源）
│   │   ├── dataHub.js / binding.js # 数据源运行时 + 绑定求值（与播放包同源）
│   │   ├── pipeBuilder.js          # 能量管道（内芯/外壳/光带/粒子）
│   │   ├── digitalGround.js        # 数字科技地板（着色器）
│   │   └── htmlPanel.js            # HTML 面板（SVG foreignObject 栅格化）
│   ├── schema/sceneSchema.js       # 场景文档协议 + 各类型属性表（表单自动生成的源头）
│   ├── components/                 # Inspector / SceneTree / Viewport / BindingDialog …
│   ├── store/editor.js             # 状态 + Dexie 持久化 + 素材库
│   └── export/                     # 单文件 HTML / ZIP / JSON 三条导出链路

babylon-scene-player/               # 播放包
├── src/
│   ├── index.js                    # 对外 API：mountScene / fetchScene / pushData
│   ├── SceneRuntime.js             # 播放内核（文档 → 场景）
│   ├── interactionRuntime.js       # 交互运行时（同源）
│   ├── dataBinding.js              # data 选项落地（对象/函数/轮询）
│   ├── vue/ScenePlayer.vue         # Vue 3 组件包装（子路径 babylon-scene-player/vue）
│   └── effects.js / pipeBuilder.js # 特效与管道的播放侧实现
└── dist/
    ├── index.js                    # ESM 库产物（npm 用）
    └── standalone.iife.js          # 单文件产物（编辑器导出内联用）
```

## 技术选型与理由

| 决策 | 理由 |
| --- | --- |
| 纯 JSON 协议，不搞私有格式 | 手可改、可 diff、可程序生成、任何后端能存 |
| 编辑器不依赖播放包 | 编辑器要 Gizmo/响应式，播放包要小；耦合会让两边都难演进 |
| 播放包 Babylon 走 peerDependencies | 消费项目通常已有一份 Babylon，不重复打包 |
| 数据绑定只做 look 级 | 几何字段数据驱动会触发重建，实时数据下必卡 |
| 模型存 IndexedDB blob、文档只存 assetId | 同一素材多实例不膨胀；导出时再补全引用 |
| 单文件 HTML 全资源 base64 内联 | 双击就能看、iframe 嵌任何栈都不挑环境 |
