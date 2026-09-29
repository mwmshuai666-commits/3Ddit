<script setup>
/**
 * 编辑器外壳：顶栏 / 左图标栏 + 搭建面板 / 视口 / 属性面板 / 状态浮条。
 *
 * 整个页面的视觉规则：
 *   - 底色是一束中心聚光（.editor-shell 的 radial-gradient），所有 chrome 都是
 *     压在暗底上的深色卡片，所以四周永远比中间暗；
 *   - 卡片是唯一容器：面板、浮条、胶囊都用 --r-card / 1px 半透明描边；
 *   - 黄色只给「主操作、选中、聚焦」三件事，别的地方一概不用。
 */
import { onMounted, onBeforeUnmount, ref } from 'vue'
import Toolbar from './editor/components/Toolbar.vue'
import LeftPanel from './editor/components/LeftPanel.vue'
import Viewport from './editor/components/Viewport.vue'
import Inspector from './editor/components/Inspector.vue'
import SideRail from './editor/components/SideRail.vue'
import Icon from './editor/components/Icon.vue'
import { getEngine } from './editor/core/engineHolder'
import { auth } from './store/auth'
import { editor, findNode, GROUND_SELECTION } from './editor/store/editor'

/** 渲染健康度。每秒读一次就够——放在 onAfterRender 里每帧更新会白白触发响应式 */
const fps = ref(0)
const meshes = ref(0)
let tick = null

function sample() {
  const engine = getEngine()
  if (!engine?.engine) return
  fps.value = engine.engine.getFps()
  meshes.value = engine.scene?.getActiveMeshes().length || 0
}

function isTyping(target) {
  const tag = target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable
}

/** 状态栏显示名称而不是内部 id */
function selectedName() {
  if (!editor.selectedId) return null
  if (editor.selectedId === GROUND_SELECTION) return '场景底板'
  return findNode(editor.selectedId)?.name || editor.selectedId
}

const accountLabel = () =>
  auth.status === 'authed' ? `已登录 · ${auth.user?.displayName || auth.user?.username || ''}` : '未登录'

onMounted(() => {
  tick = setInterval(sample, 1000)
})
onBeforeUnmount(() => {
  clearInterval(tick)
})
</script>

<template>
  <div class="editor-shell">
    <Toolbar />

    <div class="editor-body">
      <SideRail side="left" />
      <LeftPanel />
      <Viewport />
      <Inspector />
    </div>

    <footer class="status-bar">
      <span class="pill">
        <Icon name="stack" :size="12" />
        {{ editor.doc.nodes.length }} 个节点
      </span>
      <span v-if="selectedName()" class="pill accent">
        <Icon name="crosshair" :size="12" />
        {{ selectedName() }}
      </span>
      <span class="pill mono">{{ fps }} FPS · {{ meshes }} 网格</span>
      <span class="pill">
        <span class="dot" :class="auth.status === 'authed' ? 'on' : 'off'"></span>
        {{ accountLabel() }}
      </span>
      <span class="hint">W 移动 · E 旋转 · R 缩放 · F 聚焦 · Delete 删除</span>
    </footer>
  </div>
</template>

<style scoped>
.editor-shell {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  /* 中心聚光：中间亮、四周沉下去，卡片才"浮"得起来 */
  background:
    radial-gradient(ellipse 70% 60% at 50% 38%, rgb(140 145 158 / 14%) 0%, transparent 72%),
    var(--c-app);
  color: var(--t-body);
  font-size: var(--fs-md);
  overflow: hidden;
  padding: var(--s-3) var(--s-3) 0;
}
.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-2);
}

/* ---- 底部状态浮条：浮在页面底部的一颗玻璃胶囊 ---- */
.status-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  height: var(--h-status);
  margin: var(--s-2) auto var(--s-2);
  padding: 0 var(--s-2);
  font-size: var(--fs-2xs);
  color: var(--t-muted);
}
.status-bar .pill {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  height: 22px;
  padding: 0 var(--s-2);
  white-space: nowrap;
  border: 1px solid var(--c-glass);
  border-radius: var(--r-pill);
}
/* 选中的东西用强调色描边，和面板里的选中态同一个色 */
.status-bar .pill.accent {
  color: var(--accent);
  border-color: var(--accent-line);
}
.status-bar .pill .icon {
  color: var(--t-faint);
}
.status-bar .pill.accent .icon {
  color: var(--accent);
}
.status-bar .mono {
  font-variant-numeric: tabular-nums;
}
.status-bar .hint {
  color: var(--t-faint);
  white-space: nowrap;
  padding-left: var(--s-2);
}
/* 登录态只用一个 5px 的点表示：颜色已经说清了，不需要图标 */
.status-bar .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-bar .dot.on {
  background: var(--ok);
}
.status-bar .dot.off {
  background: var(--t-faint);
}

/* 窄屏：图标栏会挤掉宝贵的宽度，先牺牲它们 */
@media (max-width: 980px) {
  .editor-body .rail {
    display: none;
  }
}
@media (max-width: 720px) {
  .editor-shell {
    padding: var(--s-2) var(--s-2) 0;
  }
  .editor-body {
    gap: var(--s-1);
    margin-top: var(--s-1);
  }
  .status-bar .hint {
    display: none;
  }
}
</style>
