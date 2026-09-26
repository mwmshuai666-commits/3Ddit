<script setup>
/**
 * 工具栏「导出」菜单。
 *
 * 三个入口的区别就是「资源怎么带走」，用哪個取决于场景要去哪儿：
 *   - 单文件 HTML：模型和 Babylon 全内嵌，双击 / iframe 即用，别的技术栈也能接
 *   - 完整包 ZIP：scene.json + models/ + 贴图 + README，适合在项目里长期维护
 *   - 场景 JSON：只要文档，模型自己拷，适合接自己的构建流程
 */
import { ref, onBeforeUnmount } from 'vue'
import { EXPORTERS, exportSceneHtml, exportSceneJson, exportSceneZip } from '../export/exportScene'

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
let toastTimer = null

async function run(item) {
  if (busy.value) return
  busy.value = item.key
  warn.value = ''
  try {
    const result = await item.run()
    toast.value = result?.message || '已导出'
    warn.value = result?.warning || ''
  } catch (err) {
    console.error('[export]', err)
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
    <button class="tool-btn primary" :disabled="busy" @click="toggle">
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
        <span class="export-label">{{ item.label }}</span>
        <span class="export-desc">{{ item.desc }}</span>
      </button>
    </div>

    <transition name="fade">
      <div v-if="toast" class="export-toast" :class="{ warn: warn }">
        <div>{{ toast }}</div>
        <div v-if="warn" class="export-warn">{{ warn }}</div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.export-menu {
  position: relative;
}
.export-pop {
  position: absolute;
  top: 36px;
  right: 0;
  z-index: 20;
  width: 320px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #161c29;
  border: 1px solid #2a3346;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 45%);
}
.export-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 10px;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  color: #c6d0e0;
}
.export-item:hover {
  background: #1f2a3d;
}
.export-item:disabled {
  opacity: 0.5;
  cursor: default;
}
.export-label {
  font-size: 12.5px;
  color: #e6ecf5;
}
.export-desc {
  font-size: 11px;
  line-height: 1.5;
  color: #7b89a3;
}
.export-toast {
  position: absolute;
  top: 38px;
  right: 0;
  z-index: 19;
  width: 320px;
  padding: 8px 10px;
  font-size: 11.5px;
  line-height: 1.6;
  color: #b6f0c6;
  background: #14261c;
  border: 1px solid #24513a;
  border-radius: 6px;
}
.export-toast.warn {
  color: #f0dfae;
  background: #262014;
  border-color: #56492a;
}
.export-warn {
  margin-top: 4px;
  color: #cbb27a;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
