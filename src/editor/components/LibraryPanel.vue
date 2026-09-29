<script setup>
/**
 * 左侧「搭建」面板：八个栏目做成可折叠的手风琴。
 *
 * 展开状态、当前栏目都在 store 的 ui 里（不走 localStorage 的手写读取了）：
 * 左右图标栏点过来要「展开 + 滚到那一栏」，上传模型要弹文件框，都得让面板外部
 * 驱动内部的展开状态和文件输入。
 *
 * 五六两栏（HTML 元素导入、环境天空盒）是后来加的：前者是用户手写 HTML 片段，
 * 后者上传 hdr 当天空盒 + 全局环境光照。
 */
import { ref, computed, watch, nextTick } from 'vue'
import {
  GROUND_CATALOG,
  PRIMITIVE_CATALOG,
  LIGHT_CATALOG,
  EFFECT_SECTION,
  HTML_DEFAULT_SOURCE,
  ENV_FORM,
} from '../schema/sceneSchema'
import {
  editor,
  ui,
  toggleLibSection,
  addFromCatalog,
  setGroundType,
  uploadAsset,
  addModelInstance,
  addHtmlPanel,
  addWebPanel,
  deleteAsset,
  modelAssets,
  envAssets,
  uploadEnvAsset,
  setEnvironmentAsset,
  updateEnvironmentProp,
} from '../store/editor'
import { iconOf } from './icons'
import Icon from './Icon.vue'

function toggle(key) {
  toggleLibSection(key)
}

/* ---- 模型自定义 ---- */

const fileInput = ref(null)
const uploading = ref(false)

async function onFilePicked(evt) {
  const file = evt.target.files?.[0]
  evt.target.value = '' // 允许重复选同一个文件
  if (!file) return
  uploading.value = true
  try {
    await uploadAsset(file)
  } finally {
    uploading.value = false
  }
}

const models = computed(() => modelAssets())

/* ---- 侧栏 / 视口浮动按钮请求：上传模型 ---- */
watch(
  () => ui.uploadSeq,
  () => fileInput.value?.click(),
)

/* ---- 侧栏图标请求：展开并滚到对应栏目 ---- */
watch(
  () => ui.focus.seq,
  () => {
    const key = ui.focus.section
    if (!key) return
    nextTick(() => {
      document.getElementById(`lib-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  },
)

/* ---- HTML 元素导入 ---- */

const htmlSource = ref(HTML_DEFAULT_SOURCE)
const htmlWidth = ref(4)
const htmlHeight = ref(2.4)
const htmlMode = ref('3d')

function importHtml() {
  if (!htmlSource.value.trim()) {
    window.alert('先填一段 HTML，再点导入')
    return
  }
  // 粘了 <iframe> 的话先提醒一声：栅格化画不出嵌套浏览上下文，
  // 用户以为自己导进去了，结果是一块空白板
  if (/<iframe[\s>]/i.test(htmlSource.value)) {
    window.alert('HTML 面板画不出 <iframe>（栅格化时浏览器不加载嵌套页面）。\n'
      + '要放真网页，请用下面「网页导入」那一栏，填网址。')
    return
  }
  addHtmlPanel(htmlSource.value, {
    width: Number(htmlWidth.value) || 4,
    height: Number(htmlHeight.value) || 2.4,
    mode: htmlMode.value,
  })
}

/* ---- 网页导入（真 iframe 浮层） ---- */

const webUrl = ref('')
const webWidth = ref(4)
const webHeight = ref(2.4)
// 默认打开交互：导入一块网页却点不动，是最容易踩的坑（pointer-events:none 时
// 点击全被 canvas 收走，页面收不到）。代价是「指着面板拖不动相机」，
// 想转视角就把这个勾去掉，或者从面板外面起拖。
const webInteractive = ref(true)
const webMode = ref('3d')

function importWeb() {
  const url = webUrl.value.trim()
  if (!url) {
    window.alert('先填一个网页地址，再点导入')
    return
  }
  if (!/^https?:\/\//i.test(url)) {
    window.alert('地址要以 http:// 或 https:// 开头')
    return
  }
  addWebPanel(url, {
    width: Number(webWidth.value) || 4,
    height: Number(webHeight.value) || 2.4,
    interactive: webInteractive.value,
    mode: webMode.value,
  })
}

/* ---- 环境天空盒 ---- */

const envFileInput = ref(null)
const envUploading = ref(false)

async function onEnvFilePicked(evt) {
  const file = evt.target.files?.[0]
  evt.target.value = ''
  if (!file) return
  envUploading.value = true
  try {
    await uploadEnvAsset(file)
  } finally {
    envUploading.value = false
  }
}

const envs = computed(() => envAssets())
const currentEnv = computed(() => editor.doc.scene.environment)
const envActive = computed(() => currentEnv.value?.type === 'hdr' && currentEnv.value?.assetId)

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div class="library">
    <!-- 场景底板 -->
    <section id="lib-ground" class="lib-section" :class="{ closed: !ui.libOpen.ground }">
      <h3 @click="toggle('ground')">
        <Icon name="chevron" :size="12" class="caret" :class="{ shut: !ui.libOpen.ground }" />
        <Icon name="layers" :size="13" />
        场景底板 <em>· 整场景唯一</em>
      </h3>
      <div v-show="ui.libOpen.ground" class="lib-body">
        <div class="ground-list">
          <button
            v-for="g in GROUND_CATALOG"
            :key="g.type"
            class="ground-item"
            :class="{ active: editor.doc.scene.ground.type === g.type }"
            @click="setGroundType(g.type)"
          >
            <span class="ground-swatch" :class="`sw-${g.type}`"></span>
            <span class="ground-text">
              <strong>{{ g.name }}</strong>
              <em>{{ g.desc }}</em>
            </span>
          </button>
        </div>
      </div>
    </section>

    <!-- 基础几何体 -->
    <section id="lib-primitive" class="lib-section" :class="{ closed: !ui.libOpen.primitive }">
      <h3 @click="toggle('primitive')">
        <Icon name="chevron" :size="12" class="caret" :class="{ shut: !ui.libOpen.primitive }" />
        <Icon name="box" :size="13" />
        基础几何体 <em>· 点击添加到场景</em>
      </h3>
      <div v-show="ui.libOpen.primitive" class="lib-body">
        <div class="item-grid">
          <button
            v-for="p in PRIMITIVE_CATALOG"
            :key="p.type"
            class="lib-item"
            @click="addFromCatalog('primitive', p)"
          >
            <span class="lib-icon"><Icon name="box" :size="13" /></span>
            {{ p.name }}
          </button>
        </div>
      </div>
    </section>

    <!-- 灯光 -->
    <section id="lib-light" class="lib-section" :class="{ closed: !ui.libOpen.light }">
      <h3 @click="toggle('light')">
        <Icon name="chevron" :size="12" class="caret" :class="{ shut: !ui.libOpen.light }" />
        <Icon name="sun" :size="13" />
        灯光 <em>· 旋转控制照射方向</em>
      </h3>
      <div v-show="ui.libOpen.light" class="lib-body">
        <div class="item-grid">
          <button
            v-for="l in LIGHT_CATALOG"
            :key="l.type"
            class="lib-item"
            @click="addFromCatalog('light', l)"
          >
            <span class="lib-icon"><Icon name="sun" :size="13" /></span>
            {{ l.name }}
          </button>
        </div>
      </div>
    </section>

    <!-- 特效组件 -->
    <section id="lib-effect" class="lib-section" :class="{ closed: !ui.libOpen.effect }">
      <h3 @click="toggle('effect')">
        <Icon name="chevron" :size="12" class="caret" :class="{ shut: !ui.libOpen.effect }" />
        <Icon name="sparkles" :size="13" />
        特效组件 <em>· 管道 / 飞线 / 波纹墙 / 天气</em>
      </h3>
      <div v-show="ui.libOpen.effect" class="lib-body">
        <div class="item-grid">
          <button
            v-for="d in EFFECT_SECTION"
            :key="d.type"
            class="lib-item"
            :title="d.desc"
            @click="addFromCatalog(d.kind, d)"
          >
            <span class="lib-icon"><Icon :name="iconOf(d.icon || d.kind)" :size="13" /></span>
            {{ d.name }}
          </button>
        </div>
      </div>
    </section>

    <!-- 模型自定义 -->
    <section id="lib-model" class="lib-section" :class="{ closed: !ui.libOpen.model }">
      <h3 @click="toggle('model')">
        <Icon name="chevron" :size="12" class="caret" :class="{ shut: !ui.libOpen.model }" />
        <Icon name="cube" :size="13" />
        模型自定义 <em>· glb 素材，点击复用</em>
      </h3>
      <div v-show="ui.libOpen.model" class="lib-body">
        <input
          ref="fileInput"
          type="file"
          accept=".glb,model/gltf-binary"
          hidden
          @change="onFilePicked"
        />
        <button class="upload-btn" :disabled="uploading" @click="fileInput.click()">
          <Icon name="upload" :size="14" />
          {{ uploading ? '加载中…' : '上传 GLB（自动放入场景）' }}
        </button>

        <div v-if="models.length" class="asset-list">
          <button
            v-for="a in models"
            :key="a.id"
            class="asset-item"
            title="点击添加到场景"
            @click="addModelInstance(a.id)"
          >
            <span class="asset-icon"><Icon name="cube" :size="15" /></span>
            <span class="asset-meta">
              <strong>{{ a.name }}</strong>
              <em>{{ fmtSize(a.size) }}</em>
            </span>
            <span class="asset-del" title="从素材库删除" @click.stop="deleteAsset(a.id)">
              <Icon name="close" :size="12" />
            </span>
          </button>
        </div>
        <div v-else class="asset-empty">还没有模型素材，上传一个 .glb 开始</div>
      </div>
    </section>

    <!-- HTML 元素导入 -->
    <section id="lib-html" class="lib-section" :class="{ closed: !ui.libOpen.html }">
      <h3 @click="toggle('html')">
        <Icon name="chevron" :size="12" class="caret" :class="{ shut: !ui.libOpen.html }" />
        <Icon name="code" :size="13" />
        HTML 元素导入 <em>· 手写内容变成场景面板</em>
      </h3>
      <div v-show="ui.libOpen.html" class="lib-body">
        <textarea
          v-model="htmlSource"
          class="html-input"
          rows="8"
          spellcheck="false"
          placeholder="<div style=&#34;padding:12px;color:#fff&#34;>…</div>"
        ></textarea>
        <div class="html-row">
          <label>宽(场景单位)</label>
          <input v-model.number="htmlWidth" type="number" min="0.1" step="0.1" />
          <label>高</label>
          <input v-model.number="htmlHeight" type="number" min="0.1" step="0.1" />
        </div>
        <div class="html-row">
          <label>朝向</label>
          <select v-model="htmlMode">
            <option value="3d">3D 面板</option>
            <option value="billboard">始终朝你</option>
          </select>
        </div>
        <button class="upload-btn solid" @click="importHtml">
          <Icon name="plus" :size="13" />
          导入到场景
        </button>
        <p class="html-tip">
          面板内容靠把 HTML 栅格化成贴图实现：行内样式、文字、表格、简单布局都照原样，
          <code>&lt;br&gt;</code>、<code>&amp;nbsp;</code> 会自动转成能渲染的写法；
          但 <code>&lt;script&gt;</code>、外链图片字体、canvas / 视频不会生效
          （渲染失败会自动退化成纯文本，内容不会丢）。大小和朝向导入后还能在右侧属性里改。
        </p>
      </div>
    </section>

    <!-- 网页导入（DOM iframe 浮层） -->
    <section id="lib-web" class="lib-section" :class="{ closed: !ui.libOpen.web }">
      <h3 @click="toggle('web')">
        <Icon name="chevron" :size="12" class="caret" :class="{ shut: !ui.libOpen.web }" />
        <Icon name="globe" :size="13" />
        网页导入 <em>· 场景里放一块真网页</em>
      </h3>
      <div v-show="ui.libOpen.web" class="lib-body">
        <input
          v-model.trim="webUrl"
          class="html-input"
          type="text"
          spellcheck="false"
          placeholder="https://www.example.com"
        />
        <div class="html-row">
          <label>宽(场景单位)</label>
          <input v-model.number="webWidth" type="number" min="0.1" step="0.1" />
          <label>高</label>
          <input v-model.number="webHeight" type="number" min="0.1" step="0.1" />
        </div>
        <div class="html-row">
          <label>朝向</label>
          <select v-model="webMode">
            <option value="3d">3D 面板</option>
            <option value="billboard">始终朝你</option>
          </select>
        </div>
        <label class="html-check">
          <input v-model="webInteractive" type="checkbox" />
          <span>可交互（打开：点击/滚轮给网页；关闭：指着面板也能拖相机）</span>
        </label>
        <button class="upload-btn solid" @click="importWeb">
          <Icon name="plus" :size="13" />
          导入到场景
        </button>
        <p class="html-tip">
          这里放的是真的 <code>&lt;iframe&gt;</code>：网页是活的，能滚动、能点、能跑图表和视频
          （HTML 面板是栅格化贴图，<code>&lt;iframe&gt;</code> 画不出来）。
          「可交互」默认是打开的 —— 不打开的话点击全被画布收走，页面根本收不到。
          另外两条限制要知道：它永远贴在画布上面，3D 物体挡不住它；
          对方站点可以用 <code>X-Frame-Options</code> / CSP 拒绝被嵌入，那样就只有一片空白，
          这种时候不是没点中，是页面压根没加载出来。
        </p>
      </div>
    </section>

    <!-- 环境天空盒 -->
    <section id="lib-env" class="lib-section" :class="{ closed: !ui.libOpen.env }">
      <h3 @click="toggle('env')">
        <Icon name="chevron" :size="12" class="caret" :class="{ shut: !ui.libOpen.env }" />
        <Icon name="globe" :size="13" />
        环境天空盒 <em>· 上传 hdr 照亮整个场景</em>
      </h3>
      <div v-show="ui.libOpen.env" class="lib-body">
        <input
          ref="envFileInput"
          type="file"
          accept=".hdr,image/vnd.radiance"
          hidden
          @change="onEnvFilePicked"
        />
        <button class="upload-btn" :disabled="envUploading" @click="envFileInput.click()">
          <Icon name="upload" :size="13" />
          {{ envUploading ? '加载中…' : '上传 HDR 环境贴图' }}
        </button>

        <div v-if="envs.length" class="asset-list">
          <button
            v-for="a in envs"
            :key="a.id"
            class="asset-item"
            :class="{ active: envActive && currentEnv.assetId === a.id }"
            :title="envActive && currentEnv.assetId === a.id ? '当前环境' : '点击设为当前环境'"
            @click="setEnvironmentAsset(a.id)"
          >
            <span class="asset-icon"><Icon name="globe" :size="15" /></span>
            <span class="asset-meta">
              <strong>{{ a.name }}</strong>
              <em>{{ fmtSize(a.size) }}</em>
            </span>
            <span class="asset-del" title="从素材库删除" @click.stop="deleteAsset(a.id)">
              <Icon name="close" :size="12" />
            </span>
          </button>
        </div>
        <div v-else class="asset-empty">还没有环境贴图，上传一个 .hdr 开始（Poly Haven 上有一堆）</div>

        <template v-if="envActive">
          <div class="env-fields">
            <div v-for="f in ENV_FORM" :key="f.key" class="env-field">
              <span class="env-label">{{ f.label }}</span>
              <input
                v-if="f.type === 'number'"
                type="number"
                :min="f.min"
                :max="f.max"
                :step="f.step"
                :value="currentEnv.props?.[f.key]"
                @input="updateEnvironmentProp(f.key, Number($event.target.value))"
              />
              <label v-else-if="f.type === 'switch'" class="env-switch">
                <input
                  type="checkbox"
                  :checked="currentEnv.props?.[f.key] !== false"
                  @change="updateEnvironmentProp(f.key, $event.target.checked)"
                />
                <span>{{ currentEnv.props?.[f.key] === false ? '关' : '开' }}</span>
              </label>
            </div>
          </div>
          <button class="upload-btn ghost" @click="setEnvironmentAsset(null)">
            <Icon name="close" :size="12" />
            移除环境（回到纯色背景）
          </button>
        </template>
        <p v-else class="html-tip">当前没有环境：背景是纯色，物体只吃场景里的灯光。</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.library {
  padding: var(--s-2);
  overflow-y: auto;
}
/* 栏目就是这个面板本身卡出来的分组：不加描边，靠间距和标题分层 */
.lib-section {
  margin-bottom: var(--s-3);
  scroll-margin-block-start: var(--s-2);
}
.lib-section h3 {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin: 0;
  padding: 0 var(--s-2);
  height: var(--h-row);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--t-body);
  cursor: pointer;
  user-select: none;
  border-radius: var(--r-sm);
}
.lib-section h3:hover {
  color: var(--t-strong);
  background: rgb(255 255 255 / 5%);
}
.lib-section h3 em {
  margin-left: auto;
  font-size: var(--fs-2xs);
  font-weight: 400;
  color: var(--t-faint);
  font-style: normal;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.caret {
  flex-shrink: 0;
  color: var(--t-faint);
  transition: transform var(--dur) var(--ease);
}
/* 朝下就是展开，朝右就是收起 —— 靠旋转而不是换字形 */
.caret.shut {
  transform: rotate(-90deg);
}
.lib-body {
  padding: var(--s-2) var(--s-1) 0;
}
.ground-list {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}
.ground-item {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2);
  background: var(--grad-glass);
  border: 1px solid var(--c-glass);
  border-radius: var(--r-md);
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--dur) var(--ease),
    background var(--dur) var(--ease);
}
.ground-item:hover {
  border-color: var(--accent-line);
}
.ground-item.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.ground-swatch {
  width: 26px;
  height: 26px;
  border-radius: var(--r-sm);
  flex-shrink: 0;
  border: 1px solid var(--c-line-strong);
}
.ground-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ground-text strong {
  font-size: var(--fs-sm);
  color: var(--t-strong);
  font-weight: 600;
}
.ground-text em {
  font-size: var(--fs-2xs);
  color: var(--t-muted);
  font-style: normal;
}
.item-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-1);
}
.lib-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  min-height: 52px;
  padding: var(--s-2);
  font-size: var(--fs-xs);
  font-family: inherit;
  color: var(--t-body);
  background: var(--grad-glass);
  border: 1px solid var(--c-glass);
  border-radius: var(--r-md);
  cursor: pointer;
  transition:
    color var(--dur) var(--ease),
    border-color var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}
.lib-item:hover {
  transform: translateY(-1px);
  border-color: var(--accent-line);
  color: var(--t-strong);
}
.lib-item:active {
  transform: translateY(0);
}
/* 图标容器只负责对齐，颜色一律 --t-muted：种类信息形状已经带够了 */
.lib-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--t-muted);
  background: var(--c-active);
  border-radius: var(--r-sm);
}
.lib-item:hover .lib-icon {
  color: var(--accent-hover);
}
.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  width: 100%;
  height: var(--h-btn-lg);
  margin-bottom: var(--s-2);
  font-size: var(--fs-sm);
  font-family: inherit;
  color: var(--accent-hover);
  background: var(--accent-soft);
  border: 1px dashed var(--accent-line);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition:
    background var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.upload-btn:hover:not(:disabled) {
  background: var(--c-active);
  border-color: var(--accent);
}
.upload-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.upload-btn.solid {
  border-style: solid;
  margin-bottom: var(--s-1);
  color: var(--on-accent);
  font-weight: 600;
  background: var(--grad-accent);
  border-color: transparent;
  border-radius: var(--r-pill);
  box-shadow: var(--glow-accent);
}
.upload-btn.solid:hover:not(:disabled) {
  background: var(--grad-accent);
  filter: brightness(1.06);
  border-color: transparent;
}
.upload-btn.ghost {
  height: var(--h-btn);
  font-size: var(--fs-xs);
  color: var(--t-muted);
  background: transparent;
  border: 1px solid var(--c-line-strong);
}
.upload-btn.ghost:hover {
  color: var(--danger);
  border-color: var(--danger-line);
  background: var(--danger-soft);
}
.asset-list {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}
.asset-item {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2);
  background: var(--grad-glass);
  border: 1px solid var(--c-glass);
  border-radius: var(--r-md);
  cursor: pointer;
  text-align: left;
}
.asset-item:hover {
  border-color: var(--accent-line);
}
.asset-item.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.asset-icon {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--t-muted);
}
.asset-item.active .asset-icon {
  color: var(--accent-hover);
}
.asset-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.asset-meta strong {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--t-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asset-meta em {
  font-size: var(--fs-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--t-muted);
  font-style: normal;
}
.asset-del {
  display: none;
  color: var(--t-faint);
  padding: var(--s-1);
  margin: calc(-1 * var(--s-1));
  border-radius: var(--r-xs);
}
.asset-item:hover .asset-del {
  display: inline-flex;
}
.asset-del:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.asset-empty {
  font-size: var(--fs-2xs);
  color: var(--t-faint);
  text-align: center;
  padding: var(--s-3) 0 var(--s-2);
  line-height: 1.6;
}

/* ---- HTML 元素导入 ---- */
.html-input {
  width: 100%;
  box-sizing: border-box;
  padding: var(--s-2);
  font-size: var(--fs-xs);
  line-height: 1.6;
  font-family: var(--font-mono);
  color: var(--t-strong);
  background: var(--c-viewport);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  resize: vertical;
}
.html-row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-2);
  font-size: var(--fs-xs);
  color: var(--t-muted);
}
.html-row label {
  flex-shrink: 0;
}
.html-row input[type='number'] {
  width: 64px;
  height: var(--h-ctrl);
  padding: 0 var(--s-2);
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
}
.html-row select {
  flex: 1;
  height: var(--h-ctrl);
  font-size: var(--fs-sm);
}
.html-tip {
  margin: var(--s-2) 0 0;
  font-size: var(--fs-2xs);
  line-height: 1.7;
  color: var(--t-faint);
}
.html-tip code {
  font-family: var(--font-mono);
  font-size: var(--fs-2xs);
  color: var(--t-muted);
}
.html-check {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-2);
  font-size: var(--fs-xs);
  line-height: 1.5;
  color: var(--t-muted);
  cursor: pointer;
}
.html-check input {
  flex-shrink: 0;
}

/* ---- 环境天空盒 ---- */
.env-fields {
  margin: var(--s-1) 0 var(--s-2);
  border-top: 1px solid var(--c-line);
  padding-top: var(--s-2);
}
.env-field {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-bottom: var(--s-1);
  font-size: var(--fs-xs);
}
.env-label {
  width: 88px;
  flex-shrink: 0;
  color: var(--t-muted);
}
.env-field input[type='number'] {
  flex: 1;
  min-width: 0;
  height: var(--h-ctrl);
  padding: 0 var(--s-2);
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
}
.env-switch {
  display: flex;
  align-items: center;
  gap: var(--s-1);
  color: var(--t-body);
  cursor: pointer;
}
</style>
