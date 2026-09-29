<script setup>
/**
 * 工具栏「导出」菜单。
 *
 * 三个入口的区别就是「资源怎么带走」，用哪个取决于场景要去哪儿：
 *   - 单文件 HTML：模型和 Babylon 全内嵌，双击 / iframe 即用，别的技术栈也能接
 *   - 完整包 ZIP：scene.json + models/ + 贴图 + README，适合在项目里长期维护
 *   - 场景 JSON：只要文档，模型自己拷，适合接自己的构建流程
 *
 * 导出需要登录（编辑器其余功能不用）。门禁就在 run() 开头：没登录就记住
 * 用户点的是哪一项、弹登录框，登进去之后自动接着跑那一项——不让用户再点一次。
 *
 * ⚠️ 这是一个「产品层门禁」，不是安全边界：三个 exporter 目前都不连服务器，
 * 令牌只用于 /auth/me、/auth/logout。要把它变成真边界（没有票就不给下载），
 * 得有个服务端接口发导出票据，那是下一件事，别把这里的判断当防刷手段用。
 */
import { ref, onBeforeUnmount } from 'vue'
import { exportSceneHtml, exportSceneJson, exportSceneZip } from '../export/exportScene'
import { auth } from '../../store/auth'
import { UnauthorizedError } from '../../api/http'
import Icon from './Icon.vue'
import LoginDialog from './LoginDialog.vue'

const ITEMS = [
  {
    key: 'html',
    label: '导出单文件 HTML',
    desc: '模型 + 播放器全部内嵌，双击即用，也可 <iframe> 嵌进任何项目',
    run: exportSceneHtml,
  },
  {
    key: 'zip',
    label: '导出完整包 ZIP',
    desc: 'scene.json + models/ + 贴图 + 接入 README',
    run: exportSceneZip,
  },
  {
    key: 'json',
    label: '只导出场景 JSON',
    desc: '模型用相对路径引用，自己拷 models/ 目录',
    run: exportSceneJson,
  },
]

const open = ref(false)
const busy = ref(null)
const toast = ref('')
const warn = ref('')
/** 登录框开关，和「登录成功后要接着跑哪一项」 */
const loginOpen = ref(false)
let pending = null
let toastTimer = null

async function run(item) {
  if (busy.value) return

  // 门禁：未登录就先记住这一项，弹登录框，登完自动续上
  if (auth.status !== 'authed') {
    pending = item
    open.value = false
    loginOpen.value = true
    return
  }

  busy.value = item.key
  warn.value = ''
  toast.value = ''
  try {
    const result = await item.run()
    toast.value = result?.message || '已导出'
    warn.value = result?.warning || ''
  } catch (err) {
    console.error('[export]', err)
    // 导出中途 token 过期了（比如在别的标签页登出）：弹登录框，登完重试这一项。
    // 目前的三个 exporter 全是纯客户端运算、不发请求，所以这条分支暂时走不到——
    // 留着是为了哪天导出要读服务端资源时不用回头翻这里。
    if (err instanceof UnauthorizedError) {
      pending = item
      loginOpen.value = true
      return
    }
    toast.value = `导出失败：${err?.message || err}`
    warn.value = ''
  } finally {
    busy.value = null
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toast.value = ''
      warn.value = ''
    }, warn.value ? 12000 : 5000)
  }
}

/** 登录成功：接着跑被门禁拦下的那一项 */
async function onLoggedIn() {
  loginOpen.value = false
  const item = pending
  pending = null
  // 让弹窗先收起来再跑导出，否则会看到登录框压在导出 toast 上面
  await new Promise((r) => setTimeout(r, 0))
  if (item) run(item)
}

function toggle() {
  open.value = !open.value
}

/** 点菜单外面就收起 */
function onDocClick(e) {
  if (!open.value) return
  if (!e.target.closest?.('.export-menu')) open.value = false
}

document.addEventListener('pointerdown', onDocClick)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocClick)
  clearTimeout(toastTimer)
})
</script>

<template>
  <div class="export-menu">
    <button
      class="tool-btn primary"
      :disabled="busy"
      :title="auth.status === 'authed' ? '导出场景' : '需要登录后才能导出'"
      @click="toggle"
    >
      <Icon v-if="auth.status !== 'authed'" name="lock" :size="12" />
      {{ busy ? '导出中…' : '导出' }}
    </button>

    <div v-if="open" class="export-pop">
      <button
        v-for="item in ITEMS"
        :key="item.key"
        class="export-item"
        :disabled="busy"
        @click="run(item); open = false"
      >
        <span class="export-label">
          <Icon v-if="auth.status !== 'authed'" name="lock" :size="11" />
          {{ item.label }}
        </span>
        <span class="export-desc">{{ item.desc }}</span>
      </button>
    </div>

    <transition name="fade">
      <div v-if="toast" class="export-toast" :class="{ warn: warn }">
        <div>{{ toast }}</div>
        <div v-if="warn" class="export-warn">{{ warn }}</div>
      </div>
    </transition>

    <LoginDialog :open="loginOpen" @logged-in="onLoggedIn" @close="loginOpen = false" />
  </div>
</template>

<style scoped>
.export-menu {
  position: relative;
}
.tool-btn.primary {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  height: 30px;
  padding: 0 var(--s-3);
  font-size: var(--fs-sm);
  font-family: inherit;
  font-weight: 600;
  color: var(--on-accent);
  background: var(--grad-accent);
  border: 0;
  border-radius: var(--r-pill);
  cursor: pointer;
  box-shadow: var(--glow-accent);
  transition:
    filter var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}
.tool-btn.primary:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
}
.tool-btn.primary:active:not(:disabled) {
  transform: translateY(0) scale(0.97);
}
.tool-btn.primary:disabled {
  opacity: 0.55;
  cursor: default;
  box-shadow: none;
}
.export-pop {
  position: absolute;
  top: 38px;
  right: 0;
  z-index: var(--z-pop);
  width: 320px;
  padding: var(--s-2);
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  background: var(--c-pop);
  border: 1px solid var(--c-glass-strong);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-pop);
}
.export-item {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-2) var(--s-3);
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  cursor: pointer;
  color: var(--t-body);
  transition:
    background var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.export-item:hover {
  background: rgb(255 255 255 / 7%);
  border-color: var(--c-glass);
}
.export-item:disabled {
  opacity: 0.5;
  cursor: default;
}
.export-label {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  font-size: var(--fs-sm);
  color: var(--t-strong);
}
.export-label .icon {
  color: var(--accent);
}
.export-desc {
  font-size: var(--fs-xs);
  line-height: 1.5;
  color: var(--t-muted);
}
.export-toast {
  position: absolute;
  top: 38px;
  right: 0;
  z-index: var(--z-toast);
  width: 320px;
  padding: var(--s-2) var(--s-3);
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--ok);
  background: var(--ok-soft);
  border: 1px solid var(--ok-line);
  border-radius: var(--r-md);
  backdrop-filter: blur(10px);
}
.export-toast.warn {
  color: var(--warn);
  background: var(--warn-soft);
  border-color: var(--warn-line);
}
.export-warn {
  margin-top: var(--s-1);
  color: var(--warn);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--dur) var(--ease);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}
</style>
